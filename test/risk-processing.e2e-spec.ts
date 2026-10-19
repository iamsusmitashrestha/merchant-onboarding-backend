import request from 'supertest';
import { SeedUserKey } from '../src/database/seeds/seed-users';
import { ApplicationStatus } from '../src/modules/applications/enums/application-status.enum';
import { RiskStatus } from '../src/modules/applications/enums/risk-status.enum';
import { RiskAssessment } from '../src/modules/applications/risk-review/risk-assessment.entity';
import {
  riskReviewJobId,
  RiskReviewOutcome,
} from '../src/modules/applications/risk-review/risk-review.constants';
import { RiskReviewProcessor } from '../src/modules/applications/risk-review/risk-review.processor';
import { RiskReviewService } from '../src/modules/applications/risk-review/risk-review.service';
import { AuditAction } from '../src/modules/audit/audit-action.enum';
import { AuditLog } from '../src/modules/audit/audit-log.entity';
import { NonUserActorRole } from '../src/modules/audit/audit-actor-role.enum';
import { RiskLevel } from '../src/modules/risk/risk-level.enum';
import {
  PermanentProviderError,
  RISK_PROVIDER,
  RiskAssessmentInput,
  RiskAssessmentResult,
  RiskProvider,
  TransientProviderError,
} from '../src/modules/risk/risk-provider';
import { scoreApplication } from '../src/modules/risk/simulated-kyb.provider';
import { bearer, loginAs } from './helpers/auth';
import {
  ApplicationBody,
  createApplication,
  forceState,
  waitFor,
} from './helpers/fixtures';
import {
  createTestApp,
  resetState,
  SeededUsers,
  seedUsers,
  TestContext,
} from './helpers/test-app';

// Stands in for the third-party KYB API; each test picks how it behaves.
class ControllableProvider implements RiskProvider {
  mode: 'succeed' | 'transient' | 'permanent' = 'succeed';
  calls = 0;

  assess(input: RiskAssessmentInput): Promise<RiskAssessmentResult> {
    this.calls += 1;
    if (this.mode === 'transient') {
      return Promise.reject(new TransientProviderError('stub outage'));
    }
    if (this.mode === 'permanent') {
      return Promise.reject(new PermanentProviderError('stub rejection'));
    }
    return Promise.resolve(scoreApplication(input));
  }
}

describe('async risk review (e2e)', () => {
  const provider = new ControllableProvider();
  let ctx: TestContext;
  let users: SeededUsers;
  const tokens = {} as Record<SeedUserKey, string>;

  beforeAll(async () => {
    ctx = await createTestApp((builder) =>
      builder.overrideProvider(RISK_PROVIDER).useValue(provider),
    );
    users = await seedUsers(ctx.dataSource);
    for (const key of Object.keys(users) as SeedUserKey[]) {
      tokens[key] = await loginAs(ctx.http, users[key].email);
    }
  });

  beforeEach(async () => {
    await resetState(ctx);
    provider.mode = 'succeed';
    provider.calls = 0;
  });

  afterAll(() => ctx.app.close());

  const submit = (id: string, who: SeedUserKey = 'sales') =>
    request(ctx.http)
      .post(`/applications/${id}/submit`)
      .set(bearer(tokens[who]));

  const retry = (id: string, who: SeedUserKey = 'admin') =>
    request(ctx.http)
      .post(`/applications/${id}/risk-review/retry`)
      .set(bearer(tokens[who]));

  const getApplication = async (id: string): Promise<ApplicationBody> =>
    (
      await request(ctx.http)
        .get(`/applications/${id}`)
        .set(bearer(tokens.admin))
        .expect(200)
    ).body;

  const waitForApplication = (
    id: string,
    done: (app: ApplicationBody) => boolean,
  ) => waitFor(() => getApplication(id), done);

  const assessmentsFor = (applicationId: string) =>
    ctx.dataSource.getRepository(RiskAssessment).findBy({ applicationId });

  const auditFor = (entityId: string) =>
    ctx.dataSource
      .getRepository(AuditLog)
      .find({ where: { entityId }, order: { createdAt: 'ASC' } });

  describe('happy path', () => {
    it('submit queues one job holding ids only, and the worker moves the application to IN_REVIEW', async () => {
      const app = await createApplication(ctx.http, tokens.sales);

      const res = await submit(app.id).expect(200);
      expect(res.body).toMatchObject({
        status: ApplicationStatus.SUBMITTED,
        riskStatus: RiskStatus.PENDING,
        submissionVersion: 1,
      });

      const job = await ctx.queue.getJob(riskReviewJobId(app.id, 1));
      expect(job?.data).toEqual({
        applicationId: app.id,
        submissionVersion: 1,
      });

      const reviewed = await waitForApplication(
        app.id,
        (a) => a.status === ApplicationStatus.IN_REVIEW,
      );
      expect(reviewed.riskStatus).toBe(RiskStatus.COMPLETED);
      expect(Object.values(RiskLevel)).toContain(reviewed.riskLevel);
      expect(await assessmentsFor(app.id)).toHaveLength(1);

      const completed = (await auditFor(app.id)).find(
        (row) => row.action === AuditAction.RISK_ASSESSMENT_COMPLETED,
      );
      expect(completed).toMatchObject({
        actorId: null,
        actorRole: NonUserActorRole.SYSTEM,
      });
    });

    it('rates a gambling MCC as HIGH risk', async () => {
      const app = await createApplication(ctx.http, tokens.sales, {
        mcc: '7995',
      });
      await submit(app.id).expect(200);

      const reviewed = await waitForApplication(
        app.id,
        (a) => a.status === ApplicationStatus.IN_REVIEW,
      );
      expect(reviewed.riskLevel).toBe(RiskLevel.HIGH);
    });
  });

  describe('idempotency', () => {
    it('rejects a second submit (409), so the provider is called once', async () => {
      const app = await createApplication(ctx.http, tokens.sales);

      await submit(app.id).expect(200);
      await submit(app.id).expect(409);
      await waitForApplication(
        app.id,
        (a) => a.status === ApplicationStatus.IN_REVIEW,
      );

      expect(provider.calls).toBe(1);
      expect(await assessmentsFor(app.id)).toHaveLength(1);
    });

    it('re-running a finished job is a no-op', async () => {
      const app = await createApplication(ctx.http, tokens.sales);
      await submit(app.id).expect(200);
      await waitForApplication(
        app.id,
        (a) => a.status === ApplicationStatus.IN_REVIEW,
      );

      const job = await ctx.queue.getJob(riskReviewJobId(app.id, 1));
      const outcome = await ctx.app.get(RiskReviewProcessor).process(job!);

      expect(outcome).toBe(RiskReviewOutcome.SKIPPED_STALE);
      expect(provider.calls).toBe(1);
      expect(await assessmentsFor(app.id)).toHaveLength(1);
    });

    it('two workers completing the same submission at once store one assessment', async () => {
      const app = await createApplication(ctx.http, tokens.sales);
      await forceState(ctx.dataSource, app.id, {
        status: ApplicationStatus.SUBMITTED,
        riskStatus: RiskStatus.PENDING,
        submissionVersion: 1,
      });
      const reviews = ctx.app.get(RiskReviewService);
      const jobData = { applicationId: app.id, submissionVersion: 1 };
      const result = scoreApplication({
        applicationId: app.id,
        legalBusinessName: 'Acme Test Shop LLC',
        businessType: 'LLC',
        mcc: '5734',
        expectedMonthlyVolumeMinor: 5_000_000,
      });

      const outcomes = await Promise.all([
        reviews.complete(jobData, result),
        reviews.complete(jobData, result),
      ]);

      expect(outcomes.sort()).toEqual([
        RiskReviewOutcome.COMPLETED,
        RiskReviewOutcome.SKIPPED_STALE,
      ]);
      expect(await assessmentsFor(app.id)).toHaveLength(1);
    });
  });

  describe('failures and recovery', () => {
    it('retries a transient failure with backoff, then marks the review FAILED; an ADMIN retry completes it', async () => {
      provider.mode = 'transient';
      const app = await createApplication(ctx.http, tokens.sales);
      await submit(app.id).expect(200);

      const failed = await waitForApplication(
        app.id,
        (a) => a.riskStatus === RiskStatus.FAILED,
      );
      expect(failed.status).toBe(ApplicationStatus.SUBMITTED);
      expect(provider.calls).toBe(3); // RISK_JOB_ATTEMPTS in .env.test
      const failedAudit = (await auditFor(app.id)).find(
        (row) => row.action === AuditAction.RISK_ASSESSMENT_FAILED,
      );
      expect(failedAudit?.metadata).toMatchObject({
        errorClass: 'TransientProviderError',
        attempts: 3,
      });

      provider.mode = 'succeed';
      const retried = await retry(app.id).expect(200);
      expect(retried.body.riskStatus).toBe(RiskStatus.PENDING);

      const reviewed = await waitForApplication(
        app.id,
        (a) => a.status === ApplicationStatus.IN_REVIEW,
      );
      expect(reviewed.submissionVersion).toBe(1);
      expect(await assessmentsFor(app.id)).toHaveLength(1);
      expect((await auditFor(app.id)).map((row) => row.action)).toContain(
        AuditAction.RISK_REVIEW_RETRIED,
      );
    });

    it('two simultaneous ADMIN retries both succeed, and the review completes once', async () => {
      provider.mode = 'transient';
      const app = await createApplication(ctx.http, tokens.sales);
      await submit(app.id).expect(200);
      await waitForApplication(
        app.id,
        (a) => a.riskStatus === RiskStatus.FAILED,
      );

      provider.mode = 'succeed';
      const responses = await Promise.all([retry(app.id), retry(app.id)]);

      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      await waitForApplication(
        app.id,
        (a) => a.status === ApplicationStatus.IN_REVIEW,
      );
      expect(await assessmentsFor(app.id)).toHaveLength(1);
    });

    it('does not retry a permanent provider error', async () => {
      provider.mode = 'permanent';
      const app = await createApplication(ctx.http, tokens.sales);
      await submit(app.id).expect(200);

      await waitForApplication(
        app.id,
        (a) => a.riskStatus === RiskStatus.FAILED,
      );
      expect(provider.calls).toBe(1);
    });

    it('recovers a submission whose job was never queued', async () => {
      const app = await createApplication(ctx.http, tokens.sales);
      await forceState(ctx.dataSource, app.id, {
        status: ApplicationStatus.SUBMITTED,
        riskStatus: RiskStatus.PENDING,
        submissionVersion: 1,
      });
      expect(
        await ctx.queue.getJob(riskReviewJobId(app.id, 1)),
      ).toBeUndefined();

      await retry(app.id).expect(200);

      await waitForApplication(
        app.id,
        (a) => a.status === ApplicationStatus.IN_REVIEW,
      );
      expect(await assessmentsFor(app.id)).toHaveLength(1);
    });

    it('rejects a retry once the review has completed (409)', async () => {
      const app = await createApplication(ctx.http, tokens.sales);
      await submit(app.id).expect(200);
      await waitForApplication(
        app.id,
        (a) => a.status === ApplicationStatus.IN_REVIEW,
      );

      await retry(app.id).expect(409);
    });
  });
});

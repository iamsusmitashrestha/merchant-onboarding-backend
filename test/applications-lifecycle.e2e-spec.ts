import { randomUUID } from 'crypto';
import request from 'supertest';
import { SeedUserKey } from '../src/database/seeds/seed-users';
import { ApplicationStatus } from '../src/modules/applications/enums/application-status.enum';
import { ReviewDecision } from '../src/modules/applications/enums/review-decision.enum';
import { RiskStatus } from '../src/modules/applications/enums/risk-status.enum';
import { RiskAssessment } from '../src/modules/applications/risk-review/risk-assessment.entity';
import { bearer, loginAs } from './helpers/auth';
import {
  ApplicationBody,
  applicationInput,
  createApplication,
  findApplication,
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

describe('application lifecycle (e2e)', () => {
  let ctx: TestContext;
  let users: SeededUsers;
  const tokens = {} as Record<SeedUserKey, string>;

  beforeAll(async () => {
    ctx = await createTestApp();
    users = await seedUsers(ctx.dataSource);
    for (const key of Object.keys(users) as SeedUserKey[]) {
      tokens[key] = await loginAs(ctx.http, users[key].email);
    }
  });

  beforeEach(() => resetState(ctx));

  afterAll(() => ctx.app.close());

  describe('create and read', () => {
    it('creates a DRAFT with masked sensitive fields', async () => {
      const app = await createApplication(ctx.http, tokens.sales);

      expect(app).toMatchObject({
        status: ApplicationStatus.DRAFT,
        riskStatus: RiskStatus.NOT_STARTED,
        version: 1,
        submissionVersion: 0,
        createdById: users.sales.id,
        assignedReviewerId: null,
        taxId: '******0001',
        ownerPhone: '*******0100',
        expectedMonthlyVolumeMinor: 5_000_000,
      });

      const row = await findApplication(ctx.dataSource, app.id);
      expect(row.taxId).toBe('00-0000001');
    });

    it('returns the application by id to its owner and to ADMIN', async () => {
      const app = await createApplication(ctx.http, tokens.sales);

      for (const who of ['sales', 'admin'] as const) {
        const res = await request(ctx.http)
          .get(`/applications/${app.id}`)
          .set(bearer(tokens[who]))
          .expect(200);
        expect(res.body.id).toBe(app.id);
      }
    });

    it('returns 404 for an unknown id and 400 for a malformed id', async () => {
      await request(ctx.http)
        .get(`/applications/${randomUUID()}`)
        .set(bearer(tokens.admin))
        .expect(404);
      await request(ctx.http)
        .get('/applications/not-a-uuid')
        .set(bearer(tokens.admin))
        .expect(400);
    });
  });

  describe('validation', () => {
    it('rejects missing required fields with field messages', async () => {
      const res = await request(ctx.http)
        .post('/applications')
        .set(bearer(tokens.sales))
        .send({ businessName: 'Only a name' })
        .expect(400);

      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('legalBusinessName')]),
      );
    });

    it.each([
      ['businessType', 'SPACESHIP'],
      ['mcc', '12'],
      ['currency', 'XXXX'],
      ['ownerEmail', 'not-an-email'],
      ['expectedMonthlyVolumeMinor', -1],
      ['averageTicketMinor', 1.5],
    ])('rejects an invalid %s', async (field, value) => {
      await request(ctx.http)
        .post('/applications')
        .set(bearer(tokens.sales))
        .send(applicationInput({ [field]: value }))
        .expect(400);
    });
  });

  describe('update', () => {
    it('updates while DRAFT and bumps the version', async () => {
      const app = await createApplication(ctx.http, tokens.sales);

      const res = await request(ctx.http)
        .patch(`/applications/${app.id}`)
        .set(bearer(tokens.sales))
        .send({ businessName: 'Acme Renamed', expectedVersion: app.version })
        .expect(200);

      expect(res.body.businessName).toBe('Acme Renamed');
      expect(res.body.version).toBe(app.version + 1);
    });

    it('rejects a stale expectedVersion with 409 and keeps the row unchanged', async () => {
      const app = await createApplication(ctx.http, tokens.sales);
      await request(ctx.http)
        .patch(`/applications/${app.id}`)
        .set(bearer(tokens.admin))
        .send({ businessName: 'Edited by admin', expectedVersion: 1 })
        .expect(200);

      await request(ctx.http)
        .patch(`/applications/${app.id}`)
        .set(bearer(tokens.sales))
        .send({ businessName: 'Stale edit', expectedVersion: 1 })
        .expect(409);

      const row = await findApplication(ctx.dataSource, app.id);
      expect(row.businessName).toBe('Edited by admin');
    });

    it('requires expectedVersion (400)', async () => {
      const app = await createApplication(ctx.http, tokens.sales);
      await request(ctx.http)
        .patch(`/applications/${app.id}`)
        .set(bearer(tokens.sales))
        .send({ businessName: 'No version' })
        .expect(400);
    });

    it('does not bump the version when nothing changed', async () => {
      const app = await createApplication(ctx.http, tokens.sales);
      const res = await request(ctx.http)
        .patch(`/applications/${app.id}`)
        .set(bearer(tokens.sales))
        .send({ businessName: 'Acme Test Shop', expectedVersion: app.version })
        .expect(200);
      expect(res.body.version).toBe(app.version);
    });

    it.each([
      ApplicationStatus.SUBMITTED,
      ApplicationStatus.IN_REVIEW,
      ApplicationStatus.APPROVED,
    ])('rejects updates while %s (409)', async (status) => {
      const app = await createApplication(ctx.http, tokens.sales);
      await forceState(ctx.dataSource, app.id, { status });

      await request(ctx.http)
        .patch(`/applications/${app.id}`)
        .set(bearer(tokens.sales))
        .send({ businessName: 'Too late', expectedVersion: app.version })
        .expect(409);
    });

    it('allows updates again after info was requested', async () => {
      const app = await createApplication(ctx.http, tokens.sales);
      const { version } = await forceState(ctx.dataSource, app.id, {
        status: ApplicationStatus.INFO_REQUESTED,
      });

      await request(ctx.http)
        .patch(`/applications/${app.id}`)
        .set(bearer(tokens.sales))
        .send({ taxId: '00-0000002', expectedVersion: version })
        .expect(200);
    });
  });

  describe('assign reviewer', () => {
    const assign = (id: string, reviewerId: string, expectedVersion?: number) =>
      request(ctx.http)
        .post(`/applications/${id}/assign`)
        .set(bearer(tokens.admin))
        .send({ reviewerId, expectedVersion });

    async function submittedApplication() {
      const app = await createApplication(ctx.http, tokens.sales);
      return forceState(ctx.dataSource, app.id, {
        status: ApplicationStatus.SUBMITTED,
      });
    }

    it('assigns an active REVIEWER while SUBMITTED and bumps the version', async () => {
      const app = await submittedApplication();

      const res = await assign(app.id, users.reviewer.id, app.version).expect(
        200,
      );

      expect(res.body.assignedReviewerId).toBe(users.reviewer.id);
      expect(res.body.version).toBe(app.version + 1);
    });

    it('cannot assign a DRAFT (409)', async () => {
      const app = await createApplication(ctx.http, tokens.sales);
      await assign(app.id, users.reviewer.id, app.version).expect(409);
    });

    it('requires expectedVersion (400)', async () => {
      const app = await submittedApplication();
      await assign(app.id, users.reviewer.id).expect(400);
    });

    it('rejects a stale expectedVersion (409) and keeps the current assignee', async () => {
      const app = await submittedApplication();
      await assign(app.id, users.reviewer.id, app.version).expect(200);

      await assign(app.id, users.reviewer2.id, app.version).expect(409);

      const row = await findApplication(ctx.dataSource, app.id);
      expect(row.assignedReviewerId).toBe(users.reviewer.id);
    });

    it('lets only one of two simultaneous reassignments win; the other gets 409', async () => {
      const app = await submittedApplication();

      const responses = await Promise.all([
        assign(app.id, users.reviewer.id, app.version),
        assign(app.id, users.reviewer2.id, app.version),
      ]);

      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      const winner = responses.find((r) => r.status === 200)!;
      const row = await findApplication(ctx.dataSource, app.id);
      expect(row.assignedReviewerId).toBe(winner.body.assignedReviewerId);
    });

    it.each([
      ['a SALES user', () => users.sales.id],
      ['an unknown user', () => randomUUID()],
    ])('rejects %s as the assignee (400)', async (_label, reviewerId) => {
      const app = await submittedApplication();

      const res = await assign(app.id, reviewerId(), app.version).expect(400);

      expect(res.body.message).toBe(
        'reviewerId must belong to an active REVIEWER',
      );
    });
  });

  describe('decision', () => {
    async function inReviewAssignedToReviewer() {
      const app = await createApplication(ctx.http, tokens.sales);
      await forceState(ctx.dataSource, app.id, {
        status: ApplicationStatus.IN_REVIEW,
        assignedReviewerId: users.reviewer.id,
      });
      return app;
    }

    function decide(id: string, decision: ReviewDecision) {
      return request(ctx.http)
        .post(`/applications/${id}/decision`)
        .set(bearer(tokens.reviewer))
        .send({ decision, reason: 'Reviewed against KYB results' });
    }

    it.each([
      [ReviewDecision.APPROVE, ApplicationStatus.APPROVED, true],
      [ReviewDecision.REJECT, ApplicationStatus.REJECTED, true],
      [ReviewDecision.REQUEST_INFO, ApplicationStatus.INFO_REQUESTED, false],
    ])('%s moves IN_REVIEW to %s', async (decision, status, decided) => {
      const app = await inReviewAssignedToReviewer();

      const res = await decide(app.id, decision).expect(200);

      expect(res.body.status).toBe(status);
      expect(res.body.decisionReason).toBe('Reviewed against KYB results');
      expect(res.body.decidedAt !== null).toBe(decided);
    });

    it('treats APPROVED as terminal (409 on a second decision)', async () => {
      const app = await inReviewAssignedToReviewer();
      await decide(app.id, ReviewDecision.APPROVE).expect(200);
      await decide(app.id, ReviewDecision.REJECT).expect(409);
    });

    it('rejects a decision before the risk review finished (409)', async () => {
      const app = await createApplication(ctx.http, tokens.sales);
      await forceState(ctx.dataSource, app.id, {
        status: ApplicationStatus.SUBMITTED,
        assignedReviewerId: users.reviewer.id,
      });
      await decide(app.id, ReviewDecision.APPROVE).expect(409);
    });

    it('requires a reason (400)', async () => {
      const app = await inReviewAssignedToReviewer();
      await request(ctx.http)
        .post(`/applications/${app.id}/decision`)
        .set(bearer(tokens.reviewer))
        .send({ decision: ReviewDecision.APPROVE })
        .expect(400);
    });
  });

  describe('list', () => {
    it('paginates newest first and reports the total', async () => {
      const first = await createApplication(ctx.http, tokens.sales);
      const second = await createApplication(ctx.http, tokens.sales);
      const third = await createApplication(ctx.http, tokens.sales);

      const page1 = await request(ctx.http)
        .get('/applications')
        .query({ page: 1, limit: 2 })
        .set(bearer(tokens.sales))
        .expect(200);
      const page2 = await request(ctx.http)
        .get('/applications')
        .query({ page: 2, limit: 2 })
        .set(bearer(tokens.sales))
        .expect(200);

      const ids = (res: request.Response) =>
        res.body.data.map((a: { id: string }) => a.id);
      expect(ids(page1)).toEqual([third.id, second.id]);
      expect(ids(page2)).toEqual([first.id]);
      expect(page1.body.meta).toEqual({ page: 1, limit: 2, total: 3 });
    });

    it('filters by status', async () => {
      const draft = await createApplication(ctx.http, tokens.sales);
      const submitted = await createApplication(ctx.http, tokens.sales);
      await forceState(ctx.dataSource, submitted.id, {
        status: ApplicationStatus.SUBMITTED,
      });

      const res = await request(ctx.http)
        .get('/applications')
        .query({ status: ApplicationStatus.DRAFT })
        .set(bearer(tokens.admin))
        .expect(200);

      expect(res.body.data.map((a: { id: string }) => a.id)).toEqual([
        draft.id,
      ]);
    });

    it.each([[{ limit: 101 }], [{ page: 0 }], [{ status: 'NOPE' }]])(
      'rejects invalid query %j (400)',
      async (query) => {
        await request(ctx.http)
          .get('/applications')
          .query(query)
          .set(bearer(tokens.admin))
          .expect(400);
      },
    );
  });

  describe('full flow through the real submit and risk review', () => {
    const as = (who: SeedUserKey) => bearer(tokens[who]);

    async function waitForStatus(id: string, status: ApplicationStatus) {
      return waitFor(
        async () =>
          (
            await request(ctx.http)
              .get(`/applications/${id}`)
              .set(as('admin'))
              .expect(200)
          ).body as ApplicationBody,
        (app) => app.status === status,
      );
    }

    it('draft → submit → risk review → request info → edit → resubmit → approve, then terminal', async () => {
      const draft = await createApplication(ctx.http, tokens.sales);

      const edited = await request(ctx.http)
        .patch(`/applications/${draft.id}`)
        .set(as('sales'))
        .send({
          businessName: 'Acme Flow Shop',
          expectedVersion: draft.version,
        })
        .expect(200);

      const submitted = await request(ctx.http)
        .post(`/applications/${draft.id}/submit`)
        .set(as('sales'))
        .expect(200);
      expect(submitted.body).toMatchObject({
        status: ApplicationStatus.SUBMITTED,
        riskStatus: RiskStatus.PENDING,
        submissionVersion: 1,
      });

      await request(ctx.http)
        .patch(`/applications/${draft.id}`)
        .set(as('sales'))
        .send({
          businessName: 'Too late',
          expectedVersion: submitted.body.version,
        })
        .expect(409);

      const inReview = await waitForStatus(
        draft.id,
        ApplicationStatus.IN_REVIEW,
      );

      await request(ctx.http)
        .post(`/applications/${draft.id}/assign`)
        .set(as('admin'))
        .send({
          reviewerId: users.reviewer.id,
          expectedVersion: inReview.version,
        })
        .expect(200);

      const infoRequested = await request(ctx.http)
        .post(`/applications/${draft.id}/decision`)
        .set(as('reviewer'))
        .send({
          decision: ReviewDecision.REQUEST_INFO,
          reason: 'Need a direct phone line',
        })
        .expect(200);
      expect(infoRequested.body.status).toBe(ApplicationStatus.INFO_REQUESTED);

      await request(ctx.http)
        .patch(`/applications/${draft.id}`)
        .set(as('sales'))
        .send({
          ownerPhone: '+1 555 0199',
          expectedVersion: infoRequested.body.version,
        })
        .expect(200);

      const resubmitted = await request(ctx.http)
        .post(`/applications/${draft.id}/submit`)
        .set(as('sales'))
        .expect(200);
      expect(resubmitted.body.submissionVersion).toBe(2);

      await waitForStatus(draft.id, ApplicationStatus.IN_REVIEW);
      const assessments = await ctx.dataSource
        .getRepository(RiskAssessment)
        .find({
          where: { applicationId: draft.id },
          order: { submissionVersion: 'ASC' },
        });
      expect(assessments.map((a) => a.submissionVersion)).toEqual([1, 2]);

      const approved = await request(ctx.http)
        .post(`/applications/${draft.id}/decision`)
        .set(as('reviewer'))
        .send({
          decision: ReviewDecision.APPROVE,
          reason: 'KYB clear after update',
        })
        .expect(200);
      expect(approved.body).toMatchObject({
        status: ApplicationStatus.APPROVED,
        businessName: edited.body.businessName,
        assignedReviewerId: users.reviewer.id,
      });
      expect(approved.body.decidedAt).not.toBeNull();

      // APPROVED is terminal: every further action is a 409.
      await request(ctx.http)
        .post(`/applications/${draft.id}/submit`)
        .set(as('sales'))
        .expect(409);
      await request(ctx.http)
        .patch(`/applications/${draft.id}`)
        .set(as('sales'))
        .send({
          businessName: 'After approval',
          expectedVersion: approved.body.version,
        })
        .expect(409);
      await request(ctx.http)
        .post(`/applications/${draft.id}/assign`)
        .set(as('admin'))
        .send({
          reviewerId: users.reviewer2.id,
          expectedVersion: approved.body.version,
        })
        .expect(409);
      await request(ctx.http)
        .post(`/applications/${draft.id}/decision`)
        .set(as('reviewer'))
        .send({ decision: ReviewDecision.REJECT, reason: 'Changed my mind' })
        .expect(409);
    });

    it('rejects resubmitting while the risk review is still running (409)', async () => {
      const app = await createApplication(ctx.http, tokens.sales);
      await request(ctx.http)
        .post(`/applications/${app.id}/submit`)
        .set(as('sales'))
        .expect(200);
      await request(ctx.http)
        .post(`/applications/${app.id}/submit`)
        .set(as('admin'))
        .expect(409);
    });
  });
});

import request from 'supertest';
import { SeedUserKey } from '../src/database/seeds/seed-users';
import { ApplicationStatus } from '../src/modules/applications/enums/application-status.enum';
import { ReviewDecision } from '../src/modules/applications/enums/review-decision.enum';
import { AuditAction } from '../src/modules/audit/audit-action.enum';
import { NonUserActorRole } from '../src/modules/audit/audit-actor-role.enum';
import { AuditLog } from '../src/modules/audit/audit-log.entity';
import { UserRole } from '../src/modules/users/user-role.enum';
import { bearer, loginAs } from './helpers/auth';
import {
  ApplicationBody,
  createApplication,
  waitFor,
} from './helpers/fixtures';
import {
  createTestApp,
  resetState,
  SeededUsers,
  seedUsers,
  TestContext,
  testPassword,
} from './helpers/test-app';

describe('audit trail and sensitive data (e2e)', () => {
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

  const as = (who: SeedUserKey) => bearer(tokens[who]);

  const auditRows = (entityId?: string) =>
    ctx.dataSource.getRepository(AuditLog).find({
      where: entityId ? { entityId } : {},
      order: { createdAt: 'ASC' },
    });

  async function submitAndWaitForReview(id: string): Promise<ApplicationBody> {
    await request(ctx.http)
      .post(`/applications/${id}/submit`)
      .set(as('sales'))
      .expect(200);
    return waitFor(
      async () =>
        (
          await request(ctx.http)
            .get(`/applications/${id}`)
            .set(as('admin'))
            .expect(200)
        ).body as ApplicationBody,
      (app) => app.status === ApplicationStatus.IN_REVIEW,
    );
  }

  it('records every significant action with the acting user, in order', async () => {
    const app = await createApplication(ctx.http, tokens.sales);
    await request(ctx.http)
      .patch(`/applications/${app.id}`)
      .set(as('sales'))
      .send({ businessName: 'Acme Audited', expectedVersion: app.version })
      .expect(200);
    const reviewed = await submitAndWaitForReview(app.id);
    await request(ctx.http)
      .post(`/applications/${app.id}/assign`)
      .set(as('admin'))
      .send({
        reviewerId: users.reviewer.id,
        expectedVersion: reviewed.version,
      })
      .expect(200);
    await request(ctx.http)
      .post(`/applications/${app.id}/decision`)
      .set(as('reviewer'))
      .send({ decision: ReviewDecision.APPROVE, reason: 'KYB clear' })
      .expect(200);

    const rows = await auditRows(app.id);

    expect(rows.map((r) => [r.action, r.actorRole, r.actorId])).toEqual([
      [AuditAction.APPLICATION_CREATED, UserRole.SALES, users.sales.id],
      [AuditAction.APPLICATION_UPDATED, UserRole.SALES, users.sales.id],
      [AuditAction.APPLICATION_SUBMITTED, UserRole.SALES, users.sales.id],
      [AuditAction.RISK_ASSESSMENT_COMPLETED, NonUserActorRole.SYSTEM, null],
      [AuditAction.REVIEWER_ASSIGNED, UserRole.ADMIN, users.admin.id],
      [AuditAction.DECISION_RECORDED, UserRole.REVIEWER, users.reviewer.id],
    ]);
    const byAction = Object.fromEntries(
      rows.map((r) => [r.action, r.metadata]),
    );
    expect(byAction[AuditAction.APPLICATION_UPDATED]).toEqual({
      changedFields: ['businessName'],
    });
    expect(byAction[AuditAction.REVIEWER_ASSIGNED]).toEqual({
      fromReviewerId: null,
      toReviewerId: users.reviewer.id,
    });
    expect(byAction[AuditAction.DECISION_RECORDED]).toEqual({
      fromStatus: ApplicationStatus.IN_REVIEW,
      toStatus: ApplicationStatus.APPROVED,
      reason: 'KYB clear',
    });
  });

  it('never stores passwords, tokens or raw sensitive values', async () => {
    const wrongPassword = 'Wrong-Password-12345';
    await request(ctx.http)
      .post('/auth/login')
      .send({ email: users.sales.email, password: wrongPassword })
      .expect(401);
    const freshToken = await loginAs(ctx.http, users.sales.email);

    const app = await createApplication(ctx.http, freshToken);
    await request(ctx.http)
      .patch(`/applications/${app.id}`)
      .set(bearer(freshToken))
      .send({
        taxId: '00-0000002',
        ownerPhone: '+1 555 0199',
        expectedVersion: app.version,
      })
      .expect(200);
    await submitAndWaitForReview(app.id);

    const dump = JSON.stringify(await auditRows());
    for (const secret of [
      testPassword(),
      wrongPassword,
      freshToken,
      tokens.sales,
      '00-0000001',
      '00-0000002',
      '+1 555 0100',
      '+1 555 0199',
    ]) {
      expect(dump).not.toContain(secret);
    }

    const updated = (await auditRows(app.id)).find(
      (r) => r.action === AuditAction.APPLICATION_UPDATED,
    );
    expect(updated?.metadata).toEqual({
      changedFields: ['ownerPhone', 'taxId'],
    });
  });

  it('records a failed login as ANONYMOUS with only the email domain', async () => {
    await request(ctx.http)
      .post('/auth/login')
      .send({ email: 'Someone@Unknown.example', password: 'whatever-123' })
      .expect(401);

    const [row] = await auditRows();
    expect(row).toMatchObject({
      action: AuditAction.LOGIN_FAILED,
      actorId: null,
      actorRole: NonUserActorRole.ANONYMOUS,
      entityId: null,
      metadata: { emailDomain: 'unknown.example' },
    });
  });

  it('records a successful login against the user', async () => {
    await loginAs(ctx.http, users.reviewer.email);

    const [row] = await auditRows();
    expect(row).toMatchObject({
      action: AuditAction.LOGIN_SUCCEEDED,
      actorId: users.reviewer.id,
      actorRole: UserRole.REVIEWER,
      entityId: users.reviewer.id,
      metadata: {},
    });
  });

  it('tags audit rows with the request id, so they can be matched to request logs', async () => {
    const res = await request(ctx.http)
      .post('/applications')
      .set(as('sales'))
      .set('x-request-id', 'e2e-audit-request-1')
      .send({
        businessName: 'Acme Traced',
        legalBusinessName: 'Acme Traced LLC',
        businessType: 'LLC',
        ownerName: 'Test Owner',
        ownerEmail: 'owner@example.com',
        ownerPhone: '+1 555 0100',
        taxId: '00-0000001',
        mcc: '5734',
        currency: 'USD',
        expectedMonthlyVolumeMinor: 5_000_000,
        averageTicketMinor: 2_500,
      })
      .expect(201);

    const [row] = await auditRows(res.body.id);
    expect(row.requestId).toBe('e2e-audit-request-1');
  });
});

import request from 'supertest';
import { ApplicationsService } from '../src/modules/applications/applications.service';
import { UserRole } from '../src/modules/users/user-role.enum';
import { ApplicationStatus } from '../src/modules/applications/enums/application-status.enum';
import { ReviewDecision } from '../src/modules/applications/enums/review-decision.enum';
import { RiskStatus } from '../src/modules/applications/enums/risk-status.enum';
import { riskReviewJobId } from '../src/modules/applications/risk-review/risk-review.constants';
import { SeedUserKey } from '../src/database/seeds/seed-users';
import { bearer, loginAs } from './helpers/auth';
import {
  applicationInput,
  createApplication,
  findApplication,
  forceState,
} from './helpers/fixtures';
import {
  createTestApp,
  resetState,
  SeededUsers,
  seedUsers,
  TestContext,
} from './helpers/test-app';

describe('authorization cannot be bypassed', () => {
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

  describe('SALES users only reach their own applications', () => {
    it("cannot read another SALES user's application by id (404)", async () => {
      const app = await createApplication(ctx.http, tokens.sales2);

      await request(ctx.http)
        .get(`/applications/${app.id}`)
        .set(bearer(tokens.sales))
        .expect(404);
    });

    it("cannot update another SALES user's application by id (404), and it stays unchanged", async () => {
      const app = await createApplication(ctx.http, tokens.sales2);

      await request(ctx.http)
        .patch(`/applications/${app.id}`)
        .set(bearer(tokens.sales))
        .send({ businessName: 'Hijacked', expectedVersion: app.version })
        .expect(404);

      const row = await findApplication(ctx.dataSource, app.id);
      expect(row.businessName).toBe('Acme Test Shop');
      expect(row.version).toBe(app.version);
    });

    it('list only their own applications, and meta.total counts only theirs', async () => {
      const own = await createApplication(ctx.http, tokens.sales);
      await createApplication(ctx.http, tokens.sales2);
      await createApplication(ctx.http, tokens.sales2);

      const res = await request(ctx.http)
        .get('/applications')
        .set(bearer(tokens.sales))
        .expect(200);

      expect(res.body.data.map((a: { id: string }) => a.id)).toEqual([own.id]);
      expect(res.body.meta.total).toBe(1);
    });

    it('cannot widen their list with a filter', async () => {
      await createApplication(ctx.http, tokens.sales2);

      const res = await request(ctx.http)
        .get('/applications')
        .query({ status: ApplicationStatus.DRAFT })
        .set(bearer(tokens.sales))
        .expect(200);

      expect(res.body.meta.total).toBe(0);
    });

    it('cannot widen their scope with a caller condition that contains OR', async () => {
      const other = await createApplication(ctx.http, tokens.sales2);
      const service = ctx.app.get(ApplicationsService);

      // Same query builder every endpoint uses, plus a condition a future filter might add.
      const rows = await service['scopedQuery'](ctx.dataSource.manager, {
        id: users.sales.id,
        email: users.sales.email,
        role: UserRole.SALES,
      })
        .andWhere('app.id = :otherId OR app.businessName = :name', {
          otherId: other.id,
          name: 'Acme Test Shop',
        })
        .getMany();

      expect(rows).toEqual([]);
    });

    it('get createdById from the token, never from the body', async () => {
      const app = await createApplication(ctx.http, tokens.sales);
      expect(app.createdById).toBe(users.sales.id);
    });
  });

  describe('REVIEWER users cannot see drafts', () => {
    it('cannot read a draft by id (404)', async () => {
      const app = await createApplication(ctx.http, tokens.sales);

      await request(ctx.http)
        .get(`/applications/${app.id}`)
        .set(bearer(tokens.reviewer))
        .expect(404);
    });

    it('do not get drafts in a list, even when filtering status=DRAFT', async () => {
      await createApplication(ctx.http, tokens.sales);

      const res = await request(ctx.http)
        .get('/applications')
        .query({ status: ApplicationStatus.DRAFT })
        .set(bearer(tokens.reviewer))
        .expect(200);

      expect(res.body.meta.total).toBe(0);
    });
  });

  describe('roles are enforced per route', () => {
    it('REVIEWER cannot create an application (403)', async () => {
      await request(ctx.http)
        .post('/applications')
        .set(bearer(tokens.reviewer))
        .send(applicationInput())
        .expect(403);
    });

    it('REVIEWER cannot update an application (403)', async () => {
      const app = await createApplication(ctx.http, tokens.sales);
      await forceState(ctx.dataSource, app.id, {
        status: ApplicationStatus.INFO_REQUESTED,
      });

      await request(ctx.http)
        .patch(`/applications/${app.id}`)
        .set(bearer(tokens.reviewer))
        .send({ businessName: 'Changed', expectedVersion: app.version })
        .expect(403);
    });

    it.each<SeedUserKey>(['sales', 'reviewer'])(
      '%s cannot assign a reviewer (403)',
      async (who) => {
        const app = await createApplication(ctx.http, tokens.sales);
        const { version } = await forceState(ctx.dataSource, app.id, {
          status: ApplicationStatus.SUBMITTED,
        });

        await request(ctx.http)
          .post(`/applications/${app.id}/assign`)
          .set(bearer(tokens[who]))
          .send({ reviewerId: users.reviewer.id, expectedVersion: version })
          .expect(403);

        const row = await findApplication(ctx.dataSource, app.id);
        expect(row.assignedReviewerId).toBeNull();
      },
    );
  });

  describe('only the assigned REVIEWER records a decision', () => {
    async function applicationInReviewAssignedTo(reviewerId: string) {
      const app = await createApplication(ctx.http, tokens.sales);
      await forceState(ctx.dataSource, app.id, {
        status: ApplicationStatus.IN_REVIEW,
        assignedReviewerId: reviewerId,
      });
      return app;
    }

    it.each<SeedUserKey>(['sales', 'admin', 'reviewer2'])(
      '%s gets 403 and the status is unchanged',
      async (who) => {
        const app = await applicationInReviewAssignedTo(users.reviewer.id);

        await request(ctx.http)
          .post(`/applications/${app.id}/decision`)
          .set(bearer(tokens[who]))
          .send({ decision: ReviewDecision.APPROVE, reason: 'Looks fine' })
          .expect(403);

        const row = await findApplication(ctx.dataSource, app.id);
        expect(row.status).toBe(ApplicationStatus.IN_REVIEW);
      },
    );

    it('the assigned reviewer can approve', async () => {
      const app = await applicationInReviewAssignedTo(users.reviewer.id);

      const res = await request(ctx.http)
        .post(`/applications/${app.id}/decision`)
        .set(bearer(tokens.reviewer))
        .send({ decision: ReviewDecision.APPROVE, reason: 'Looks fine' })
        .expect(200);

      expect(res.body.status).toBe(ApplicationStatus.APPROVED);
    });
  });

  describe('server-owned fields cannot be mass-assigned', () => {
    it.each([
      ['createdById', '00000000-0000-4000-8000-000000000000'],
      ['status', ApplicationStatus.APPROVED],
      ['assignedReviewerId', '00000000-0000-4000-8000-000000000000'],
      ['riskStatus', 'COMPLETED'],
      ['version', 99],
    ])('create rejects %s in the body (400)', async (field, value) => {
      await request(ctx.http)
        .post('/applications')
        .set(bearer(tokens.sales))
        .send(applicationInput({ [field]: value }))
        .expect(400);
    });

    it.each([
      ['status', ApplicationStatus.APPROVED],
      ['createdById', '00000000-0000-4000-8000-000000000000'],
      ['assignedReviewerId', '00000000-0000-4000-8000-000000000000'],
    ])('update rejects %s in the body (400)', async (field, value) => {
      const app = await createApplication(ctx.http, tokens.sales);

      await request(ctx.http)
        .patch(`/applications/${app.id}`)
        .set(bearer(tokens.sales))
        .send({ [field]: value, expectedVersion: app.version })
        .expect(400);

      const row = await findApplication(ctx.dataSource, app.id);
      expect(row.status).toBe(ApplicationStatus.DRAFT);
      expect(row.createdById).toBe(users.sales.id);
    });
  });

  describe('users and risk results', () => {
    it.each<SeedUserKey>(['sales', 'reviewer'])(
      '%s cannot list users (403)',
      async (who) => {
        await request(ctx.http)
          .get('/users')
          .set(bearer(tokens[who]))
          .expect(403);
      },
    );

    it('SALES cannot read risk assessments, even for their own application (403)', async () => {
      const app = await createApplication(ctx.http, tokens.sales);

      await request(ctx.http)
        .get(`/applications/${app.id}/risk-assessments`)
        .set(bearer(tokens.sales))
        .expect(403);
    });

    it("REVIEWER cannot read a draft's risk assessments (404, same scope as the application)", async () => {
      const app = await createApplication(ctx.http, tokens.sales);

      await request(ctx.http)
        .get(`/applications/${app.id}/risk-assessments`)
        .set(bearer(tokens.reviewer))
        .expect(404);
    });
  });

  describe('submit and risk-review retry', () => {
    it("SALES cannot submit another SALES user's application (404), and nothing is queued", async () => {
      const app = await createApplication(ctx.http, tokens.sales2);

      await request(ctx.http)
        .post(`/applications/${app.id}/submit`)
        .set(bearer(tokens.sales))
        .expect(404);

      const row = await findApplication(ctx.dataSource, app.id);
      expect(row.status).toBe(ApplicationStatus.DRAFT);
      expect(row.submissionVersion).toBe(0);
      expect(
        await ctx.queue.getJob(riskReviewJobId(app.id, 1)),
      ).toBeUndefined();
    });

    it('REVIEWER cannot submit an application (403)', async () => {
      const app = await createApplication(ctx.http, tokens.sales);

      await request(ctx.http)
        .post(`/applications/${app.id}/submit`)
        .set(bearer(tokens.reviewer))
        .expect(403);
    });

    it.each<SeedUserKey>(['sales', 'reviewer'])(
      '%s cannot retry a risk review (403), and nothing is queued',
      async (who) => {
        const app = await createApplication(ctx.http, tokens.sales);
        await forceState(ctx.dataSource, app.id, {
          status: ApplicationStatus.SUBMITTED,
          riskStatus: RiskStatus.FAILED,
          submissionVersion: 1,
        });

        await request(ctx.http)
          .post(`/applications/${app.id}/risk-review/retry`)
          .set(bearer(tokens[who]))
          .expect(403);

        const row = await findApplication(ctx.dataSource, app.id);
        expect(row.riskStatus).toBe(RiskStatus.FAILED);
        expect(
          await ctx.queue.getJob(riskReviewJobId(app.id, 1)),
        ).toBeUndefined();
      },
    );

    it('REVIEWER can read an application once it has left DRAFT', async () => {
      const app = await createApplication(ctx.http, tokens.sales);
      await forceState(ctx.dataSource, app.id, {
        status: ApplicationStatus.SUBMITTED,
      });

      await request(ctx.http)
        .get(`/applications/${app.id}`)
        .set(bearer(tokens.reviewer))
        .expect(200);
    });
  });
});

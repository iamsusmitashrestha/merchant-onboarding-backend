import { randomUUID } from 'crypto';
import request from 'supertest';
import { UserRole } from '../src/modules/users/user-role.enum';
import { User } from '../src/modules/users/user.entity';
import { bearer, loginAs, signToken, unsignedToken } from './helpers/auth';
import {
  createTestApp,
  resetState,
  SeededUsers,
  seedUsers,
  TestContext,
  testPassword,
} from './helpers/test-app';

describe('auth (e2e)', () => {
  let ctx: TestContext;
  let users: SeededUsers;

  beforeAll(async () => {
    ctx = await createTestApp();
    users = await seedUsers(ctx.dataSource);
  });

  beforeEach(() => resetState(ctx));

  afterAll(() => ctx.app.close());

  describe('POST /auth/login', () => {
    it('issues a short-lived bearer token for valid credentials', async () => {
      const res = await request(ctx.http)
        .post('/auth/login')
        .send({ email: users.sales.email, password: testPassword() })
        .expect(200);

      expect(res.body).toEqual({
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        expiresIn: 900,
      });
    });

    it('returns the same 401 for a wrong password and an unknown email', async () => {
      const wrongPassword = await request(ctx.http)
        .post('/auth/login')
        .send({ email: users.sales.email, password: 'not-the-password' })
        .expect(401);
      const unknownEmail = await request(ctx.http)
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'not-the-password' })
        .expect(401);

      expect(wrongPassword.body.message).toBe('Invalid credentials');
      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
    });

    it('throttles repeated attempts for one email from one client (429), without locking out other emails', async () => {
      const limit = Number(process.env.LOGIN_THROTTLE_LIMIT);
      const attempt = (email: string) =>
        request(ctx.http)
          .post('/auth/login')
          .send({ email, password: 'not-the-password' });

      for (let i = 0; i < limit; i++) {
        await attempt('brute-force@example.com').expect(401);
      }
      const blocked = await attempt('brute-force@example.com').expect(429);
      expect(blocked.headers['retry-after']).toBeDefined();

      await attempt('someone-else@example.com').expect(401);
    });

    it('rejects a body with extra fields such as a role', async () => {
      await request(ctx.http)
        .post('/auth/login')
        .send({
          email: users.sales.email,
          password: testPassword(),
          role: UserRole.ADMIN,
        })
        .expect(400);
    });
  });

  describe('protected routes', () => {
    it('accept a valid token', async () => {
      const token = await loginAs(ctx.http, users.sales.email);
      await request(ctx.http)
        .get('/applications')
        .set(bearer(token))
        .expect(200);
    });

    it('reject a request without a token', async () => {
      await request(ctx.http).get('/applications').expect(401);
    });

    it('reject a malformed token', async () => {
      await request(ctx.http)
        .get('/applications')
        .set(bearer('not-a-jwt'))
        .expect(401);
    });

    it('reject an expired token', async () => {
      const expired = signToken({
        sub: users.sales.id,
        role: UserRole.SALES,
        exp: Math.floor(Date.now() / 1000) - 60,
      });
      await request(ctx.http)
        .get('/applications')
        .set(bearer(expired))
        .expect(401);
    });

    it('reject a token signed with a different secret', async () => {
      const forged = signToken(
        { sub: users.admin.id, role: UserRole.ADMIN },
        'a-different-secret-that-is-at-least-32-chars',
      );
      await request(ctx.http)
        .get('/applications')
        .set(bearer(forged))
        .expect(401);
    });

    it('reject an unsigned alg=none token', async () => {
      const unsigned = unsignedToken({
        sub: users.admin.id,
        role: UserRole.ADMIN,
      });
      await request(ctx.http)
        .get('/applications')
        .set(bearer(unsigned))
        .expect(401);
    });

    it("reject a deactivated user's still-valid token", async () => {
      const token = await loginAs(ctx.http, users.sales2.email);
      const repo = ctx.dataSource.getRepository(User);
      await repo.update(users.sales2.id, { active: false });
      try {
        await request(ctx.http)
          .get('/applications')
          .set(bearer(token))
          .expect(401);
      } finally {
        await repo.update(users.sales2.id, { active: true });
      }
    });

    it('take the role from the database, not from the token', async () => {
      // Correctly signed, but claims ADMIN for a SALES user.
      const token = signToken({ sub: users.sales.id, role: UserRole.ADMIN });
      await request(ctx.http)
        .post(`/applications/${randomUUID()}/assign`)
        .set(bearer(token))
        .send({ reviewerId: users.reviewer.id, expectedVersion: 1 })
        .expect(403);
    });
  });
});

import request from 'supertest';
import { createTestApp, TestContext } from './helpers/test-app';

describe('platform (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(() => ctx.app.close());

  describe('x-request-id', () => {
    it('echoes the caller’s request id on a successful response', async () => {
      const res = await request(ctx.http)
        .get('/health')
        .set('x-request-id', 'e2e-platform-1')
        .expect(200);

      expect(res.headers['x-request-id']).toBe('e2e-platform-1');
    });

    it('also sets it on errors rejected by a guard, matching the error body', async () => {
      const res = await request(ctx.http)
        .get('/applications')
        .set('x-request-id', 'e2e-platform-2')
        .expect(401);

      expect(res.headers['x-request-id']).toBe('e2e-platform-2');
      expect(res.body.requestId).toBe('e2e-platform-2');
    });

    it('generates one when the caller sends none', async () => {
      const res = await request(ctx.http).get('/health').expect(200);

      expect(res.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  it('serves the OpenAPI document outside production', async () => {
    const res = await request(ctx.http).get('/docs-json').expect(200);

    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining(['/applications/{id}/risk-assessments', '/users']),
    );
  });
});

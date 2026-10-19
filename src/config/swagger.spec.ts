import { NodeEnv } from './env.validation';
import { swaggerEnabled } from './swagger';

describe('swaggerEnabled', () => {
  it.each([NodeEnv.Development, NodeEnv.Test])(
    'is on by default in %s',
    (env) => {
      expect(swaggerEnabled(env)).toBe(true);
    },
  );

  it('is off by default in production', () => {
    expect(swaggerEnabled(NodeEnv.Production)).toBe(false);
  });

  it('follows an explicit SWAGGER_ENABLED either way', () => {
    expect(swaggerEnabled(NodeEnv.Production, 'true')).toBe(true);
    expect(swaggerEnabled(NodeEnv.Development, 'false')).toBe(false);
  });
});

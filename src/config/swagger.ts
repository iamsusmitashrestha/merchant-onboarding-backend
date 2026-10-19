import { NodeEnv } from './env.validation';

// Explicit SWAGGER_ENABLED wins; otherwise the docs are on everywhere but production.
export function swaggerEnabled(nodeEnv: NodeEnv, flag?: string): boolean {
  if (flag !== undefined) return flag === 'true';
  return nodeEnv !== NodeEnv.Production;
}

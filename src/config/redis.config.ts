import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from './env.validation';

export function redisConnection(
  config: ConfigService<EnvironmentVariables, true>,
): { host: string; port: number } {
  return {
    host: config.get('REDIS_HOST', { infer: true }),
    port: config.get('REDIS_PORT', { infer: true }),
  };
}

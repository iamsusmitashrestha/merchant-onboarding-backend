import { join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { MerchantApplication } from '../modules/applications/entities/merchant-application.entity';
import { RiskAssessment } from '../modules/applications/risk-review/risk-assessment.entity';
import { AuditLog } from '../modules/audit/audit-log.entity';
import { User } from '../modules/users/user.entity';

/** Every entity, listed explicitly so the app, CLI and tests load the same classes. */
export const ENTITIES = [User, AuditLog, MerchantApplication, RiskAssessment];

interface DbEnv {
  DB_HOST: string;
  DB_PORT: number;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_NAME: string;
}

/**
 * Shared by the Nest app and the TypeORM CLI (data-source.ts).
 * `synchronize` is always false: the schema changes only through reviewed migrations.
 */
export function buildDataSourceOptions(env: DbEnv): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    entities: ENTITIES,
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    namingStrategy: new SnakeNamingStrategy(),
    // gen_random_uuid() is built into Postgres 13+, so no uuid-ossp extension is needed.
    uuidExtension: 'pgcrypto',
    synchronize: false,
    migrationsRun: false,
  };
}

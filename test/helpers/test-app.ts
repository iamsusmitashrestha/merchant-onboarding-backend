import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { Queue } from 'bullmq';
import { Server } from 'http';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { SEED_USERS, SeedUserKey } from '../../src/database/seeds/seed-users';
import { RISK_REVIEW_QUEUE } from '../../src/modules/applications/risk-review/risk-review.constants';
import { User } from '../../src/modules/users/user.entity';

export interface TestContext {
  app: INestApplication;
  http: Server;
  dataSource: DataSource;
  queue: Queue;
}

export type SeededUsers = Record<SeedUserKey, User>;

// Boots the real AppModule with the same global setup as main.ts, against the test DB.
export async function createTestApp(
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<TestContext> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  const moduleRef = await (customize ? customize(builder) : builder).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();

  const dataSource = app.get(DataSource);
  await dataSource.runMigrations();

  // Start each test file with an empty queue (test prefix only, see .env.test).
  const queue = app.get<Queue>(getQueueToken(RISK_REVIEW_QUEUE), {
    strict: false,
  });
  await queue.obliterate({ force: true });

  return { app, http: app.getHttpServer() as Server, dataSource, queue };
}

// Jobs left over from a previous test find no application and are skipped as stale.
export async function resetState(ctx: TestContext): Promise<void> {
  await ctx.dataSource.query(
    'TRUNCATE risk_assessments, merchant_applications, audit_logs RESTART IDENTITY CASCADE',
  );
}

// Users are upserted once per suite so their ids (and tokens) stay stable across tests.
// Low bcrypt cost keeps logins fast; production seeding uses cost 12.
export async function seedUsers(dataSource: DataSource): Promise<SeededUsers> {
  const passwordHash = await hash(testPassword(), 4);
  const repo = dataSource.getRepository(User);
  await repo.upsert(
    Object.values(SEED_USERS).map((u) => ({
      ...u,
      passwordHash,
      active: true,
    })),
    ['email'],
  );

  const entries = await Promise.all(
    (Object.keys(SEED_USERS) as SeedUserKey[]).map(
      async (key) =>
        [
          key,
          await repo.findOneByOrFail({ email: SEED_USERS[key].email }),
        ] as const,
    ),
  );
  return Object.fromEntries(entries) as SeededUsers;
}

export function testPassword(): string {
  const password = process.env.SEED_USER_PASSWORD;
  if (!password) throw new Error('SEED_USER_PASSWORD is not set in .env.test');
  return password;
}

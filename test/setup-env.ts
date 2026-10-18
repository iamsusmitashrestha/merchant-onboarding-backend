import { config } from 'dotenv';

// Load the test env before any module reads process.env (separate DB, queue prefix).
process.env.ENV_FILE ??= '.env.test';
config({ path: process.env.ENV_FILE, quiet: true });

if (process.env.NODE_ENV !== 'test') {
  throw new Error(
    `e2e tests must run with NODE_ENV=test (got ${process.env.NODE_ENV}); check ${process.env.ENV_FILE}`,
  );
}

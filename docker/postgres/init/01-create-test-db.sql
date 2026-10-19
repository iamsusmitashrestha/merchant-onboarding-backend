-- Runs once on first container start. Separate database for e2e tests.
-- Idempotent: in CI, DB_NAME is already merchant_onboarding_test, so Postgres
-- creates it itself and this must not fail.
SELECT 'CREATE DATABASE merchant_onboarding_test'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'merchant_onboarding_test'
)\gexec

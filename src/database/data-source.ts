import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation';
import { buildDataSourceOptions } from './typeorm.config';

// Used by the TypeORM CLI and the seed script. ENV_FILE lets e2e/CI point at .env.test.
config({ path: process.env.ENV_FILE ?? '.env', quiet: true });

export default new DataSource(buildDataSourceOptions(validateEnv(process.env)));

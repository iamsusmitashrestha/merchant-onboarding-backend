import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { LoggerModule } from 'nestjs-pino';
import { LOG_REDACT_PATHS } from './common/redaction/redaction';
import {
  EnvironmentVariables,
  NodeEnv,
  validateEnv,
} from './config/env.validation';
import { buildDataSourceOptions } from './database/typeorm.config';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard, RolesGuard } from './modules/auth/guards';
import { ApplicationsModule } from './modules/applications/applications.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: process.env.ENV_FILE ?? '.env',
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          redact: { paths: LOG_REDACT_PATHS, censor: '[REDACTED]' },
          // Reuse an incoming x-request-id (from a gateway) or generate one.
          genReqId: (req) => {
            const header = req.headers['x-request-id'];
            return typeof header === 'string' && header.length <= 100
              ? header
              : randomUUID();
          },
          transport:
            config.get('NODE_ENV', { infer: true }) === NodeEnv.Development
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        buildDataSourceOptions({
          DB_HOST: config.get('DB_HOST', { infer: true }),
          DB_PORT: config.get('DB_PORT', { infer: true }),
          DB_USER: config.get('DB_USER', { infer: true }),
          DB_PASSWORD: config.get('DB_PASSWORD', { infer: true }),
          DB_NAME: config.get('DB_NAME', { infer: true }),
        }),
    }),
    UsersModule,
    AuthModule,
    HealthModule,
    ApplicationsModule,
  ],
  providers: [
    // Order matters: authenticate first, then check roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

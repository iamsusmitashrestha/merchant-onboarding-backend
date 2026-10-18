import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnvironmentVariables } from '../../config/env.validation';
import { redisConnection } from '../../config/redis.config';
import { AuditModule } from '../audit/audit.module';
import { RiskModule } from '../risk/risk.module';
import { UsersModule } from '../users/users.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { MerchantApplication } from './entities/merchant-application.entity';
import { RiskAssessment } from './risk-review/risk-assessment.entity';
import { RISK_REVIEW_QUEUE } from './risk-review/risk-review.constants';
import { RiskReviewProcessor } from './risk-review/risk-review.processor';
import { RiskReviewQueue } from './risk-review/risk-review.queue';
import { RiskReviewService } from './risk-review/risk-review.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MerchantApplication, RiskAssessment]),
    BullModule.registerQueueAsync({
      name: RISK_REVIEW_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        connection: {
          ...redisConnection(config),
          // Producer side: fail fast (→ 503) instead of hanging while Redis is down.
          enableOfflineQueue: false,
        },
        defaultJobOptions: {
          attempts: config.get('RISK_JOB_ATTEMPTS', { infer: true }),
          backoff: {
            type: 'exponential',
            delay: config.get('RISK_JOB_BACKOFF_MS', { infer: true }),
          },
          removeOnComplete: { age: 24 * 3600, count: 1000 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      }),
    }),
    AuditModule,
    UsersModule,
    RiskModule,
  ],
  controllers: [ApplicationsController],
  providers: [
    ApplicationsService,
    RiskReviewQueue,
    RiskReviewService,
    RiskReviewProcessor,
  ],
})
export class ApplicationsModule {}

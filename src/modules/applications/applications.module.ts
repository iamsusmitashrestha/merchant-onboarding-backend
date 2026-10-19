import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { RiskModule } from '../risk/risk.module';
import { UsersModule } from '../users/users.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { MerchantApplication } from './entities/merchant-application.entity';
import { RiskAssessment } from './risk-review/risk-assessment.entity';
import { RISK_REVIEW_QUEUE } from './risk-review/risk-review.constants';
import { RiskReviewProcessor } from './risk-review/risk-review.processor';
import {
  RiskReviewQueue,
  riskReviewProducerProvider,
} from './risk-review/risk-review.queue';
import { RiskReviewService } from './risk-review/risk-review.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MerchantApplication, RiskAssessment]),
    BullModule.registerQueue({ name: RISK_REVIEW_QUEUE }),
    AuditModule,
    UsersModule,
    RiskModule,
  ],
  controllers: [ApplicationsController],
  providers: [
    ApplicationsService,
    riskReviewProducerProvider,
    RiskReviewQueue,
    RiskReviewService,
    RiskReviewProcessor,
  ],
})
export class ApplicationsModule {}

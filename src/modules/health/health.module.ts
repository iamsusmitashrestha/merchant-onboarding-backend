import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { RISK_REVIEW_QUEUE } from '../applications/risk-review/risk-review.constants';
import { HealthController } from './health.controller';

@Module({
  imports: [BullModule.registerQueue({ name: RISK_REVIEW_QUEUE })],
  controllers: [HealthController],
})
export class HealthModule {}

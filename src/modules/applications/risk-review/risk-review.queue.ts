import { Inject, Injectable, OnModuleDestroy, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { EnvironmentVariables } from '../../../config/env.validation';
import { redisConnection } from '../../../config/redis.config';
import {
  ASSESS_JOB,
  RISK_REVIEW_QUEUE,
  RiskReviewJobData,
  riskReviewJobId,
} from './risk-review.constants';

export const RISK_REVIEW_PRODUCER = Symbol('RISK_REVIEW_PRODUCER');

export const riskReviewProducerProvider: Provider = {
  provide: RISK_REVIEW_PRODUCER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
    new Queue<RiskReviewJobData>(RISK_REVIEW_QUEUE, {
      connection: { ...redisConnection(config), enableOfflineQueue: false },
      prefix: config.get('BULL_PREFIX', { infer: true }),
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
};

@Injectable()
export class RiskReviewQueue implements OnModuleDestroy {
  constructor(
    @Inject(RISK_REVIEW_PRODUCER)
    private readonly queue: Queue<RiskReviewJobData>,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }

  async enqueue(
    applicationId: string,
    submissionVersion: number,
  ): Promise<void> {
    await this.queue.add(
      ASSESS_JOB,
      { applicationId, submissionVersion },
      { jobId: riskReviewJobId(applicationId, submissionVersion) },
    );
  }

  // ADR 0009: add() with an existing jobId is silently ignored while the job is
  // still in Redis, so a failed job has to be retried rather than re-added.
  async retry(applicationId: string, submissionVersion: number): Promise<void> {
    const job = await this.queue.getJob(
      riskReviewJobId(applicationId, submissionVersion),
    );
    if (!job) {
      await this.enqueue(applicationId, submissionVersion);
      return;
    }
    if ((await job.getState()) !== 'failed') return;
    try {
      await job.retry('failed', { resetAttemptsMade: true });
    } catch (err) {
      // A concurrent retry moved the job out of `failed` first: nothing left to do.
      if ((await job.getState()) !== 'failed') return;
      throw err;
    }
  }
}

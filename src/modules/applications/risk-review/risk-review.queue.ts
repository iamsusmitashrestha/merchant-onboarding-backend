import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  ASSESS_JOB,
  RISK_REVIEW_QUEUE,
  RiskReviewJobData,
  riskReviewJobId,
} from './risk-review.constants';

@Injectable()
export class RiskReviewQueue {
  constructor(
    @InjectQueue(RISK_REVIEW_QUEUE)
    private readonly queue: Queue<RiskReviewJobData>,
  ) {}

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
    if ((await job.getState()) === 'failed') {
      await job.retry('failed', { resetAttemptsMade: true });
    }
  }
}

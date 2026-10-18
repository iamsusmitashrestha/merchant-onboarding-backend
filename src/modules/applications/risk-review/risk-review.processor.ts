import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import {
  PermanentProviderError,
  RISK_PROVIDER,
} from '../../risk/risk-provider';
import type {
  RiskAssessmentResult,
  RiskProvider,
} from '../../risk/risk-provider';
import {
  RISK_REVIEW_QUEUE,
  RiskReviewJobData,
  RiskReviewOutcome,
} from './risk-review.constants';
import { isStale, RiskReviewService } from './risk-review.service';

export function isFinalAttempt(
  job: Pick<Job, 'attemptsMade' | 'opts'>,
  error: Error,
): boolean {
  return (
    error instanceof UnrecoverableError ||
    job.attemptsMade >= (job.opts.attempts ?? 1)
  );
}

@Processor(RISK_REVIEW_QUEUE, { concurrency: 5 })
export class RiskReviewProcessor extends WorkerHost {
  private readonly logger = new Logger(RiskReviewProcessor.name);

  constructor(
    private readonly reviews: RiskReviewService,
    @Inject(RISK_PROVIDER) private readonly provider: RiskProvider,
  ) {
    super();
  }

  async process(job: Job<RiskReviewJobData>): Promise<RiskReviewOutcome> {
    const { applicationId, submissionVersion } = job.data;

    // Cheap checks first, so a stale or duplicate job never calls the provider.
    const app = await this.reviews.findApplication(applicationId);
    if (!app || isStale(app, submissionVersion)) {
      return RiskReviewOutcome.SKIPPED_STALE;
    }
    if (await this.reviews.hasAssessment(job.data)) {
      return RiskReviewOutcome.SKIPPED_DUPLICATE;
    }

    let result: RiskAssessmentResult;
    try {
      // Outside any transaction: no row lock is held during a slow external call.
      result = await this.provider.assess({
        applicationId,
        legalBusinessName: app.legalBusinessName,
        businessType: app.businessType,
        mcc: app.mcc,
        expectedMonthlyVolumeMinor: app.expectedMonthlyVolumeMinor,
      });
    } catch (err) {
      if (err instanceof PermanentProviderError) {
        throw new UnrecoverableError(err.message);
      }
      throw err; // BullMQ retries with exponential backoff
    }

    return this.reviews.complete(job.data, result);
  }

  // Fires after every failed attempt; only the last one marks the review FAILED.
  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<RiskReviewJobData> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job || !isFinalAttempt(job, error)) return;
    try {
      await this.reviews.markFailed(job.data, error.name, job.attemptsMade);
    } catch (err) {
      this.logger.error(
        `Could not mark risk review failed for job ${job.id}: ${String(err)}`,
      );
    }
  }
}

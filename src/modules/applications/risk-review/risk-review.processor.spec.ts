import { Job, UnrecoverableError } from 'bullmq';
import { RiskLevel } from '../../risk/risk-level.enum';
import {
  PermanentProviderError,
  RiskAssessmentResult,
  TransientProviderError,
} from '../../risk/risk-provider';
import { MerchantApplication } from '../entities/merchant-application.entity';
import { ApplicationStatus } from '../enums/application-status.enum';
import { RiskReviewJobData, RiskReviewOutcome } from './risk-review.constants';
import { RiskReviewProcessor } from './risk-review.processor';
import { RiskReviewService } from './risk-review.service';

const data: RiskReviewJobData = {
  applicationId: 'app-1',
  submissionVersion: 1,
};

const result: RiskAssessmentResult = {
  score: 12,
  level: RiskLevel.LOW,
  reasons: [],
  providerReference: 'sim-abc',
};

function submittedApp(
  overrides: Partial<MerchantApplication> = {},
): Partial<MerchantApplication> {
  return {
    id: 'app-1',
    status: ApplicationStatus.SUBMITTED,
    submissionVersion: 1,
    legalBusinessName: 'Acme Test Shop LLC',
    businessType: 'LLC' as MerchantApplication['businessType'],
    mcc: '5734',
    expectedMonthlyVolumeMinor: 5_000_000,
    ...overrides,
  };
}

function job(attemptsMade = 0, attempts = 3): Job<RiskReviewJobData> {
  return {
    id: 'job-1',
    data,
    attemptsMade,
    opts: { attempts },
  } as Job<RiskReviewJobData>;
}

function setup(
  app: Partial<MerchantApplication> | null,
  { alreadyAssessed = false } = {},
) {
  const reviews = {
    findApplication: jest.fn().mockResolvedValue(app),
    hasAssessment: jest.fn().mockResolvedValue(alreadyAssessed),
    complete: jest.fn().mockResolvedValue(RiskReviewOutcome.COMPLETED),
    markFailed: jest.fn().mockResolvedValue(undefined),
  };
  const provider = { assess: jest.fn().mockResolvedValue(result) };
  const processor = new RiskReviewProcessor(
    reviews as unknown as RiskReviewService,
    provider,
  );
  return { processor, reviews, provider };
}

describe('RiskReviewProcessor.process', () => {
  it('stores the provider result for the current submission', async () => {
    const { processor, reviews } = setup(submittedApp());

    await expect(processor.process(job())).resolves.toBe(
      RiskReviewOutcome.COMPLETED,
    );
    expect(reviews.complete).toHaveBeenCalledWith(data, result);
  });

  it.each([
    ['an older submission', submittedApp({ submissionVersion: 2 })],
    [
      'an application that already left SUBMITTED',
      submittedApp({ status: ApplicationStatus.IN_REVIEW }),
    ],
    ['an application that no longer exists', null],
  ])('skips a job for %s without calling the provider', async (_label, app) => {
    const { processor, provider, reviews } = setup(app);

    await expect(processor.process(job())).resolves.toBe(
      RiskReviewOutcome.SKIPPED_STALE,
    );
    expect(provider.assess).not.toHaveBeenCalled();
    expect(reviews.complete).not.toHaveBeenCalled();
  });

  it('skips a submission that already has an assessment, without calling the provider', async () => {
    const { processor, provider } = setup(submittedApp(), {
      alreadyAssessed: true,
    });

    await expect(processor.process(job())).resolves.toBe(
      RiskReviewOutcome.SKIPPED_DUPLICATE,
    );
    expect(provider.assess).not.toHaveBeenCalled();
  });

  it('rethrows a transient provider error so BullMQ retries with backoff', async () => {
    const { processor, provider, reviews } = setup(submittedApp());
    const outage = new TransientProviderError('timeout');
    provider.assess.mockRejectedValue(outage);

    await expect(processor.process(job())).rejects.toBe(outage);
    expect(reviews.complete).not.toHaveBeenCalled();
  });

  it('turns a permanent provider error into UnrecoverableError (no retries)', async () => {
    const { processor, provider } = setup(submittedApp());
    provider.assess.mockRejectedValue(new PermanentProviderError('bad input'));

    await expect(processor.process(job())).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });
});

describe('RiskReviewProcessor.onFailed', () => {
  it('does not mark the review FAILED while retries remain', async () => {
    const { processor, reviews } = setup(submittedApp());

    await processor.onFailed(job(1, 3), new TransientProviderError('timeout'));

    expect(reviews.markFailed).not.toHaveBeenCalled();
  });

  it('marks the review FAILED after the last attempt', async () => {
    const { processor, reviews } = setup(submittedApp());

    await processor.onFailed(job(3, 3), new TransientProviderError('timeout'));

    expect(reviews.markFailed).toHaveBeenCalledWith(
      data,
      'TransientProviderError',
      3,
    );
  });

  it('marks the review FAILED at once for an unrecoverable error', async () => {
    const { processor, reviews } = setup(submittedApp());

    await processor.onFailed(job(1, 3), new UnrecoverableError('bad input'));

    expect(reviews.markFailed).toHaveBeenCalledWith(
      data,
      'UnrecoverableError',
      1,
    );
  });

  it('does not throw if marking the failure itself fails', async () => {
    const { processor, reviews } = setup(submittedApp());
    reviews.markFailed.mockRejectedValue(new Error('db down'));

    await expect(
      processor.onFailed(job(3, 3), new Error('timeout')),
    ).resolves.toBeUndefined();
  });
});

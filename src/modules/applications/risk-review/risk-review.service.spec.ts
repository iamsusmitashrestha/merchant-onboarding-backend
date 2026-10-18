import { DataSource, QueryFailedError } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { RiskLevel } from '../../risk/risk-level.enum';
import { ApplicationStatus } from '../enums/application-status.enum';
import { UQ_ONE_ASSESSMENT_PER_SUBMISSION } from './risk-assessment.entity';
import { RiskReviewOutcome } from './risk-review.constants';
import { isStale, RiskReviewService } from './risk-review.service';

const job = { applicationId: 'app-1', submissionVersion: 1 };
const result = {
  score: 12,
  level: RiskLevel.LOW,
  reasons: [],
  providerReference: 'sim-abc',
};

function uniqueViolation(constraint: string): QueryFailedError {
  return new QueryFailedError(
    'INSERT ...',
    [],
    Object.assign(new Error('duplicate key'), { code: '23505', constraint }),
  );
}

function serviceWhoseTransactionFails(error: Error): RiskReviewService {
  const dataSource = {
    transaction: jest.fn().mockRejectedValue(error),
  } as unknown as DataSource;
  return new RiskReviewService(dataSource, {} as AuditService);
}

describe('RiskReviewService.complete', () => {
  it('treats a duplicate assessment for the same submission as already done', async () => {
    const service = serviceWhoseTransactionFails(
      uniqueViolation(UQ_ONE_ASSESSMENT_PER_SUBMISSION),
    );

    await expect(service.complete(job, result)).resolves.toBe(
      RiskReviewOutcome.SKIPPED_DUPLICATE,
    );
  });

  it('does not swallow a unique violation on any other constraint', async () => {
    const service = serviceWhoseTransactionFails(
      uniqueViolation('uq_something_else'),
    );

    await expect(service.complete(job, result)).rejects.toBeInstanceOf(
      QueryFailedError,
    );
  });

  it('rethrows other errors so BullMQ retries the job', async () => {
    const service = serviceWhoseTransactionFails(new Error('connection lost'));

    await expect(service.complete(job, result)).rejects.toThrow(
      'connection lost',
    );
  });
});

describe('isStale', () => {
  it('is false for the current submission while SUBMITTED', () => {
    expect(
      isStale({ status: ApplicationStatus.SUBMITTED, submissionVersion: 1 }, 1),
    ).toBe(false);
  });

  it('is true for an older submission', () => {
    expect(
      isStale({ status: ApplicationStatus.SUBMITTED, submissionVersion: 2 }, 1),
    ).toBe(true);
  });

  it('is true once the application has left SUBMITTED', () => {
    expect(
      isStale({ status: ApplicationStatus.IN_REVIEW, submissionVersion: 1 }, 1),
    ).toBe(true);
  });
});

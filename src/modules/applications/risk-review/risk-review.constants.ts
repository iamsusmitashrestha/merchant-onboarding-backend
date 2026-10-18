export const RISK_REVIEW_QUEUE = 'risk-review';
export const ASSESS_JOB = 'assess';

// Ids only: the payload is visible in Redis and in queue dashboards, so no PII.
export interface RiskReviewJobData {
  applicationId: string;
  submissionVersion: number;
}

// Deterministic, so a duplicate submit or HTTP retry can't create a second job.
// '-' rather than ':' because Redis keys use ':' as their separator.
export function riskReviewJobId(
  applicationId: string,
  submissionVersion: number,
): string {
  return `risk-${applicationId}-v${submissionVersion}`;
}

export enum RiskReviewOutcome {
  COMPLETED = 'COMPLETED',
  SKIPPED_STALE = 'SKIPPED_STALE',
  SKIPPED_DUPLICATE = 'SKIPPED_DUPLICATE',
}

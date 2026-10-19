# 0009. ADMIN retry endpoint for stuck risk reviews

## Context
An application can get stuck in `SUBMITTED` in two ways:
- the risk job failed for good (`riskStatus=FAILED`), or
- the commit succeeded but the enqueue didn't (`riskStatus=PENDING` with no job; see ADR 0004).

Either way nothing can move it forward. The state machine doesn't allow `submit` from `SUBMITTED`, and reviewers only act on `IN_REVIEW`.

ADR 0004 relied on re-enqueueing with the same job id, but that doesn't work. BullMQ ignores `queue.add` while a job with that id is still in Redis, and failed jobs are kept for 7 days, so re-adding a failed job silently does nothing.

## Decision
- `POST /applications/:id/risk-review/retry`, restricted to `@Roles(ADMIN)`.
- The state machine allows it only when the status is `SUBMITTED` and `riskStatus` is `FAILED` or `PENDING`. Anything else is a 409.
- In the transaction: lock the row, set `riskStatus=PENDING`, audit `RISK_REVIEW_RETRIED`. `submissionVersion` doesn't change, because it's still the same submission.
- After the commit, it depends on the job's state. No job: `queue.add` with the deterministic job id. `failed`: `job.retry('failed', { resetAttemptsMade: true })`. Anything else: nothing to do. If `job.retry()` throws because another retry already moved the job out of `failed`, that counts as success. So calling it twice is safe, whether the calls come one after the other or at the same moment.
- This takes the retry off the cut list. The startup sweeper stays cut.

## Alternatives considered
- Let the owner resubmit from `SUBMITTED` + `FAILED`. No new endpoint, but the state machine starts depending on `riskStatus`, and the enqueue-failed case still needs a sweeper.
- On final failure, move to `IN_REVIEW` for manual review. Reviewers would approve without a risk assessment, and the enqueue-failed case is still stuck.
- A startup sweeper only. It recovers `PENDING` only after a restart, and never recovers `FAILED`.

## Consequences
One small endpoint covers both stuck states. It's audited and safe to repeat. The retried job keeps the same `(applicationId, submissionVersion)`, so the unique constraint still allows only one assessment.

Two simultaneous calls both return 200 and the job runs once. Both leave a `RISK_REVIEW_RETRIED` audit row, which is accurate: two admins did ask for a retry.

Recovery needs a person to notice and act. In production I'd add the outbox from ADR 0004 and alerting on `FAILED`.

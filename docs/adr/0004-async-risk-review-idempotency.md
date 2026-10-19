# 0004. Async risk review: enqueue after commit, idempotency in layers

## Context
Submitting an application has to enqueue a BullMQ job that calls a simulated KYB provider, with retries, backoff and idempotency. BullMQ delivers at least once, a stalled job can run twice, and a user can press submit twice.

## Decision
The submit transaction locks the application, checks the transition, increments `submissionVersion` and sets `riskStatus=PENDING`. The job is added only after the commit, so the worker never reads uncommitted state.

The job id is deterministic, `risk-<applicationId>-v<submissionVersion>`. A second submit never reaches the queue: once the application is SUBMITTED, the state machine rejects another submit with a 409. The fixed id matters for the ADMIN retry in ADR 0009, because an `add()` for a submission that already has a job is ignored while that job is still in Redis. The payload holds ids only, so no PII ends up in Redis.

Idempotency doesn't hang on a single check:
1. Before calling the provider, the worker skips stale jobs: the application is no longer SUBMITTED, or its `submissionVersion` has moved on.
2. It also skips jobs whose assessment already exists.
3. When it writes the result, it locks the application row and checks for staleness again, so a second worker racing on the same job stops there.
4. `risk_assessments(application_id, submission_version)` has a unique constraint, and a violation of that named constraint counts as success.

The provider call happens outside the DB transaction. A transient error gets up to `RISK_JOB_ATTEMPTS` attempts in total (default 5, which is the first try plus 4 retries), with exponential backoff starting at `RISK_JOB_BACKOFF_MS` (default 2s). The provider reports a permanent problem as `PermanentProviderError`, and the processor turns that into BullMQ's `UnrecoverableError`, so it isn't retried. After the last failed attempt the worker sets `riskStatus=FAILED` and writes an audit row, provided the application is still SUBMITTED with the same `submissionVersion` and `riskStatus=PENDING`. The job stays in the failed set for 7 days so it can be inspected, and an ADMIN can retry it (ADR 0009).

## Alternatives considered
- Enqueue inside the transaction. The worker could pick the job up before the commit and see the old state.
- Transactional outbox. This is the proper fix for the gap between commit and enqueue, but it needs a relay process, so I left it for later.
- Rely on the job id alone. That dedup disappears once a completed job is removed from Redis, so it can't be what guarantees correctness.

## Consequences
However many times a job runs, the end state is the same and there's exactly one assessment row.

The producer and the worker use different Redis connections (ADR 0010). The producer fails fast, which is what turns a Redis outage into a quick 503. The worker's connection waits for Redis to come back, so after a short outage it carries on with the job it was running. If a job does stall and run again, the layers above make the re-run harmless.

I tested the failure path by hand. With Redis stopped, submit returned 503 in about 20 ms, because the producer connection has `enableOfflineQueue: false`. The application stayed `SUBMITTED`/`PENDING`, and once Redis was back the ADMIN retry completed it.

That is also the known gap. If Redis is down right after the commit, the application is left `SUBMITTED`/`PENDING`. For now the API returns 503 and an ADMIN recovers it with the retry endpoint from ADR 0009. Adding the same job id again isn't enough, because BullMQ ignores it while the old job is still in Redis. In production I'd add the outbox.

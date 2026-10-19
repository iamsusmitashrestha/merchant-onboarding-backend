# 0010. Risk review lives in the applications module; `modules/risk` is only the KYB adapter

## Context
Submitting an application enqueues a risk-review job, and the worker then changes the application. In one transaction it inserts the assessment, moves the status to IN_REVIEW and writes the audit row. If the queue and worker lived in `modules/risk`, `ApplicationsModule` would import the risk module to enqueue, and the risk module would import applications to update state. That's a circular dependency, and it breaks the one-way rule from ADR 0007.

## Decision
`modules/risk/` is only the third-party adapter: the `RiskProvider` interface, the `RISK_PROVIDER` token, `SimulatedKybProvider`, `RiskLevel`, and the provider-neutral `TransientProviderError` / `PermanentProviderError`. It knows nothing about BullMQ or the database.

`modules/applications/risk-review/` owns the workflow:
- the `RiskAssessment` entity
- `RiskReviewQueue`, the producer (enqueue and retry)
- `RiskReviewProcessor`, the BullMQ worker
- `RiskReviewService`, the database side (lock, re-check, insert, audit)

The processor maps `PermanentProviderError` to BullMQ's `UnrecoverableError`, so the worker is the only place that knows about BullMQ.

The producer and the worker need opposite Redis settings, so they get separate connections:
- The producer is its own BullMQ `Queue` instance, provided as `RISK_REVIEW_PRODUCER` in `risk-review.queue.ts`. It connects with `enableOfflineQueue: false`, so during a Redis outage a submit fails fast with a 503 instead of hanging the request. It also carries the job options: attempts, backoff and retention.
- The queue registered with `BullModule.registerQueue` keeps the root connection from `AppModule`, which sets `maxRetriesPerRequest: null`. `@nestjs/bullmq` builds the worker from that registration, so the worker's commands wait for Redis to come back instead of failing. The health check's queue uses the same root settings.

The split is needed because `@nestjs/bullmq` builds the worker from the registered queue's options, and a queue-level `connection` replaces the root one instead of merging with it. Before the split, the fail-fast producer settings were also the worker's.

## Alternatives considered
- Everything in `modules/risk`. That needs `forwardRef` to get around the circular import, which hides the design problem instead of fixing it.
- A separate risk-review module that talks to applications through domain events. Cleaner at scale, but a lot more to build than this time-box allows.

## Consequences
Dependencies point one way, applications → risk. Swapping the simulator for a real KYB vendor means providing a different `RISK_PROVIDER`.

The processor's decisions (skip stale or duplicate jobs, retry or not) are unit tested with plain mocks, and the database side is covered by e2e tests.

The applications module is bigger for it. In production the worker would run as its own deployment of the same module, switched by an env flag, so the API and the worker can scale separately.

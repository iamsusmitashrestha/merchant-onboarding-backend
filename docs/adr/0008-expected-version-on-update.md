# 0008. Lost-update guard: `expectedVersion` on PATCH and assign, checked under the row lock

## Context
While an application is DRAFT or INFO_REQUESTED, both the owner (SALES) and an ADMIN can edit it. With no precondition, the second PATCH silently overwrites the first.

`merchant_applications.version` is a TypeORM `@VersionColumn`, but TypeORM only increments it on `save()` and never adds `WHERE version = …`, so the column alone protects nothing. TypeORM's `lock: { mode: 'optimistic' }` only checks when the row is read, and its `OptimisticLockVersionMismatchError` would reach the exception filter as a 500.

## Decision
- Every application response DTO includes `version`.
- `UpdateApplicationDto` and `AssignReviewerDto` have a required `expectedVersion` (`@IsInt() @Min(1)`). It's a precondition, not a writable field; `version` itself stays server-owned.
- `ApplicationsService.update` loads the row with `pessimistic_write` inside the transaction, as every state change does. It first checks the status is still editable (409 if not), then compares `app.version` with `dto.expectedVersion` in `assertExpectedVersion()` and throws `ConflictError` (409) if they differ. Otherwise it applies the changed fields, and `save()` increments `version`. If no field actually changed, it returns the row without saving, so `version` stays the same.
- `ApplicationsService.assign` does the same check under the lock, after the status check. Assign changes the application without changing its status, so the state machine alone couldn't tell two concurrent assignments apart.
- Submit, decision and risk retry don't take `expectedVersion`. Submit and decision change the status, so a second concurrent request waits for the row lock and then fails the state-machine check with a 409. Retry is safe to repeat (ADR 0009).

## Alternatives considered
- `If-Match` / `ETag` headers (412/428). The HTTP-standard way, but more to build, document and test in the time-box.
- A conditional `UPDATE … WHERE version = :v` without a lock. Also correct, but the service already holds the row lock, and a comparison in code is easier to read.
- No precondition, last write wins. Least work, but it leaves a real lost-update bug between SALES and ADMIN.

## Consequences
A concurrent edit gets a clear 409 instead of silently losing data, and the client re-fetches and tries again. Because I don't use TypeORM's optimistic-lock mode, there's no framework error type to map.

Clients have to send back the version they read. Many production APIs use `If-Match` for this; switching later would only change where the number comes from.

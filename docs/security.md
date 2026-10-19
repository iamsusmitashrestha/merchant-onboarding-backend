# Security and sensitive data

How this service handles credentials, authorization and sensitive merchant data, and which fields I'd put under field-level encryption in production. The reasoning behind most of it is in the ADRs linked below.

## 1. Authentication

| Control | How it works |
|---|---|
| Token | JWT, HS256, 15-minute lifetime (`JWT_EXPIRES_IN_SECONDS`, validated to 60–86400). The payload is only `{ sub, role }`. |
| Algorithm pinning | Signing and verification both pin `HS256`, so `alg: none` and algorithm-confusion tokens are rejected (e2e tested). |
| Secret | `JWT_SECRET` comes from env and must be at least 32 characters, or the app won't start. With `NODE_ENV=production` the `change-me` placeholder is rejected as well. |
| Per-request check | `JwtStrategy` reloads the user on every request. A deactivated or deleted user gets 401 even with a valid token, and the role comes from the database, not the token. There's an e2e test that sends a correctly signed token claiming ADMIN. |
| Passwords | bcrypt, cost 12 (`bcryptjs`). The hash column is `select: false`, so only the login query loads it, and it isn't in any DTO. |
| Login errors | Unknown email, wrong password and inactive user all get the same `401 Invalid credentials`. Unknown emails are still compared against a dummy hash, so response time doesn't reveal which emails exist. |
| Refresh tokens | Not implemented, on purpose ([ADR 0011](adr/0011-no-refresh-tokens.md)). |

## 2. Authorization ([ADR 0002](adr/0002-object-level-authorization.md), [ADR 0003](adr/0003-decision-and-assignment-rights.md))

Every request goes through three checks:

1. Authentication: `JwtAuthGuard` is global, so every route is protected unless it's marked `@Public()`. Only login and health are.
2. Role: `RolesGuard` is global too, with `@Roles(...)` on each route. The wrong role gets 403.
3. Object level: every application query starts from the same `scopedQuery()`, which puts the caller's scope into the SQL.
   - SALES only sees `created_by_id = :me`.
   - REVIEWER sees everything except `DRAFT`.
   - Extra filters are added with `andWhere`, and `isolateWhereStatements` is on, so every condition sits in its own parentheses. A filter can narrow the scope but can't widen it, even if it contains `OR`; an e2e test checks this.

| | 404 | 403 |
|---|---|---|
| When | The caller isn't allowed to know the application exists | The caller can see it but isn't allowed to do this |
| Examples | SALES asking for another user's application; REVIEWER asking for a draft | A REVIEWER who isn't the assigned one recording a decision; ADMIN recording a decision |

A few more things:
- Mass assignment. The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so a request body containing `createdById`, `status`, `assignedReviewerId`, `riskStatus` or `version` is rejected with 400. Identity always comes from the token.
- Race conditions. The "only the assigned reviewer can decide" check runs after `SELECT … FOR UPDATE` inside the transaction, so a concurrent reassignment can't get in between the check and the write. Edits and reassignments also carry `expectedVersion`, so of two concurrent ones the second gets a 409 instead of silently overwriting the first.
- Tests. `test/applications-authz.e2e-spec.ts` (`authorization cannot be bypassed`) asserts the status code for every bypass attempt. Most write attempts also check that the row in the database didn't change (another user's update and submit, assign, decision, retry, and server-owned fields on update), and submit and retry check that nothing was queued. The REVIEWER 403s on create, update and submit, and the 400s for server-owned fields on create, check the status code only. As sanity checks I removed the ownership filter (4 tests failed) and turned `isolateWhereStatements` off (the `OR`-scope test failed).

## 3. Sensitive data inventory

All seed and test data is fake: `example.com` emails, `555-01xx` phone numbers, `00-000000x` tax IDs.

| Field | Classification | Stored | API responses | Logs | Audit metadata | Field-level encryption? |
|---|---|---|---|---|---|---|
| `users.password_hash` | Credential | bcrypt hash | Never | Redacted | Never | No, it's already a one-way hash |
| JWT / `Authorization` header | Credential | Not stored | Issued once at login | Redacted | Never | n/a |
| `taxId` | Sensitive business identifier | Plain text in Postgres | Masked to last 4 (`******0001`) | Redacted | Masked or left out | Yes |
| `ownerPhone` | Personal data | Plain text | Masked to last 4 | Redacted | Masked or left out | Yes |
| `ownerEmail` | Personal data | Plain text | Returned (needed for contact) | Not logged (request bodies aren't logged) | Left out | Yes |
| `ownerName` | Personal data | Plain text | Returned | Not logged | Left out | Recommended |
| Future bank account / routing numbers | Financial | Not collected | n/a | n/a | n/a | Yes, and never shown in full anywhere |

### One redaction module

`src/common/redaction/redaction.ts` is the only place that defines what's secret (`password`, `passwordHash`, `token`, `accessToken`, `refreshToken`, `authorization`, `secret`, `jwt`) and what gets masked (`taxId`, `ownerPhone`). It's used in three places:

| Where | How | Tested by |
|---|---|---|
| Logs | `nestjs-pino` `redact` with `LOG_REDACT_PATHS` (`req.headers.authorization`, cookies, `req.body.<secret>`, `*.<secret>`). Request bodies aren't logged. | `log-redaction.spec.ts`, which runs the real pino config |
| Audit metadata | `AuditService.record()` always runs `redact()`, so a caller can't skip it. | `audit.service.spec.ts`; `audit.e2e-spec.ts` searches the whole `audit_logs` table for the password, JWTs, tax IDs and phone numbers |
| API responses | `ApplicationResponseDto.fromEntity()` masks with `maskLast4`. | `applications-lifecycle.e2e-spec.ts` |

Queue payloads only carry ids (`{ applicationId, submissionVersion }`), because job data can be read in Redis and in queue dashboards. Error responses never include stack traces, SQL or request bodies, and any unexpected error becomes a generic 500.

## 4. Audit trail ([ADR 0005](adr/0005-audit-in-postgres-and-field-encryption.md))

Recorded events:
- `APPLICATION_CREATED`, `APPLICATION_UPDATED` (field names only, never values), `APPLICATION_SUBMITTED`
- `REVIEWER_ASSIGNED`
- `RISK_ASSESSMENT_COMPLETED`, `RISK_ASSESSMENT_FAILED`
- `RISK_REVIEW_RETRIED`
- `DECISION_RECORDED`
- `LOGIN_SUCCEEDED`, `LOGIN_FAILED` (email domain only)

Each row is written in the same transaction as the change it records, so you get both or neither. A row holds the actor (user id and role, `SYSTEM` for the worker, or `ANONYMOUS` for failed logins), the request id, which matches the request logs, and the redacted metadata.

The log is append-only in application code: `AuditService` has no update or delete. In production I'd also `REVOKE UPDATE, DELETE ON audit_logs` from the application's database role and partition the table by month.

## 5. Field-level encryption plan (documented, not implemented)

The brief asks for this to be documented. I didn't build it, because encryption without a real key-management service and key rotation looks secure without really being secure, and it didn't fit the time-box.

Fields: `taxId`, `ownerPhone`, `ownerEmail` (and `ownerName` if policy requires it), plus any bank or routing numbers added later.

How I'd build it:
1. Envelope encryption with AES-256-GCM. Each value gets its own random 96-bit IV, and the stored value is `{ keyId, iv, ciphertext, authTag }` in a `bytea` or `jsonb` column.
2. Keys. A data-encryption key (DEK) is generated and wrapped by a KMS master key (AWS KMS, GCP KMS or Vault Transit). Only the wrapped DEK is stored, and the plaintext DEK is cached in memory for a short time.
3. Rotation. `keyId` records which DEK encrypted each value. New writes use the current key, and a background job re-encrypts old rows.
4. Lookups. Where an exact-match lookup is needed, such as a duplicate tax-ID check, store an HMAC-SHA256 blind index next to the ciphertext, using a separate key.
5. Where it goes in the code: a small `FieldCipher` service that the applications service calls when it writes or reads these fields. It can't be a TypeORM `ValueTransformer` like `bigintTransformer`, because transformers are synchronous and unwrapping a DEK needs an async KMS call. On write, the same service also fills the blind-index column, and duplicate checks query that column. DTOs and response masking stay as they are.
6. Underneath all this, production would also have Postgres storage encryption, TLS to Postgres and Redis, and backups encrypted with separate keys.

## 6. Configuration and secrets

- Only `.env.example` and `.env.test.example` are committed, with `change-me` placeholders. `.env*` is git-ignored and Docker-ignored.
- `docker-compose.yml` doesn't hard-code any credentials. It reads them from `.env` and fails if they're missing.
- Every environment variable is validated at startup (`src/config/env.validation.ts`), so missing or weak configuration stops the app from starting.
- `helmet` sets the standard security headers. CORS isn't enabled, since the API is meant to be called server to server or through a gateway.

## 7. Known gaps (what production would add)

| Gap | What production would do |
|---|---|
| No rate limiting or lockout on `/auth/login` | `@nestjs/throttler` per IP and per account, and alerting on spikes in `LOGIN_FAILED` |
| No refresh tokens or SSO | An OIDC identity provider, or rotating refresh tokens ([ADR 0011](adr/0011-no-refresh-tokens.md)) |
| Field-level encryption not implemented | The plan in section 5 |
| Audit immutability only enforced in application code | Database role grants, plus export to WORM or cold storage |
| Commit-then-enqueue gap (Redis down after the commit) | A transactional outbox ([ADR 0004](adr/0004-async-risk-review-idempotency.md)); for now, a 503 and the ADMIN retry ([ADR 0009](adr/0009-admin-risk-review-retry.md)) |
| Object-level checks only in the application | Postgres row-level security as defense in depth |

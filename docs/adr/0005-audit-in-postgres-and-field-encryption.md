# 0005. Audit log in Postgres; field-level encryption documented, not built

## Context
The brief asks for an audit trail of significant actions, no secrets in logs, masking of sensitive fields, and documentation of which fields need field-level encryption. It says Postgres is fine for audit storage; MongoDB is optional.

## Decision
- Audit rows go into an `audit_logs` table in Postgres, written in the same transaction as the change they record. The log is append-only: the service only inserts and has no update or delete methods.
- One redaction module, `src/common/redaction`, drives the pino log redaction, the cleaning of audit metadata and the masking of API responses.
- Field-level encryption for `taxId`, `ownerPhone`, `ownerEmail` and future bank details is written up in `docs/security.md` (envelope encryption with AES-256-GCM, KMS data keys, a blind index for lookups). It isn't implemented.

## Alternatives considered
- MongoDB or another separate audit store. It takes write load off the main database, but the audit write is no longer atomic with the change, and it's more infrastructure for something the brief marks optional.
- Encrypting with a local key. Without a KMS and key rotation it looks secure without really being secure, and it would have taken hours out of the time-box.

## Consequences
An audit row exists exactly when its change committed. Logs, audit and responses can't drift apart on what they mask, because they share one module.

The audit table grows inside the main database. In production I'd partition it by month, move old partitions to cold storage, and `REVOKE UPDATE, DELETE` on it from the app's DB role.

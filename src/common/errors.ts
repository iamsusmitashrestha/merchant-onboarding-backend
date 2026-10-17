/**
 * Framework-free errors thrown by domain code and services.
 * The global exception filter maps them to HTTP statuses, so domain code
 * never needs to know about HTTP (see ADR 0001).
 */
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The resource does not exist, or the caller is not allowed to know it exists → 404. */
export class NotFoundError extends DomainError {
  constructor(resource: string) {
    super(`${resource} not found`);
  }
}

/** The caller can see the resource but may not perform this action → 403. */
export class ForbiddenActionError extends DomainError {}

/** The action is not allowed from the resource's current state → 409. */
export class InvalidTransitionError extends DomainError {
  constructor(
    readonly from: string,
    readonly action: string,
  ) {
    super(`Cannot ${action} an application in status ${from}`);
  }
}

/** A business-rule conflict that is not a state transition (e.g. stale version) → 409. */
export class ConflictError extends DomainError {}

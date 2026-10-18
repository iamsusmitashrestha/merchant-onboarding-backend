import { QueryFailedError } from 'typeorm';

const PG_UNIQUE_VIOLATION = '23505';

// Matches one named constraint, so an unrelated duplicate is never swallowed.
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const pg = err.driverError as { code?: string; constraint?: string };
  return pg.code === PG_UNIQUE_VIOLATION && pg.constraint === constraint;
}

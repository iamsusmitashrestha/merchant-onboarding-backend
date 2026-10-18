import { QueryFailedError } from 'typeorm';
import { isUniqueViolation } from './db-errors';

function pgError(code: string, constraint?: string): QueryFailedError {
  return new QueryFailedError(
    'INSERT ...',
    [],
    Object.assign(new Error('pg error'), { code, constraint }),
  );
}

describe('isUniqueViolation', () => {
  it('matches a unique violation on the named constraint', () => {
    expect(isUniqueViolation(pgError('23505', 'uq_a'), 'uq_a')).toBe(true);
  });

  it('ignores a unique violation on a different constraint', () => {
    expect(isUniqueViolation(pgError('23505', 'uq_b'), 'uq_a')).toBe(false);
  });

  it('ignores other database errors', () => {
    expect(isUniqueViolation(pgError('23503', 'uq_a'), 'uq_a')).toBe(false);
  });

  it('ignores non-database errors', () => {
    expect(isUniqueViolation(new Error('boom'), 'uq_a')).toBe(false);
  });
});

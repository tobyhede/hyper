import { describe, expect, it } from 'vitest';
import { isDriverConnectionFailure } from '../../src/persistence/sql-store';

/**
 * What `@prisma-next/sql-errors`' `SqlConnectionError` carries, built by hand
 * because that package is the driver's dependency and not this repository's.
 * `SqlConnectionError.is` itself reads exactly this own `kind` field.
 */
const connectionError = (message: string, transient: boolean): Error =>
  Object.assign(new Error(message), { kind: 'sql_connection', transient });

/*
 * Ticket 31. Both drivers normalise a failed statement's connection trouble to
 * `SqlConnectionError`, and the repository names it unavailable. The driver's
 * `transient` flag answers a different question — whether an *immediate*
 * retry might succeed — and `@prisma-next/driver-postgres` marks a refused
 * connection `transient: false`, which is the database being down: exactly
 * what a reader answers "try again later" for. So the flag is not read, and
 * neither is the message, which is how ticket 18's two SQLite BUSY shapes stay
 * one answer without being told apart.
 */
describe('isDriverConnectionFailure', () => {
  it.each([
    ['SQLite BUSY, immediate or exhausted', connectionError('database is locked', true)],
    ['a connection the server dropped', connectionError('Connection terminated', false)],
  ])('recognises %s whatever its transient flag says', (_label, error) => {
    expect(isDriverConnectionFailure(error)).toBe(true);
  });

  // `@prisma-next/sql-runtime` carries a failed COMMIT's own error, and the
  // callback error behind a failed rollback, only on `.cause`.
  it('walks the cause chain the runtime wraps a failed COMMIT in', () => {
    const wrapped = new Error('Transaction commit failed', {
      cause: connectionError('database is locked', true),
    });

    expect(isDriverConnectionFailure(wrapped)).toBe(true);
  });

  it('refuses a statement failure and anything else', () => {
    expect(
      isDriverConnectionFailure(
        Object.assign(new Error('duplicate key'), { kind: 'sql_query', sqlState: '23505' }),
      ),
    ).toBe(false);
    expect(isDriverConnectionFailure(new Error('connect ECONNREFUSED 127.0.0.1:5432'))).toBe(false);
    expect(isDriverConnectionFailure(undefined)).toBe(false);
  });

  it('terminates on a cyclic cause chain', () => {
    const first = new Error('first');
    const second = new Error('second', { cause: first });
    first.cause = second;

    expect(isDriverConnectionFailure(first)).toBe(false);
  });
});

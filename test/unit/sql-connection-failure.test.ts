import postgres from '@prisma-next/postgres/runtime';
import { afterAll, describe, expect, it } from 'vitest';
import {
  isDriverConnectionFailure,
  isUnavailableStatementFailure,
  UNAVAILABLE_SQLSTATES,
} from '../../src/persistence/sql-store';
import type { Contract } from '../../src/prisma/contract.d';
import contractJson from '../../src/prisma/contract.json' with { type: 'json' };
import { postgresSqlStore } from '../../src/prisma/sql-store';

/**
 * What `@prisma-next/sql-errors`' `SqlConnectionError` carries, built by hand
 * because that package is the driver's dependency and not this repository's.
 * `SqlConnectionError.is` itself reads exactly this own `kind` field.
 */
const connectionError = (message: string, transient: boolean): Error =>
  Object.assign(new Error(message), { kind: 'sql_connection', transient });

/**
 * What `@prisma-next/sql-errors`' `SqlQueryError` carries: every SQLSTATE
 * failure `@prisma-next/driver-postgres`' `normalizePgError` sees becomes one,
 * with the code on `sqlState`, and SQLite's normaliser maps its own codes onto
 * the same field.
 */
const queryError = (message: string, sqlState: string): Error =>
  Object.assign(new Error(message), { kind: 'sql_query', sqlState });

/**
 * What `pg`'s `DatabaseError` carries when a connection's startup handshake
 * fails: the SQLSTATE on `code`, not normalised by the driver because
 * `pool.connect()` is outside its statement path.
 */
const rawPgError = (message: string, code: string): Error =>
  Object.assign(new Error(message), { code, severity: 'FATAL' });

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

/*
 * Ticket 31, amended. A PostgreSQL statement that fails for contention or an
 * outage reaches the repository as `SqlQueryError`, not `SqlConnectionError`,
 * because the driver turns every SQLSTATE failure into the former. These are
 * the database choosing a victim, refusing to wait, or not being up yet —
 * conditions a later attempt is exactly the answer to — so they are named
 * unavailable by the structured `sqlState` field, never by message.
 */
describe('isUnavailableStatementFailure', () => {
  it.each(UNAVAILABLE_SQLSTATES)('recognises SQLSTATE %s', (sqlState) => {
    expect(isUnavailableStatementFailure(queryError('failed', sqlState))).toBe(true);
  });

  it('names the set the amendment records', () => {
    expect([...UNAVAILABLE_SQLSTATES].sort()).toEqual(
      [
        '08000',
        '08001',
        '08003',
        '08004',
        '08006',
        '40001',
        '40P01',
        '53300',
        '55P03',
        '57P01',
        '57P02',
        '57P03',
      ].sort(),
    );
  });

  // A deadlock or serialization failure at COMMIT reaches the repository
  // wrapped, with the statement's own error only on `.cause`.
  it('walks the cause chain the runtime wraps a failed COMMIT in', () => {
    const wrapped = new Error('Transaction commit failed', {
      cause: queryError('could not serialize access', '40001'),
    });

    expect(isUnavailableStatementFailure(wrapped)).toBe(true);
  });

  it('refuses a defect, a message that merely names a code, and a connection failure', () => {
    // Unique violation, SQLite's catch-all, and a cancelled statement.
    expect(isUnavailableStatementFailure(queryError('duplicate key', '23505'))).toBe(false);
    expect(isUnavailableStatementFailure(queryError('no such table', 'HY000'))).toBe(false);
    expect(isUnavailableStatementFailure(queryError('canceling statement', '57014'))).toBe(false);
    // The code on something the driver did not normalise, and in prose.
    expect(
      isUnavailableStatementFailure(Object.assign(new Error('deadlock'), { sqlState: '40P01' })),
    ).toBe(false);
    expect(isUnavailableStatementFailure(new Error('deadlock detected (40P01)'))).toBe(false);
    expect(isUnavailableStatementFailure(connectionError('database is locked', true))).toBe(false);
    expect(isUnavailableStatementFailure(undefined)).toBe(false);
  });

  it('terminates on a cyclic cause chain', () => {
    const first = new Error('first');
    const second = new Error('second', { cause: first });
    first.cause = second;

    expect(isUnavailableStatementFailure(first)).toBe(false);
  });
});

/*
 * Ticket 38. Each database's store answers whether a failure is evidence the
 * database is unavailable, and the repository asks it rather than reading
 * driver fields itself. `postgresSqlStore` is built over a runtime that is
 * never connected: answering the predicate touches no database.
 */
describe('postgresSqlStore.isUnavailable', () => {
  const store = postgresSqlStore(
    postgres<Contract>({ contractJson, url: 'postgres://hyper:unused@127.0.0.1:1/hyper' }),
  );

  afterAll(async () => {
    await store.close();
  });

  it.each([
    ['a connection the server dropped', connectionError('Connection terminated', false)],
    ['a refused connection the driver normalised', connectionError('connect ECONNREFUSED', false)],
  ])('recognises %s whatever its transient flag says', (_label, error) => {
    expect(store.isUnavailable(error)).toBe(true);
  });

  it.each(UNAVAILABLE_SQLSTATES)(
    'recognises SQLSTATE %s on a statement the driver normalised',
    (sqlState) => {
      expect(store.isUnavailable(queryError('failed', sqlState))).toBe(true);
    },
  );

  // `pg` raises a failed startup handshake from `pool.connect()`, which the
  // driver does not normalise: the SQLSTATE is on `pg`'s own `code` field.
  it.each(['53300', '57P03'])('recognises SQLSTATE %s raised while connecting', (code) => {
    expect(store.isUnavailable(rawPgError('the server refused this client for now', code))).toBe(
      true,
    );
  });

  // Authentication and a missing database are the configuration or the
  // server refusing this client, which no wait cures (ticket 36).
  it.each([
    ['28P01', 'password authentication failed for user "hyper"'],
    ['28000', 'no pg_hba.conf entry for host'],
    ['3D000', 'database "missing" does not exist'],
  ])('leaves SQLSTATE %s raised while connecting unclassified', (code, message) => {
    expect(store.isUnavailable(rawPgError(message, code))).toBe(false);
  });
});

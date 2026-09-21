import postgres from '@prisma-next/postgres/runtime';
import { afterAll, describe, expect, it } from 'vitest';
import type { Contract } from '../../src/prisma/contract.d';
import contractJson from '../../src/prisma/contract.json' with { type: 'json' };
import { postgresSqlStore, UNAVAILABLE_SQLSTATES } from '../../src/prisma/sql-store';
import { createSqliteDatabase } from '../../src/sqlite/db';
import { sqliteSqlStore } from '../../src/sqlite/sql-store';
import { captureError } from '../support/capture-error';

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

/** What Node's `net` raises for a failed socket: the errno name on `code`. */
const socketError = (code: string): Error =>
  Object.assign(new Error(`connect ${code} 127.0.0.1:5432`), { code, syscall: 'connect' });

/** A chain of two errors, each the other's cause. */
const cyclicChain = (): Error => {
  const first = new Error('first');
  const second = new Error('second', { cause: first });
  first.cause = second;
  return first;
};

/*
 * Tickets 31 and 38. Each database's store answers whether a failure is
 * evidence the database is not answering for now, and `SqlSpaceRepository`
 * asks it rather than reading driver fields itself. `postgresSqlStore` is
 * built over a runtime that is never connected: answering touches no
 * database.
 */
describe('postgresSqlStore.isUnavailable', () => {
  const store = postgresSqlStore(
    postgres<Contract>({ contractJson, url: 'postgres://hyper:unused@127.0.0.1:1/hyper' }),
  );

  afterAll(async () => {
    await store.close();
  });

  // The driver's `transient` flag answers a different question — whether an
  // *immediate* retry might succeed — and `@prisma-next/driver-postgres` marks
  // a refused connection `transient: false`, which is the database being down.
  // So the flag is not read, and neither is the message.
  it.each([
    ['a connection the server dropped', connectionError('Connection terminated', false)],
    ['a refused connection the driver normalised', connectionError('connect ECONNREFUSED', false)],
  ])('recognises %s whatever its transient flag says', (_label, error) => {
    expect(store.isUnavailable(error)).toBe(true);
  });

  // Contention and shutdown reach the repository as `SqlQueryError`, because
  // the driver turns every SQLSTATE failure on a statement into one.
  it.each(UNAVAILABLE_SQLSTATES)(
    'recognises SQLSTATE %s on a statement the driver normalised',
    (sqlState) => {
      expect(store.isUnavailable(queryError('failed', sqlState))).toBe(true);
    },
  );

  it('names the set ticket 31 records', () => {
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

  // What Node raises from the socket under `pool.connect()`, which the driver
  // does not normalise either: the errno name on `code`.
  it.each(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN'])(
    'recognises the socket failure %s',
    (code) => {
      expect(store.isUnavailable(socketError(code))).toBe(true);
    },
  );

  // A host name that does not resolve is ordinarily a mistyped `DATABASE_URL`,
  // and the rest are not the network at all.
  it.each(['ENOTFOUND', 'EACCES', 'EPROTO', 'ERR_INVALID_ARG_TYPE'])(
    'leaves the error code %s unclassified',
    (code) => {
      expect(store.isUnavailable(socketError(code))).toBe(false);
    },
  );

  // `@prisma-next/sql-runtime` carries a failed COMMIT's own error, and the
  // callback error behind a failed rollback, only on `.cause`.
  it.each([
    ['a connection failure', connectionError('Connection terminated', false)],
    ['a serialization failure', queryError('could not serialize access', '40001')],
    ['a refused socket', socketError('ECONNREFUSED')],
    ['a server not accepting connections yet', rawPgError('the database is starting up', '57P03')],
  ])('walks the cause chain to %s', (_label, cause) => {
    const wrapped = new Error('Transaction commit failed', {
      cause: new Error('rollback failed', { cause }),
    });

    expect(store.isUnavailable(wrapped)).toBe(true);
  });

  it('terminates on a cyclic cause chain', () => {
    expect(store.isUnavailable(cyclicChain())).toBe(false);
  });

  it('leaves a defect, an unknown code and a code named only in prose unclassified', () => {
    // Unique violation, SQLite's catch-all, a cancelled statement, and an
    // unknown SQLSTATE, each on a statement the driver normalised.
    expect(store.isUnavailable(queryError('duplicate key', '23505'))).toBe(false);
    expect(store.isUnavailable(queryError('no such table', 'HY000'))).toBe(false);
    expect(store.isUnavailable(queryError('canceling statement', '57014'))).toBe(false);
    expect(store.isUnavailable(queryError('unknown', 'XX999'))).toBe(false);
    // An unavailable code on a field no driver puts it on, and in prose.
    expect(store.isUnavailable(Object.assign(new Error('deadlock'), { sqlState: '40P01' }))).toBe(
      false,
    );
    expect(store.isUnavailable(new Error('deadlock detected (40P01)'))).toBe(false);
    expect(store.isUnavailable(new Error('connect ECONNREFUSED 127.0.0.1:5432'))).toBe(false);
    // Not an error at all.
    expect(store.isUnavailable(undefined)).toBe(false);
    expect(store.isUnavailable({ code: 'ECONNREFUSED' })).toBe(false);
  });
});

/*
 * Ticket 38. SQLite's store recognises what its driver normalises — BUSY and
 * LOCKED arrive as `SqlConnectionError` (ticket 18), and ticket 18's two BUSY
 * shapes (immediate and exhausted) stay one answer without being told apart —
 * and, as a contained compatibility check, the one failure the pinned runtime
 * raises for a client that has been closed, which carries nothing but its
 * message.
 */
describe('sqliteSqlStore.isUnavailable', () => {
  it.each([
    ['SQLite BUSY, immediate or exhausted', connectionError('database is locked', true)],
    ['SQLite LOCKED', connectionError('database table is locked', true)],
  ])('recognises %s', (_label, error) => {
    const store = sqliteSqlStore(createSqliteDatabase());

    expect(store.isUnavailable(error)).toBe(true);
    expect(store.isUnavailable(new Error('Transaction commit failed', { cause: error }))).toBe(
      true,
    );
  });

  it('recognises the error the pinned runtime raises for a closed client', async () => {
    const database = createSqliteDatabase();
    const store = sqliteSqlStore(database);
    await database.close();

    const closed = await captureError(() => database.transaction(() => Promise.resolve()));

    expect(closed).toMatchObject({ message: 'SQLite client is closed' });
    expect(store.isUnavailable(closed)).toBe(true);
    expect(store.isUnavailable(new Error('wrapped', { cause: closed }))).toBe(true);
  });

  it('terminates on a cyclic cause chain', () => {
    expect(sqliteSqlStore(createSqliteDatabase()).isUnavailable(cyclicChain())).toBe(false);
  });

  it('leaves unrelated plain errors unclassified', () => {
    const store = sqliteSqlStore(createSqliteDatabase());

    expect(store.isUnavailable(new Error('SQLite client already connected'))).toBe(false);
    expect(store.isUnavailable(new TypeError('SQLite client is closed'))).toBe(false);
    expect(store.isUnavailable(queryError('UNIQUE constraint failed: spaces.id', '23505'))).toBe(
      false,
    );
    expect(store.isUnavailable(socketError('ECONNREFUSED'))).toBe(false);
    expect(store.isUnavailable(undefined)).toBe(false);
  });
});

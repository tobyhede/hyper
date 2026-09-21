import postgres from '@prisma-next/postgres/runtime';
import { uuidSchema } from '@project/core';
import { classifyStoredFailure, PersistenceUnavailableError } from '@project/persistence';
import { afterAll, describe, expect, it } from 'vitest';
import type { SpaceRepository } from '../../src/persistence/space-repository';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import type { Contract } from '../../src/prisma/contract.d';
import contractJson from '../../src/prisma/contract.json' with { type: 'json' };
import { postgresSqlStore } from '../../src/prisma/sql-store';
import { captureError } from '../support/capture-error';
import { startRefusingPostgresServer } from '../support/refusing-postgres-server';

/** Every error on a failure's cause chain, the failure first. */
const causeChain = (failure: Error | undefined): readonly unknown[] => {
  const chain: unknown[] = [];
  let current: unknown = failure;
  while (current instanceof Error && !chain.includes(current)) {
    chain.push(current);
    current = current.cause;
  }
  return chain;
};

const SPACE_ID = uuidSchema.parse('d0000000-0000-4000-8000-000000000001');

const database = postgres<Contract>({
  contractJson,
  // Port 1 refuses at once on loopback, as `vite-hono-host.test.ts`'s
  // "composes an application when the repository cannot be reached" relies on.
  url: 'postgres://hyper:unused@127.0.0.1:1/hyper',
});
const repository = new SqlSpaceRepository(postgresSqlStore(database));

/*
 * The same refusing server for the reads that run outside a transaction, with
 * the contract-marker check off. Left on, the first statement a runtime runs
 * reads the marker first, and a failed marker read reaches the repository as
 * `CliStructuredError` 3006 with the driver's reason only in prose — nothing a
 * store can recognise — and is cached for the life of the runtime (ticket 37).
 * Off, what these reads meet is the connection itself.
 */
const unverifiedDatabase = postgres<Contract>({
  contractJson,
  url: 'postgres://hyper:unused@127.0.0.1:1/hyper',
  verifyMarker: false,
});
const unverified = new SqlSpaceRepository(postgresSqlStore(unverifiedDatabase));

afterAll(async () => {
  await database.close();
  await unverifiedDatabase.close();
});

/*
 * Tickets 31 and 38. PostgreSQL being down is the case the unavailable arm
 * exists for, and it does not always reach the repository as the driver's own
 * `SqlConnectionError`: `@prisma-next/driver-postgres` acquires a connection
 * with a bare `pool.connect()` and normalises nothing it raises, so on that
 * path the refusal escapes as Node's own `ECONNREFUSED` error. The PostgreSQL
 * store recognises it by the errno name on `code` (`src/prisma/sql-store.ts`),
 * whichever path raised it, so every reader that asks one of these operations
 * gets the arm it is owed. No database is needed to show it; this is a server
 * that is not there.
 */
describe('SqlSpaceRepository (PostgreSQL) against a server that refuses connections', () => {
  it('names the aggregate read unavailable, keeping the driver error on cause', async () => {
    const error = await captureError(() => repository.loadAggregate());

    expect(error).toBeInstanceOf(PersistenceUnavailableError);
    expect(error?.cause).toMatchObject({ code: 'ECONNREFUSED' });
  });

  it('names a commit unavailable', async () => {
    await expect(
      repository.commit({
        changes: [
          {
            kind: 'create',
            spaceId: SPACE_ID,
            snapshot: {
              id: SPACE_ID,
              document: { version: 1, title: 'Never stored' },
              resources: [],
            },
          },
        ],
      }),
    ).rejects.toBeInstanceOf(PersistenceUnavailableError);
  });

  it('names establishment unavailable', async () => {
    await expect(
      repository.initializeAggregate({
        metaSpaceId: SPACE_ID,
        spaces: [{ id: SPACE_ID, document: { version: 1, title: 'Meta' }, resources: [] }],
      }),
    ).rejects.toBeInstanceOf(PersistenceUnavailableError);
  });

  /*
   * Ticket 38. A read outside a transaction meets the same refused connection,
   * and on some paths the driver normalises it and on others it escapes as
   * Node's own error. Either way it is the store that recognises it, so every
   * operation answers the same arm whatever path it took.
   */
  it.each([
    ['listSpaces', async () => void (await unverified.listSpaces())],
    ['loadSpace', async () => void (await unverified.loadSpace(SPACE_ID))],
    ['loadMetaSpaceId', async () => void (await unverified.loadMetaSpaceId())],
    ['markExported', () => unverified.markExported(SPACE_ID, 1n)],
  ])('names %s unavailable, keeping the refusal on the cause chain', async (_label, operation) => {
    const error = await captureError(operation);

    expect(error).toBeInstanceOf(PersistenceUnavailableError);
    expect(causeChain(error)).toContainEqual(expect.objectContaining({ code: 'ECONNREFUSED' }));
  });
});

/*
 * Ticket 38 (and ticket 36). A server that answers the startup handshake by
 * refusing this client raises `pg`'s own `DatabaseError` from `pool.connect()`,
 * before any transaction callback runs, on every path. Whether that is an
 * outage is a fact about the SQLSTATE it carries — never about where it
 * failed: a wrong password, a refused authorization or a missing database is
 * the configuration, which no wait cures, while too many connections or a
 * server still starting up is the database not answering for now.
 */
describe('SqlSpaceRepository (PostgreSQL) against a server that refuses this client', () => {
  const refusedBy = async (sqlState: string, message: string) => {
    const server = await startRefusingPostgresServer(sqlState, message);
    const refusing = postgres<Contract>({ contractJson, url: server.url, verifyMarker: false });
    return {
      repository: new SqlSpaceRepository(postgresSqlStore(refusing)),
      close: async () => {
        await refusing.close();
        await server.close();
      },
    };
  };

  const operations = (repository: SpaceRepository) =>
    [
      ['loadAggregate', async () => void (await repository.loadAggregate())],
      ['listSpaces', async () => void (await repository.listSpaces())],
    ] as const;

  it.each([
    ['28P01', 'password authentication failed for user "hyper"'],
    ['28000', 'no pg_hba.conf entry for host "127.0.0.1", user "hyper", database "hyper"'],
    ['3D000', 'database "hyper" does not exist'],
  ])('leaves SQLSTATE %s unclassified inside and outside a transaction', async (code, message) => {
    const { repository, close } = await refusedBy(code, message);
    try {
      for (const [name, operation] of operations(repository)) {
        const error = await captureError(operation);
        expect(classifyStoredFailure(error), name).toBe('unclassified');
        expect(causeChain(error), name).toContainEqual(expect.objectContaining({ code }));
      }
    } finally {
      await close();
    }
  });

  it.each([
    ['53300', 'sorry, too many clients already'],
    ['57P03', 'the database system is starting up'],
  ])('names SQLSTATE %s unavailable inside and outside a transaction', async (code, message) => {
    const { repository, close } = await refusedBy(code, message);
    try {
      for (const [name, operation] of operations(repository)) {
        const error = await captureError(operation);
        expect(error, name).toBeInstanceOf(PersistenceUnavailableError);
        expect(causeChain(error), name).toContainEqual(expect.objectContaining({ code }));
      }
    } finally {
      await close();
    }
  });
});

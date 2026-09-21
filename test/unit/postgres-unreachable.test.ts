import { createServer } from 'node:net';
import postgres from '@prisma-next/postgres/runtime';
import { uuidSchema } from '@project/core';
import { createSpaceHttpApp } from '@project/http';
import {
  classifyStoredFailure,
  decodeProblemDetails,
  PersistenceUnavailableError,
  problemCatalogue,
} from '@project/persistence';
import { afterAll, describe, expect, it } from 'vitest';
import type { SpaceRepository } from '../../src/persistence/space-repository';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import type { Contract } from '../../src/prisma/contract.d';
import { postgresOptionsFor } from '../../src/prisma/db';
import { postgresSqlStore } from '../../src/prisma/sql-store';
import { captureError } from '../support/capture-error';
import {
  closeServer,
  listenOnLoopback,
  loopbackPort,
  startRefusingPostgresServer,
} from '../support/refusing-postgres-server';

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

// Port 1 refuses at once on loopback, as `vite-hono-host.test.ts`'s "composes
// an application when the repository cannot be reached" relies on. Built with
// `postgresOptionsFor`, the same options `createPostgresDatabase` passes, so
// every read below — direct and transactional alike — meets the connection
// refusal itself rather than a cached contract-marker failure.
const database = postgres<Contract>(
  postgresOptionsFor('postgres://hyper:unused@127.0.0.1:1/hyper'),
);
const repository = new SqlSpaceRepository(postgresSqlStore(database));

afterAll(async () => {
  await database.close();
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
    ['listSpaces', async () => void (await repository.listSpaces())],
    ['loadSpace', async () => void (await repository.loadSpace(SPACE_ID))],
    ['loadMetaSpaceId', async () => void (await repository.loadMetaSpaceId())],
    ['markExported', () => repository.markExported(SPACE_ID, 1n)],
  ])('names %s unavailable, keeping the refusal on the cause chain', async (_label, operation) => {
    const error = await captureError(operation);

    expect(error).toBeInstanceOf(PersistenceUnavailableError);
    expect(causeChain(error)).toContainEqual(expect.objectContaining({ code: 'ECONNREFUSED' }));
  });
});

/*
 * Ticket 37. `@prisma-next/sql-runtime` memoises its contract-marker read
 * (`verifyMarkerPromise`) and never resets it on rejection, so with the check
 * left on, a runtime whose first statement meets an outage answers every
 * later read with that same cached failure, without touching the network, for
 * the rest of the runtime's life. `postgresOptionsFor` builds this runtime the
 * way `createPostgresDatabase` does — `verifyMarker: false` included — so a
 * second read against the same refusing server reaches the network again
 * instead of repeating the first read's cached failure.
 */
describe('SqlSpaceRepository (PostgreSQL) after a first read meets an outage', () => {
  it('reaches the database on the next read rather than repeating the first failure', async () => {
    // One server for the whole test, so there is no free-port handoff for
    // another process to win in between: every connection this server ever
    // accepts, first read and second alike, it counts and cuts.
    let connections = 0;
    const server = createServer((socket) => {
      connections += 1;
      socket.destroy();
    });
    await listenOnLoopback(server);
    const port = loopbackPort(server);

    const outageDatabase = postgres<Contract>(
      postgresOptionsFor(`postgres://hyper:unused@127.0.0.1:${port}/hyper`),
    );
    const outageRepository = new SqlSpaceRepository(postgresSqlStore(outageDatabase));
    try {
      const first = await captureError(() => outageRepository.listSpaces());
      expect(first).toBeInstanceOf(Error);
      const connectionsAfterFirst = connections;

      const second = await captureError(() => outageRepository.listSpaces());

      expect(second).toBeInstanceOf(Error);
      expect(second).not.toBe(first);
      expect(connections).toBeGreaterThan(connectionsAfterFirst);
    } finally {
      await outageDatabase.close();
      await closeServer(server);
    }
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
    const refusing = postgres<Contract>(postgresOptionsFor(server.url));
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
    const { repository: refusingRepository, close } = await refusedBy(code, message);
    try {
      for (const [name, operation] of operations(refusingRepository)) {
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
    const { repository: refusingRepository, close } = await refusedBy(code, message);
    try {
      for (const [name, operation] of operations(refusingRepository)) {
        const error = await captureError(operation);
        expect(error, name).toBeInstanceOf(PersistenceUnavailableError);
        expect(causeChain(error), name).toContainEqual(expect.objectContaining({ code }));
      }
    } finally {
      await close();
    }
  });
});

/*
 * Ticket 38. The HTTP answer for a direct read follows the classification the
 * repository gives it: an outage is 503 `persistence-unavailable`, which tells
 * a client to try again, and a configuration failure is 500 `internal-error`,
 * which does not.
 */
describe('The Space API over a PostgreSQL server that will not serve it', () => {
  const problemType = async (response: Response) => {
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    return decodeProblemDetails(await response.json()).type;
  };

  it('answers a refused connection on a direct read 503 persistence-unavailable', async () => {
    const app = createSpaceHttpApp(repository, { logError: () => undefined });

    for (const path of ['/api/spaces', `/api/spaces/${SPACE_ID}`]) {
      const response = await app.request(path);
      expect(response.status, path).toBe(503);
      expect(await problemType(response), path).toBe(
        problemCatalogue['persistence-unavailable'].type,
      );
    }
  });

  it('answers a wrong password on a direct read 500 internal-error', async () => {
    const server = await startRefusingPostgresServer(
      '28P01',
      'password authentication failed for user "hyper"',
    );
    const refusing = postgres<Contract>(postgresOptionsFor(server.url));
    try {
      const app = createSpaceHttpApp(new SqlSpaceRepository(postgresSqlStore(refusing)), {
        logError: () => undefined,
      });

      for (const path of ['/api/spaces', `/api/spaces/${SPACE_ID}`]) {
        const response = await app.request(path);
        expect(response.status, path).toBe(500);
        expect(await problemType(response), path).toBe(problemCatalogue['internal-error'].type);
      }
    } finally {
      await refusing.close();
      await server.close();
    }
  });
});

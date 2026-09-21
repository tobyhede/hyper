import postgres from '@prisma-next/postgres/runtime';
import { uuidSchema } from '@project/core';
import { PersistenceUnavailableError } from '@project/persistence';
import { afterAll, describe, expect, it } from 'vitest';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import type { Contract } from '../../src/prisma/contract.d';
import contractJson from '../../src/prisma/contract.json' with { type: 'json' };
import { postgresSqlStore } from '../../src/prisma/sql-store';
import { captureError } from '../support/capture-error';

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
 * Ticket 31. PostgreSQL being down is the case the unavailable arm exists for,
 * and it never reaches the repository as the driver's own `SqlConnectionError`:
 * the pool's refused connection escapes `@prisma-next/driver-postgres`
 * un-normalised, as Node's own `ECONNREFUSED` error, because the driver only
 * normalises errors from a statement and not from acquiring the connection it
 * runs on. So the repository names it by position — the database would not
 * open a transaction — rather than by the driver's type, and every reader that
 * asks one of these operations gets the arm it is owed. No database is needed
 * to show it; this is a server that is not there.
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

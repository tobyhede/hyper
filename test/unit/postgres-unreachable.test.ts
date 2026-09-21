import postgres from '@prisma-next/postgres/runtime';
import { uuidSchema } from '@project/core';
import { PersistenceUnavailableError } from '@project/persistence';
import { afterAll, describe, expect, it } from 'vitest';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import type { Contract } from '../../src/prisma/contract.d';
import contractJson from '../../src/prisma/contract.json' with { type: 'json' };
import { postgresSqlStore } from '../../src/prisma/sql-store';
import { captureError } from '../support/capture-error';

const SPACE_ID = uuidSchema.parse('d0000000-0000-4000-8000-000000000001');

const database = postgres<Contract>({
  contractJson,
  // Port 1 refuses at once on loopback, as `vite-hono-host.test.ts`'s
  // "composes an application when the repository cannot be reached" relies on.
  url: 'postgres://hyper:unused@127.0.0.1:1/hyper',
});
const repository = new SqlSpaceRepository(postgresSqlStore(database));

afterAll(async () => {
  await database.close();
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
});

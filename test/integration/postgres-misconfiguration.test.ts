import postgres from '@prisma-next/postgres/runtime';
import { classifyStoredFailure, PersistenceUnavailableError } from '@project/persistence';
import { describe, expect, it } from 'vitest';
import type { SpaceRepository } from '../../src/persistence/space-repository';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import type { Contract } from '../../src/prisma/contract.d';
import contractJson from '../../src/prisma/contract.json' with { type: 'json' };
import { configuredDatabaseUrl } from '../../src/prisma/db';
import { postgresSqlStore } from '../../src/prisma/sql-store';
import {
  META_SPACE_RETRY_INITIAL_DELAY_MS,
  META_SPACE_RETRY_MAX_DELAY_MS,
  retryMetaSpaceEstablishment,
} from '../../src/startup/database-startup';
import { captureError } from '../support/capture-error';

/*
 * Ticket 38, against a real PostgreSQL. `test/unit/postgres-unreachable.test.ts`
 * replays a FATAL handshake refusal from a stand-in server; this file asks the
 * server `test:integration:postgres` migrated to refuse this client for real —
 * a wrong password through its SCRAM login, and a database that does not exist
 * — and holds what reaches the repository to the same rule: configuration is
 * unclassified, never `PersistenceUnavailableError`, on a direct read and
 * inside a transaction alike. Nothing here needs a migration or a row.
 */

const databaseUrl = (): URL => {
  const url = configuredDatabaseUrl();
  if (url === undefined) {
    throw new Error('The PostgreSQL integration suite needs DATABASE_URL.');
  }
  return new URL(url);
};

/** The configured URL with a password the server will not accept. */
const wrongPasswordUrl = (): string => {
  const url = databaseUrl();
  url.password = `${url.password}-not-the-password`;
  return url.href;
};

/** The configured URL, credentials intact, naming a database the server does not have. */
const missingDatabaseUrl = (): string => {
  const url = databaseUrl();
  url.pathname = '/hyper_ticket_38_absent';
  return url.href;
};

/**
 * Whether the runtime reads the contract marker before its first statement.
 * `'onFirstUse'` is the runtime's default and what production opens with
 * (`src/prisma/db.ts`); `false` lets a direct read meet the connection itself.
 */
type MarkerArrangement = 'onFirstUse' | false;

/**
 * One operation against a fresh runtime, closed afterwards. Fresh, because a
 * failed marker read is cached for the life of a runtime (ticket 37), so a
 * shared one would make each operation's answer depend on the one before it.
 */
const failureOf = async (
  url: string,
  verifyMarker: MarkerArrangement,
  operation: (repository: SpaceRepository) => Promise<void>,
): Promise<Error | undefined> => {
  const database = postgres<Contract>({ contractJson, url, verifyMarker });
  try {
    return await captureError(() => operation(new SqlSpaceRepository(postgresSqlStore(database))));
  } finally {
    await database.close();
  }
};

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

describe.each([
  ['a wrong password', '28P01', wrongPasswordUrl],
  ['a database that does not exist', '3D000', missingDatabaseUrl],
])('SqlSpaceRepository (PostgreSQL) given %s', (_label, sqlState, url) => {
  it.each([['onFirstUse' as const], [false as const]])(
    'leaves the transactional aggregate read unclassified with the raw handshake refusal (marker %s)',
    async (verifyMarker) => {
      const error = await failureOf(url(), verifyMarker, async (repository) => {
        await repository.loadAggregate();
      });

      expect(error).not.toBeInstanceOf(PersistenceUnavailableError);
      expect(classifyStoredFailure(error)).toBe('unclassified');
      // `pg`'s own `DatabaseError`, raised by `pool.connect()` and never normalised.
      expect(error).toMatchObject({ code: sqlState, severity: 'FATAL' });
      expect(error).not.toHaveProperty('kind');
      expect(error?.cause).toBeUndefined();
    },
  );

  it('leaves a direct read unclassified with the normalised refusal when the marker is off', async () => {
    const error = await failureOf(url(), false, async (repository) => {
      await repository.listSpaces();
    });

    expect(error).not.toBeInstanceOf(PersistenceUnavailableError);
    expect(classifyStoredFailure(error)).toBe('unclassified');
    expect(error).toMatchObject({ kind: 'sql_query', sqlState });
    expect(error?.cause).toMatchObject({ code: sqlState, severity: 'FATAL' });
  });

  /*
   * Ticket 37's shape: the marker read fails first and reaches the repository
   * as `CliStructuredError` 3006 with no cause, so the SQLSTATE is not on the
   * chain at all. It is still configuration and still unclassified.
   */
  it('leaves a direct read unclassified as the failed marker read when the marker is on', async () => {
    const error = await failureOf(url(), 'onFirstUse', async (repository) => {
      await repository.listSpaces();
    });

    expect(error).not.toBeInstanceOf(PersistenceUnavailableError);
    expect(classifyStoredFailure(error)).toBe('unclassified');
    expect(error).toMatchObject({ name: 'CliStructuredError', code: '3006' });
    expect(error?.cause).toBeUndefined();
    expect(causeChain(error)).not.toContainEqual(expect.objectContaining({ code: sqlState }));
  });
});

/*
 * Ticket 38 (and ticket 36): start-up over a real server that will not take
 * this password. The refusal is unclassified, so the second attempt confirms
 * it and the retry stops, rather than waiting forever for an outage to end.
 * Establishment fails at its first read, before it mints anything.
 */
describe('retryMetaSpaceEstablishment over PostgreSQL given a wrong password', () => {
  it('gives up once a second attempt confirms the refusal', async () => {
    const database = postgres<Contract>({ contractJson, url: wrongPasswordUrl() });
    const waits: number[] = [];
    const reported: unknown[] = [];
    try {
      const metaSpaceId = await retryMetaSpaceEstablishment(
        new SqlSpaceRepository(postgresSqlStore(database)),
        () => {
          throw new Error('Start-up minted an identity before reaching the database.');
        },
        {
          // Bounded, so a refusal read as an outage fails here rather than
          // retrying against the server until the test times out.
          wait: (milliseconds) => {
            waits.push(milliseconds);
            return waits.length > 5
              ? Promise.reject(new Error('Start-up kept retrying a wrong password.'))
              : Promise.resolve();
          },
          report: (error) => reported.push(error),
        },
      );

      expect(metaSpaceId).toBeUndefined();
      expect(waits).toEqual([
        META_SPACE_RETRY_INITIAL_DELAY_MS,
        Math.min(META_SPACE_RETRY_INITIAL_DELAY_MS * 2, META_SPACE_RETRY_MAX_DELAY_MS),
      ]);
      expect(reported.map(classifyStoredFailure)).toEqual(['unclassified', 'unclassified']);
      expect(reported).toEqual([
        expect.objectContaining({ code: '28P01' }),
        expect.objectContaining({ code: '28P01' }),
      ]);
    } finally {
      await database.close();
    }
  });
});

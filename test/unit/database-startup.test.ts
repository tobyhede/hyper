import { uuidSchema, type UUID } from '@project/core';
import { nextGraphColor } from '@project/graph';
import postgres from '@prisma-next/postgres/runtime';
import {
  AggregateInvariantError,
  classifyStoredFailure,
  PersistenceUnavailableError,
  type AggregateLoadResult,
  type LoadedSpace,
} from '@project/persistence';
import type { InitializeAggregateResult } from '../../src/persistence/space-repository';
import { describe, expect, it } from 'vitest';
import {
  DefaultContentInvalidError,
  establishMetaSpace,
  META_SPACE_RETRY_INITIAL_DELAY_MS,
  META_SPACE_RETRY_MAX_DELAY_MS,
  retryMetaSpaceEstablishment,
} from '../../src/startup/database-startup';
import { defaultContentAggregate } from '../../src/startup/default-content';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import type { Contract } from '../../src/prisma/contract.d';
import { postgresOptionsFor } from '../../src/prisma/db';
import { postgresSqlStore } from '../../src/prisma/sql-store';
import { MemorySpaceRepository } from '../../src/persistence/memory-space-repository';
import { startRefusingPostgresServer } from '../support/refusing-postgres-server';

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const OTHER_SPACE_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const RESOURCE_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const MAP_ID = uuidSchema.parse('55555555-5555-4555-8555-555555555555');
const GRAPH_ID = uuidSchema.parse('66666666-6666-4666-8666-666666666666');

/**
 * The identities startup is about to mint, named in the order it mints them
 * (ADR 0109). Exhaustion throws rather than falling back to the ambient
 * generator, so an extra mint is observable at the operation that made it.
 */
const mintingIds = (...ids: readonly [UUID, ...UUID[]]): (() => UUID) => {
  let next = 0;
  return () => {
    const id = ids[next++];
    if (id === undefined) throw new Error('Startup minted more identities than expected.');
    return id;
  };
};

const storedSpace = (
  revision: bigint,
  id = SPACE_ID,
  resourceId = RESOURCE_ID,
  title = 'Existing space',
): LoadedSpace => ({
  snapshot: {
    id,
    document: { version: 1, title },
    resources: [
      {
        id: resourceId,
        document: { title: 'Existing resource', kind: 'markdown', body: '' },
      },
    ],
  },
  revision,
  exportedRevision: null,
});

describe('defaultContentAggregate', () => {
  it('mints one complete Meta Space through the injected identity source', () => {
    const aggregate = defaultContentAggregate(mintingIds(SPACE_ID, RESOURCE_ID, MAP_ID, GRAPH_ID));

    expect(aggregate).toEqual({
      metaSpaceId: SPACE_ID,
      spaces: [
        {
          id: SPACE_ID,
          document: {
            version: 1,
            title: 'New space',
            defaultMap: MAP_ID,
            maps: [
              {
                id: MAP_ID,
                title: 'Map 1',
                kind: 'positioned',
                positions: { [RESOURCE_ID]: { x: 0, y: 0, open: false } },
                graphs: [
                  {
                    id: GRAPH_ID,
                    title: 'Graph 1',
                    color: nextGraphColor([]),
                    headShape: 'arrow',
                    edges: [],
                  },
                ],
                activeGraph: GRAPH_ID,
              },
            ],
          },
          resources: [
            { id: RESOURCE_ID, document: { title: 'Resource 1', kind: 'markdown', body: '' } },
          ],
        },
      ],
    });
  });
});

describe('establishMetaSpace', () => {
  it('initializes an uninitialized repository from Default Content', async () => {
    const repository = new MemorySpaceRepository();

    const metaSpaceId = await establishMetaSpace(
      repository,
      mintingIds(SPACE_ID, RESOURCE_ID, MAP_ID, GRAPH_ID),
    );

    expect(metaSpaceId).toBe(SPACE_ID);
    await expect(repository.loadAggregate()).resolves.toMatchObject({
      kind: 'loaded',
      aggregate: { metaSpaceId: SPACE_ID },
    });
  });

  it('answers the stored Meta identity without reseeding an initialized repository', async () => {
    const existing = storedSpace(4n);
    const repository = new MemorySpaceRepository([existing], SPACE_ID);

    // The minter refuses every call, so a second seeding attempt fails here
    // rather than quietly replacing authored state.
    const metaSpaceId = await establishMetaSpace(repository, () => {
      throw new Error('Startup minted an identity for an initialized repository');
    });

    expect(metaSpaceId).toBe(SPACE_ID);
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: SPACE_ID, title: 'Existing space' },
    ]);
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(existing);
  });

  it('fails explicitly on stored Spaces that no Meta identity names', async () => {
    const repository = MemorySpaceRepository.withoutMetaIdentity([storedSpace(4n)]);

    // Asked of the adapter first, because the refusal is the adapter's: a
    // subclass overriding `loadAggregate` proved only that startup forwards
    // whatever it is handed, and left the branch that decides it unexecuted.
    //
    // The type rather than the message. Classification is what a reader acts on
    // — the root address picks a status from it and start-up decides whether to
    // keep trying — so pinning the prose here would leave the assertion and the
    // behaviour it stands for testing different resources.
    await expect(repository.loadAggregate()).rejects.toThrow(AggregateInvariantError);
    await expect(establishMetaSpace(repository, mintingIds(OTHER_SPACE_ID))).rejects.toThrow(
      AggregateInvariantError,
    );
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: SPACE_ID, title: 'Existing space' },
    ]);
  });
});

/**
 * A repository whose reads follow a script.
 *
 * One double rather than three, because all three cases differ only in the
 * sequence of failures a read produces: an outage, the READ COMMITTED
 * interleaving that makes a healthy repository look contradictory for exactly
 * one read, or any mixture of the two. `loadAggregate` is where establishment
 * reaches the database first, so failing it there is the whole failure: nothing
 * is minted and nothing is written, which is what makes "the retry established
 * it" a claim about the retry rather than about a half-written repository.
 *
 * A script entry of `undefined` lets the read through to the real memory
 * repository. Reads past the end of the script are let through too.
 */
class ScriptedRepository extends MemorySpaceRepository {
  #reads = 0;
  readonly #script: readonly (Error | undefined)[];

  constructor(script: readonly (Error | undefined)[]) {
    super();
    this.#script = script;
  }

  override loadAggregate(): Promise<AggregateLoadResult> {
    const scripted = this.#script[this.#reads];
    this.#reads += 1;
    return scripted === undefined ? super.loadAggregate() : Promise.reject(scripted);
  }
}

const unreachable = (): Error =>
  new PersistenceUnavailableError('connect ECONNREFUSED 127.0.0.1:5432');
/** Neither named arm: a code defect, or a driver failure nobody anticipated. */
const unclassified = (): Error => new TypeError('Cannot read properties of undefined');
const invariant = (): Error =>
  new AggregateInvariantError('Stored Spaces exist without a Meta Space');

/** A `wait` that records what it was asked for instead of spending it. */
const recordingWait = (waits: number[]) => (milliseconds: number) => {
  waits.push(milliseconds);
  return Promise.resolve();
};

/** The four ids one establishment mints, and no more. */
const establishmentIds = () => mintingIds(SPACE_ID, RESOURCE_ID, MAP_ID, GRAPH_ID);

describe('retryMetaSpaceEstablishment', () => {
  it('establishes the Meta Space once the database comes back', async () => {
    const repository = new ScriptedRepository([unreachable(), unreachable()]);
    const waits: number[] = [];
    const reported: unknown[] = [];

    const metaSpaceId = await retryMetaSpaceEstablishment(repository, establishmentIds(), {
      wait: recordingWait(waits),
      report: (error) => reported.push(error),
    });

    expect(metaSpaceId).toBe(SPACE_ID);
    expect(reported).toHaveLength(2);
    await expect(repository.loadAggregate()).resolves.toMatchObject({
      kind: 'loaded',
      aggregate: { metaSpaceId: SPACE_ID },
    });
  });

  // The delay grows so a database that is down for a long time is not read
  // every five seconds for the life of the process, and stops growing so a
  // database that comes back late is still found within a minute of doing so.
  it('backs off, up to a bound it then holds', async () => {
    const outage = Array.from({ length: 8 }, unreachable);
    const repository = new ScriptedRepository(outage);
    const waits: number[] = [];

    await retryMetaSpaceEstablishment(repository, establishmentIds(), {
      wait: recordingWait(waits),
      report: () => undefined,
    });

    expect(waits).toEqual([
      META_SPACE_RETRY_INITIAL_DELAY_MS,
      10_000,
      20_000,
      40_000,
      META_SPACE_RETRY_MAX_DELAY_MS,
      META_SPACE_RETRY_MAX_DELAY_MS,
      META_SPACE_RETRY_MAX_DELAY_MS,
      META_SPACE_RETRY_MAX_DELAY_MS,
      META_SPACE_RETRY_MAX_DELAY_MS,
    ]);
  });

  // The retry has no attempt bound. A container that starts before PostgreSQL
  // accepts connections, over a database that takes a long time to arrive, would
  // otherwise serve 503 at the root forever: the root address establishes
  // nothing, so start-up is the only thing that will.
  it('keeps trying through forty unreachable attempts', async () => {
    const repository = new ScriptedRepository(Array.from({ length: 40 }, unreachable));
    const waits: number[] = [];

    const metaSpaceId = await retryMetaSpaceEstablishment(repository, establishmentIds(), {
      wait: recordingWait(waits),
      report: () => undefined,
    });

    expect(metaSpaceId).toBe(SPACE_ID);
    expect(waits).toHaveLength(41);
  });

  it('stops at contradictory stored state that a second read confirms', async () => {
    const repository = MemorySpaceRepository.withoutMetaIdentity([storedSpace(4n)]);
    const waits: number[] = [];
    const reported: unknown[] = [];

    const metaSpaceId = await retryMetaSpaceEstablishment(repository, mintingIds(OTHER_SPACE_ID), {
      wait: recordingWait(waits),
      report: (error) => reported.push(error),
    });

    // Two attempts: the second read finds the same documents and fails the same
    // way, and the identifiable error is what says so.
    expect(metaSpaceId).toBeUndefined();
    expect(waits).toEqual([META_SPACE_RETRY_INITIAL_DELAY_MS, 10_000]);
    expect(reported).toEqual([
      expect.any(AggregateInvariantError),
      expect.any(AggregateInvariantError),
    ]);
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: SPACE_ID, title: 'Existing space' },
    ]);
  });

  it('keeps trying through one invariant failure, which can be a healthy race', async () => {
    // `loadAggregate` reads the Meta identity and the Spaces in two statements
    // under READ COMMITTED, so a rival host committing between them makes a
    // healthy repository look contradictory for exactly one read. The next read
    // sees both halves, which is why one of these is not a verdict.
    const repository = new ScriptedRepository([invariant()]);
    const waits: number[] = [];
    const reported: unknown[] = [];

    const metaSpaceId = await retryMetaSpaceEstablishment(repository, establishmentIds(), {
      wait: recordingWait(waits),
      report: (error) => reported.push(error),
    });

    expect(metaSpaceId).toBe(SPACE_ID);
    expect(reported).toEqual([expect.any(AggregateInvariantError)]);
  });

  // Only an unreachable database is worth waiting out. A failure neither named
  // arm describes counts toward giving up exactly as an invariant failure does:
  // two running, so a one-off is not a verdict and a defect — which fails the
  // same way every time — is. Resetting the count instead would read a defect
  // no retry cures once a minute, forever.
  it('stops at a failure it cannot classify once a second attempt confirms it', async () => {
    const repository = new ScriptedRepository(Array.from({ length: 10 }, unclassified));
    const waits: number[] = [];
    const reported: unknown[] = [];

    const metaSpaceId = await retryMetaSpaceEstablishment(repository, establishmentIds(), {
      wait: recordingWait(waits),
      report: (error) => reported.push(error),
    });

    expect(metaSpaceId).toBeUndefined();
    expect(waits).toEqual([META_SPACE_RETRY_INITIAL_DELAY_MS, 10_000]);
    expect(reported).toEqual([expect.any(TypeError), expect.any(TypeError)]);
  });

  it('keeps trying through one failure it cannot classify', async () => {
    const repository = new ScriptedRepository([unclassified()]);
    const reported: unknown[] = [];

    const metaSpaceId = await retryMetaSpaceEstablishment(repository, establishmentIds(), {
      wait: () => Promise.resolve(),
      report: (error) => reported.push(error),
    });

    expect(metaSpaceId).toBe(SPACE_ID);
    expect(reported).toEqual([expect.any(TypeError)]);
  });

  // Both are failures a wait does not cure, so they confirm each other; an
  // outage between them says nothing about either and resets the count.
  it('counts unclassified and invariant failures together, and an outage resets them', async () => {
    const confirmed = new ScriptedRepository([unclassified(), invariant(), undefined]);
    await expect(
      retryMetaSpaceEstablishment(confirmed, establishmentIds(), {
        wait: () => Promise.resolve(),
        report: () => undefined,
      }),
    ).resolves.toBeUndefined();

    const interrupted = new ScriptedRepository([unclassified(), unreachable(), invariant()]);
    await expect(
      retryMetaSpaceEstablishment(interrupted, establishmentIds(), {
        wait: () => Promise.resolve(),
        report: () => undefined,
      }),
    ).resolves.toBe(SPACE_ID);
  });

  it('counts invariant failures consecutively, so an outage between them resets', async () => {
    // Three failures and two of them invariant, but never twice running: a
    // failure that says nothing about stored state cannot help confirm it.
    const repository = new ScriptedRepository([invariant(), unreachable(), invariant()]);
    const reported: unknown[] = [];

    const metaSpaceId = await retryMetaSpaceEstablishment(repository, establishmentIds(), {
      wait: () => Promise.resolve(),
      report: (error) => reported.push(error),
    });

    expect(metaSpaceId).toBe(SPACE_ID);
    expect(reported).toEqual([
      expect.any(AggregateInvariantError),
      expect.any(Error),
      expect.any(AggregateInvariantError),
    ]);
  });

  // Default Content is code, not stored state, so no read and no wait can make
  // it valid. It needs its own type: reported as "not an invariant failure", it
  // would reset the consecutive count and, with no attempt bound on the loop, be
  // retried forever.
  it('stops at once when Default Content is not a valid aggregate', async () => {
    class RefusingRepository extends MemorySpaceRepository {
      override initializeAggregate(): Promise<InitializeAggregateResult> {
        return Promise.resolve({
          kind: 'aggregate-refused',
          errors: [{ kind: 'meta-space-missing', metaSpaceId: SPACE_ID }],
        });
      }
    }
    const waits: number[] = [];
    const reported: unknown[] = [];

    const metaSpaceId = await retryMetaSpaceEstablishment(
      new RefusingRepository(),
      establishmentIds(),
      { wait: recordingWait(waits), report: (error) => reported.push(error) },
    );

    expect(metaSpaceId).toBeUndefined();
    expect(waits).toEqual([META_SPACE_RETRY_INITIAL_DELAY_MS]);
    expect(reported).toEqual([expect.any(DefaultContentInvalidError)]);
  });

  // Reporting is a call that can throw. The loop is what recovers a host whose
  // database came back, so a reporter that fails must not be what stops it.
  it('survives a reporter that throws', async () => {
    const repository = new ScriptedRepository([unreachable(), unreachable()]);

    const metaSpaceId = await retryMetaSpaceEstablishment(repository, establishmentIds(), {
      wait: () => Promise.resolve(),
      report: () => {
        throw new Error('stderr is a closed pipe');
      },
    });

    expect(metaSpaceId).toBe(SPACE_ID);
  });
});

/*
 * Through a real repository over the PostgreSQL driver: what start-up does with
 * a server that refuses this client depends on what the refusal carries. A
 * wrong password is unclassified, confirms itself on the second attempt, and
 * stops the retry; too many connections is an outage, which never confirms
 * anything and is waited out.
 */
describe('retryMetaSpaceEstablishment over a PostgreSQL server that refuses this client', () => {
  const refusedBy = async (sqlState: string, message: string) => {
    const server = await startRefusingPostgresServer(sqlState, message);
    const database = postgres<Contract>(postgresOptionsFor(server.url));
    return {
      repository: new SqlSpaceRepository(postgresSqlStore(database)),
      close: async () => {
        await database.close();
        await server.close();
      },
    };
  };

  it('gives up on a wrong password once a second attempt confirms it', async () => {
    const { repository, close } = await refusedBy(
      '28P01',
      'password authentication failed for user "hyper"',
    );
    const waits: number[] = [];
    const reported: unknown[] = [];
    try {
      const metaSpaceId = await retryMetaSpaceEstablishment(repository, establishmentIds(), {
        wait: recordingWait(waits),
        report: (error) => reported.push(error),
      });

      expect(metaSpaceId).toBeUndefined();
      expect(waits).toEqual([META_SPACE_RETRY_INITIAL_DELAY_MS, 10_000]);
      expect(reported).toHaveLength(2);
      expect(reported.map(classifyStoredFailure)).toEqual(['unclassified', 'unclassified']);
    } finally {
      await close();
    }
  });

  it('keeps waiting out too many connections past the confirming limit', async () => {
    const { repository, close } = await refusedBy('53300', 'sorry, too many clients already');
    const stopped = new Error('the test stops waiting');
    const reported: unknown[] = [];
    let waits = 0;
    try {
      // Five attempts, then a `wait` that ends the loop: an outage never gives
      // up by itself, so the test is what stops it.
      const retrying = retryMetaSpaceEstablishment(repository, establishmentIds(), {
        wait: () => (++waits > 5 ? Promise.reject(stopped) : Promise.resolve()),
        report: (error) => reported.push(error),
      });

      await expect(retrying).rejects.toBe(stopped);
      expect(reported).toHaveLength(5);
      expect(reported.map(classifyStoredFailure)).toEqual(Array(5).fill('unavailable'));
    } finally {
      await close();
    }
  });
});

import { uuidSchema, type UUID } from '@project/core';
import {
  AggregateInvariantError,
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
  openDatabaseSelection,
  resolveDatabaseStartup,
  retryMetaSpaceEstablishment,
} from '../../src/startup/database-startup';
import { defaultContentAggregate } from '../../src/startup/default-content';
import { MemorySpaceRepository } from '../support/memory-space-repository';

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const OTHER_SPACE_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const THING_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const OTHER_THING_ID = uuidSchema.parse('44444444-4444-4444-8444-444444444444');
const DIAGRAM_ID = uuidSchema.parse('55555555-5555-4555-8555-555555555555');
const GRAPH_ID = uuidSchema.parse('66666666-6666-4666-8666-666666666666');
const LINK_THING_ID = uuidSchema.parse('77777777-7777-4777-8777-777777777777');
const CHILD_DIAGRAM_ID = uuidSchema.parse('88888888-8888-4888-8888-888888888888');
const CHILD_GRAPH_ID = uuidSchema.parse('99999999-9999-4999-8999-999999999999');

/**
 * The identities startup is about to mint, named in the order it mints them
 * (ADR 0016). Exhaustion throws rather than falling back to the ambient
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
  thingId = THING_ID,
  title = 'Existing space',
): LoadedSpace => ({
  snapshot: {
    id,
    document: { version: 1, title },
    things: [
      {
        id: thingId,
        document: { title: 'Existing thing', kind: 'markdown', body: '' },
      },
    ],
  },
  revision,
  exportedRevision: null,
});

describe('defaultContentAggregate', () => {
  it('mints one complete Meta Space through the injected identity source', () => {
    const aggregate = defaultContentAggregate(mintingIds(SPACE_ID, THING_ID, DIAGRAM_ID, GRAPH_ID));

    expect(aggregate).toEqual({
      metaSpaceId: SPACE_ID,
      spaces: [
        {
          id: SPACE_ID,
          document: {
            version: 1,
            title: 'New space',
            defaultDiagram: DIAGRAM_ID,
            diagrams: [
              {
                id: DIAGRAM_ID,
                title: 'Diagram 1',
                kind: 'positioned',
                positions: { [THING_ID]: { x: 0, y: 0, open: false } },
                graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
                activeGraph: GRAPH_ID,
              },
            ],
          },
          things: [{ id: THING_ID, document: { title: 'Thing 1', kind: 'markdown', body: '' } }],
        },
      ],
    });
  });
});

describe('openDatabaseSelection', () => {
  it('opens the space selected by its UUID', async () => {
    const selected = storedSpace(7n, OTHER_SPACE_ID, OTHER_THING_ID, 'Other space');
    const repository = new MemorySpaceRepository([storedSpace(4n), selected], SPACE_ID);

    const result = await openDatabaseSelection(repository, OTHER_SPACE_ID);

    expect(result).toEqual({ kind: 'opened', space: selected });
  });

  it('rejects a selected UUID that disappeared without falling back to another space', async () => {
    const remaining = storedSpace(0n);
    const selected = storedSpace(7n, OTHER_SPACE_ID, OTHER_THING_ID, 'Other space');
    const repository = new MemorySpaceRepository([remaining, selected], SPACE_ID);
    await repository.importSpaces([remaining.snapshot], 'truncate');

    await expect(openDatabaseSelection(repository, OTHER_SPACE_ID)).rejects.toThrow(OTHER_SPACE_ID);
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: SPACE_ID, title: 'Existing space' },
    ]);
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(remaining);
  });
});

describe('establishMetaSpace', () => {
  it('initializes an uninitialized repository from Default Content', async () => {
    const repository = new MemorySpaceRepository();

    const metaSpaceId = await establishMetaSpace(
      repository,
      mintingIds(SPACE_ID, THING_ID, DIAGRAM_ID, GRAPH_ID),
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
    // behaviour it stands for testing different things.
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

const unreachable = (): Error => new Error('connect ECONNREFUSED 127.0.0.1:5432');
const invariant = (): Error =>
  new AggregateInvariantError('Stored Spaces exist without a Meta Space');

/** A `wait` that records what it was asked for instead of spending it. */
const recordingWait = (waits: number[]) => (milliseconds: number) => {
  waits.push(milliseconds);
  return Promise.resolve();
};

/** The four ids one establishment mints, and no more. */
const establishmentIds = () => mintingIds(SPACE_ID, THING_ID, DIAGRAM_ID, GRAPH_ID);

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

  // The retry used to stop after twelve attempts. A container that starts before
  // PostgreSQL accepts connections, over a database that takes longer than that
  // to arrive, then served 503 at the root forever: the root address no longer
  // establishes anything, so nothing else was ever going to.
  it('keeps trying long past the bound it used to have', async () => {
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
  // it valid. Without its own type it was reported as "not an invariant
  // failure", which reset the consecutive count and, now that the loop has no
  // attempt bound, would have retried it forever.
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

describe('resolveDatabaseStartup', () => {
  it('creates and opens the Meta Space when the repository is uninitialized', async () => {
    const repository = new MemorySpaceRepository();

    const result = await resolveDatabaseStartup(
      repository,
      mintingIds(SPACE_ID, THING_ID, DIAGRAM_ID, GRAPH_ID),
    );

    expect(result).toEqual({
      kind: 'opened',
      space: {
        snapshot: {
          id: SPACE_ID,
          document: {
            version: 1,
            title: 'New space',
            defaultDiagram: DIAGRAM_ID,
            diagrams: [
              {
                id: DIAGRAM_ID,
                title: 'Diagram 1',
                kind: 'positioned',
                positions: { [THING_ID]: { x: 0, y: 0, open: false } },
                graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
                activeGraph: GRAPH_ID,
              },
            ],
          },
          things: [{ id: THING_ID, document: { title: 'Thing 1', kind: 'markdown', body: '' } }],
        },
        revision: 0n,
        exportedRevision: null,
      },
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(result.space);
  });

  it('opens the stored Meta Space without losing its revision precision', async () => {
    const existing = storedSpace(BigInt(Number.MAX_SAFE_INTEGER) + 1n);
    const repository = new MemorySpaceRepository([existing], SPACE_ID);

    const result = await resolveDatabaseStartup(repository, mintingIds(OTHER_SPACE_ID));

    expect(result).toEqual({ kind: 'opened', space: existing });
  });

  it('opens the Meta Space rather than the first of several stored Spaces', async () => {
    // Ordinary Spaces live inside the Meta reachability closure, so the second
    // one is stored *because* a Space Thing in Meta names it.
    const meta: LoadedSpace = {
      snapshot: {
        id: OTHER_SPACE_ID,
        document: { version: 1, title: 'Meta space' },
        things: [
          { id: OTHER_THING_ID, document: { title: 'Meta thing', kind: 'markdown', body: '' } },
          {
            id: LINK_THING_ID,
            document: {
              title: 'Open the child',
              kind: 'space',
              spaceId: SPACE_ID,
              diagram: CHILD_DIAGRAM_ID,
              graph: CHILD_GRAPH_ID,
            },
          },
        ],
      },
      revision: 7n,
      exportedRevision: null,
    };
    // The child carries the Diagram that Space Thing selects. A Space Thing
    // names a Diagram of its target and a Graph that Diagram owns from the
    // moment it exists (ADR 0079), so the ordinary Space inside the closure
    // cannot be the structureless one `storedSpace` builds.
    const stored = storedSpace(4n);
    const child: LoadedSpace = {
      ...stored,
      snapshot: {
        ...stored.snapshot,
        document: {
          ...stored.snapshot.document,
          defaultDiagram: CHILD_DIAGRAM_ID,
          diagrams: [
            {
              id: CHILD_DIAGRAM_ID,
              title: 'Diagram 1',
              kind: 'positioned',
              positions: { [THING_ID]: { x: 0, y: 0, open: false } },
              graphs: [{ id: CHILD_GRAPH_ID, title: 'Graph 1', edges: [] }],
              activeGraph: CHILD_GRAPH_ID,
            },
          ],
        },
      },
    };
    const repository = new MemorySpaceRepository([child, meta], OTHER_SPACE_ID);

    const result = await resolveDatabaseStartup(repository, mintingIds(DIAGRAM_ID));

    expect(result).toEqual({ kind: 'opened', space: meta });
  });
});

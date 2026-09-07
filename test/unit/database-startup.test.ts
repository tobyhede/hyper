import { uuidSchema, type UUID } from '@project/core';
import type { AggregateLoadResult, LoadedSpace } from '@project/persistence';
import { describe, expect, it } from 'vitest';
import {
  establishMetaSpace,
  META_SPACE_RETRY_ATTEMPTS,
  META_SPACE_RETRY_DELAY_MS,
  openDatabaseSelection,
  resolveDatabaseStartup,
  retryMetaSpaceEstablishment,
} from '../../src/startup/database-startup';
import { AggregateInvariantError } from '../../src/persistence/space-repository';
import { defaultContentAggregate } from '../../src/startup/default-content';
import { MemorySpaceRepository } from '../support/memory-space-repository';

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const OTHER_SPACE_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const CARD_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const OTHER_CARD_ID = uuidSchema.parse('44444444-4444-4444-8444-444444444444');
const LAYOUT_ID = uuidSchema.parse('55555555-5555-4555-8555-555555555555');
const GRAPH_ID = uuidSchema.parse('66666666-6666-4666-8666-666666666666');
const LINK_CARD_ID = uuidSchema.parse('77777777-7777-4777-8777-777777777777');

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
  cardId = CARD_ID,
  title = 'Existing space',
): LoadedSpace => ({
  snapshot: {
    id,
    document: { version: 1, title },
    cards: [
      {
        id: cardId,
        document: { title: 'Existing card', kind: 'markdown', body: '' },
      },
    ],
  },
  revision,
  exportedRevision: null,
});

describe('defaultContentAggregate', () => {
  it('mints one complete Meta Space through the injected identity source', () => {
    const aggregate = defaultContentAggregate(mintingIds(SPACE_ID, CARD_ID, LAYOUT_ID, GRAPH_ID));

    expect(aggregate).toEqual({
      metaSpaceId: SPACE_ID,
      spaces: [
        {
          id: SPACE_ID,
          document: {
            version: 1,
            title: 'New space',
            defaultLayout: LAYOUT_ID,
            layouts: [
              {
                id: LAYOUT_ID,
                title: 'Layout 1',
                kind: 'positioned',
                positions: { [CARD_ID]: { x: 0, y: 0, open: false } },
                graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
                activeGraph: GRAPH_ID,
              },
            ],
          },
          cards: [{ id: CARD_ID, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
        },
      ],
    });
  });
});

describe('openDatabaseSelection', () => {
  it('opens the space selected by its UUID', async () => {
    const selected = storedSpace(7n, OTHER_SPACE_ID, OTHER_CARD_ID, 'Other space');
    const repository = new MemorySpaceRepository([storedSpace(4n), selected], SPACE_ID);

    const result = await openDatabaseSelection(repository, OTHER_SPACE_ID);

    expect(result).toEqual({ kind: 'opened', space: selected });
  });

  it('rejects a selected UUID that disappeared without falling back to another space', async () => {
    const remaining = storedSpace(0n);
    const selected = storedSpace(7n, OTHER_SPACE_ID, OTHER_CARD_ID, 'Other space');
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
      mintingIds(SPACE_ID, CARD_ID, LAYOUT_ID, GRAPH_ID),
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
    await expect(repository.loadAggregate()).rejects.toThrow(
      'Stored Spaces exist without a Meta Space',
    );
    await expect(establishMetaSpace(repository, mintingIds(OTHER_SPACE_ID))).rejects.toThrow(
      'Stored Spaces exist without a Meta Space',
    );
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: SPACE_ID, title: 'Existing space' },
    ]);
  });
});

/**
 * A repository the database is unreachable behind, for the first `failures`
 * reads of it.
 *
 * The one thing a retry is for. `loadAggregate` is where establishment reaches
 * the database first, so failing it there is the whole outage: nothing is
 * minted and nothing is written, which is what makes "the retry established it"
 * a claim about the retry rather than about a half-written repository.
 */
class UnreachableRepository extends MemorySpaceRepository {
  #failures: number;

  constructor(failures: number) {
    super();
    this.#failures = failures;
  }

  override loadAggregate(): Promise<AggregateLoadResult> {
    if (this.#failures === 0) return super.loadAggregate();
    this.#failures -= 1;
    return Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:5432'));
  }
}

/** A `wait` that records what it was asked for instead of spending it. */
const recordingWait = (waits: number[]) => (milliseconds: number) => {
  waits.push(milliseconds);
  return Promise.resolve();
};

describe('retryMetaSpaceEstablishment', () => {
  it('establishes the Meta Space once the database comes back', async () => {
    const repository = new UnreachableRepository(2);
    const waits: number[] = [];
    const reported: unknown[] = [];

    const metaSpaceId = await retryMetaSpaceEstablishment(
      repository,
      // Four ids and no more: the failing attempts never reach a mint, so an
      // exhausted minter here would mean a retry that wrote something it should
      // not have.
      mintingIds(SPACE_ID, CARD_ID, LAYOUT_ID, GRAPH_ID),
      recordingWait(waits),
      (error) => reported.push(error),
    );

    expect(metaSpaceId).toBe(SPACE_ID);
    expect(waits).toEqual([
      META_SPACE_RETRY_DELAY_MS,
      META_SPACE_RETRY_DELAY_MS,
      META_SPACE_RETRY_DELAY_MS,
    ]);
    expect(reported).toHaveLength(2);
    await expect(repository.loadAggregate()).resolves.toMatchObject({
      kind: 'loaded',
      aggregate: { metaSpaceId: SPACE_ID },
    });
  });

  it('gives up after the bound, leaving the repository as it found it', async () => {
    const repository = new UnreachableRepository(Number.MAX_SAFE_INTEGER);
    const waits: number[] = [];
    const reported: unknown[] = [];

    const metaSpaceId = await retryMetaSpaceEstablishment(
      repository,
      mintingIds(SPACE_ID),
      recordingWait(waits),
      (error) => reported.push(error),
    );

    expect(metaSpaceId).toBeUndefined();
    expect(waits).toHaveLength(META_SPACE_RETRY_ATTEMPTS);
    expect(reported).toHaveLength(META_SPACE_RETRY_ATTEMPTS);
    await expect(repository.listSpaces()).resolves.toEqual([]);
  });

  it('stops at contradictory stored state, which waiting cannot cure', async () => {
    const repository = MemorySpaceRepository.withoutMetaIdentity([storedSpace(4n)]);
    const waits: number[] = [];
    const reported: unknown[] = [];

    const metaSpaceId = await retryMetaSpaceEstablishment(
      repository,
      mintingIds(OTHER_SPACE_ID),
      recordingWait(waits),
      (error) => reported.push(error),
    );

    // One attempt, not twelve: the next read would find the same documents and
    // fail the same way, and the identifiable error is what says so.
    expect(metaSpaceId).toBeUndefined();
    expect(waits).toEqual([META_SPACE_RETRY_DELAY_MS]);
    expect(reported).toEqual([expect.any(AggregateInvariantError)]);
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: SPACE_ID, title: 'Existing space' },
    ]);
  });
});

describe('resolveDatabaseStartup', () => {
  it('creates and opens the Meta Space when the repository is uninitialized', async () => {
    const repository = new MemorySpaceRepository();

    const result = await resolveDatabaseStartup(
      repository,
      mintingIds(SPACE_ID, CARD_ID, LAYOUT_ID, GRAPH_ID),
    );

    expect(result).toEqual({
      kind: 'opened',
      space: {
        snapshot: {
          id: SPACE_ID,
          document: {
            version: 1,
            title: 'New space',
            defaultLayout: LAYOUT_ID,
            layouts: [
              {
                id: LAYOUT_ID,
                title: 'Layout 1',
                kind: 'positioned',
                positions: { [CARD_ID]: { x: 0, y: 0, open: false } },
                graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
                activeGraph: GRAPH_ID,
              },
            ],
          },
          cards: [{ id: CARD_ID, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
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
    // one is stored *because* a Space Card in Meta names it.
    const meta: LoadedSpace = {
      snapshot: {
        id: OTHER_SPACE_ID,
        document: { version: 1, title: 'Meta space' },
        cards: [
          { id: OTHER_CARD_ID, document: { title: 'Meta card', kind: 'markdown', body: '' } },
          {
            id: LINK_CARD_ID,
            document: { title: 'Open the child', kind: 'space', spaceId: SPACE_ID },
          },
        ],
      },
      revision: 7n,
      exportedRevision: null,
    };
    const repository = new MemorySpaceRepository([storedSpace(4n), meta], OTHER_SPACE_ID);

    const result = await resolveDatabaseStartup(repository, mintingIds(LAYOUT_ID));

    expect(result).toEqual({ kind: 'opened', space: meta });
  });
});

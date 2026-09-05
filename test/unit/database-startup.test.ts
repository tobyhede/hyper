import { uuidSchema, type UUID } from '@project/core';
import type { LoadedSpace } from '@project/persistence';
import { describe, expect, it } from 'vitest';
import {
  establishMetaSpace,
  openDatabaseSelection,
  resolveDatabaseStartup,
} from '../../src/startup/database-startup';
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

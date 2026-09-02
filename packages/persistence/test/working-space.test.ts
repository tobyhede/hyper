import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import {
  createWorkingSpaceLoader,
  type CommitResult,
  type RepositoryCommitResult,
  type SpaceResourceRepository,
} from '../src/index';

const SPACE = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const LAYOUT = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const layoutless: SpaceSnapshot = {
  id: SPACE,
  document: { version: 1, title: 'Imported' },
  cards: [{ id: CARD, document: { title: 'A', kind: 'markdown', body: '' } }],
};

const loadWorkingSpace = (
  store: Parameters<typeof createWorkingSpaceLoader>[0],
  id: UUID,
  newId: () => UUID,
) => createWorkingSpaceLoader(store, newId)(id);

interface RepositoryHarness {
  readonly store: SpaceResourceRepository;
  readonly commits: SpaceSnapshot[];
}

const repository = (): RepositoryHarness => {
  let current = { snapshot: structuredClone(layoutless), revision: 7n, exportedRevision: 5n };
  const commits: SpaceSnapshot[] = [];
  return {
    commits,
    store: {
      listSpaces: () => Promise.resolve([]),
      loadSpace: () => Promise.resolve(structuredClone(current)),
      loadAggregate: () =>
        Promise.resolve({ kind: 'loaded', aggregate: { metaSpaceId: SPACE, spaces: [current] } }),
      commit: ({ changes }) => {
        const change = changes[0];
        if (change.kind !== 'update') throw new Error('expected one update');
        commits.push(structuredClone(change.snapshot));
        current = { ...current, snapshot: structuredClone(change.snapshot), revision: 8n };
        return Promise.resolve({
          kind: 'committed',
          revisions: [{ spaceId: SPACE, revision: 8n }],
          deletedSpaceIds: [],
        });
      },
    },
  };
};

describe('loadWorkingSpace', () => {
  it('persists an empty default Layout before returning a layoutless stored Space', async () => {
    const { store, commits } = repository();
    const ids = [LAYOUT, GRAPH];

    const loaded = await loadWorkingSpace(store, SPACE, () => {
      const id = ids.shift();
      if (id === undefined) throw new Error('initializer minted too many ids');
      return id;
    });

    expect(ids).toEqual([]);
    expect(commits).toHaveLength(1);
    expect(loaded).toEqual({
      snapshot: {
        ...layoutless,
        document: {
          ...layoutless.document,
          layouts: [
            {
              id: LAYOUT,
              title: 'Layout 1',
              kind: 'positioned',
              positions: {},
              graphs: [{ id: GRAPH, title: 'Graph 1', edges: [] }],
              activeGraph: GRAPH,
            },
          ],
          defaultRenderer: LAYOUT,
        },
      },
      revision: 8n,
      exportedRevision: 5n,
      initialization: 'created-layout',
    });
  });

  it('adopts the first existing Layout without creating another Layout or Graph', async () => {
    const existing = {
      ...layoutless,
      document: {
        ...layoutless.document,
        layouts: [
          {
            id: LAYOUT,
            title: 'First',
            kind: 'positioned' as const,
            positions: {},
            graphs: [{ id: GRAPH, title: 'Existing', edges: [] }],
            activeGraph: GRAPH,
          },
        ],
      },
    };
    let committed: SpaceSnapshot | undefined;
    const store: SpaceResourceRepository = {
      listSpaces: () => Promise.resolve([]),
      loadSpace: () =>
        Promise.resolve({ snapshot: existing, revision: 2n, exportedRevision: null }),
      loadAggregate: () =>
        Promise.resolve({ kind: 'loaded', aggregate: { metaSpaceId: SPACE, spaces: [] } }),
      commit: ({ changes }) => {
        const change = changes[0];
        if (change.kind !== 'update') throw new Error('expected update');
        committed = change.snapshot;
        return Promise.resolve({
          kind: 'committed',
          revisions: [{ spaceId: SPACE, revision: 3n }],
          deletedSpaceIds: [],
        });
      },
    };

    const loaded = await loadWorkingSpace(store, SPACE, () => {
      throw new Error('default adoption must not mint identities');
    });

    expect(committed?.document.layouts).toEqual(existing.document.layouts);
    expect(committed?.document.defaultRenderer).toBe(LAYOUT);
    expect(loaded).not.toHaveProperty('initialization');
  });

  it('does not write a Space that already has a durable default Layout', async () => {
    const complete = {
      ...layoutless,
      document: {
        ...layoutless.document,
        layouts: [
          {
            id: LAYOUT,
            title: 'First',
            kind: 'positioned' as const,
            positions: {},
            graphs: [{ id: GRAPH, title: 'Existing', edges: [] }],
            activeGraph: GRAPH,
          },
        ],
        defaultRenderer: LAYOUT,
      },
    };
    const commit = vi.fn();
    const store = {
      loadSpace: () =>
        Promise.resolve({ snapshot: complete, revision: 3n, exportedRevision: null }),
      commit,
    };

    await expect(loadWorkingSpace(store, SPACE, () => LAYOUT)).resolves.toMatchObject({
      snapshot: complete,
      revision: 3n,
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it('accepts a concurrently initialized winner as ordinary working state', async () => {
    const winner = {
      ...layoutless,
      document: {
        ...layoutless.document,
        layouts: [
          {
            id: LAYOUT,
            title: 'Layout 1',
            kind: 'positioned' as const,
            positions: {},
            graphs: [{ id: GRAPH, title: 'Graph 1', edges: [] }],
            activeGraph: GRAPH,
          },
        ],
        defaultRenderer: LAYOUT,
      },
    };
    const store = {
      loadSpace: () =>
        Promise.resolve({ snapshot: layoutless, revision: 7n, exportedRevision: 5n }),
      commit: () =>
        Promise.resolve({
          kind: 'conflict' as const,
          conflicts: [
            {
              spaceId: SPACE,
              current: { snapshot: winner, revision: 8n, exportedRevision: 5n },
            },
          ],
        }),
    };

    await expect(loadWorkingSpace(store, SPACE, () => LAYOUT)).resolves.toEqual({
      snapshot: winner,
      revision: 8n,
      exportedRevision: 5n,
    });
  });

  it('retries initialization after an unrelated layoutless edit wins the conflict', async () => {
    const concurrentlyEdited = {
      ...layoutless,
      document: { ...layoutless.document, title: 'Renamed while opening' },
    };
    let commits = 0;
    const store = {
      loadSpace: () =>
        Promise.resolve({ snapshot: layoutless, revision: 7n, exportedRevision: null }),
      commit: () => {
        commits += 1;
        if (commits === 1) {
          return Promise.resolve({
            kind: 'conflict' as const,
            conflicts: [
              {
                spaceId: SPACE,
                current: {
                  snapshot: concurrentlyEdited,
                  revision: 8n,
                  exportedRevision: null,
                },
              },
            ],
          });
        }
        return Promise.resolve({
          kind: 'committed' as const,
          revisions: [{ spaceId: SPACE, revision: 9n }],
          deletedSpaceIds: [],
        });
      },
    };
    const ids = [
      LAYOUT,
      GRAPH,
      uuidSchema.parse('00000000-0000-4000-8000-000000000005'),
      uuidSchema.parse('00000000-0000-4000-8000-000000000006'),
    ];

    const loaded = await loadWorkingSpace(store, SPACE, () => {
      const id = ids.shift();
      if (id === undefined) throw new Error('initializer minted too many identities');
      return id;
    });

    expect(commits).toBe(2);
    expect(loaded).toMatchObject({
      revision: 9n,
      initialization: 'created-layout',
      snapshot: { document: { title: 'Renamed while opening' } },
    });
  });

  it.each([
    { kind: 'rejected', code: 'invalid-commit', message: 'No write occurred' },
    { kind: 'retryable-failure', code: 'network', message: 'No write occurred' },
    { kind: 'permanent-failure', code: 'protocol', message: 'No write occurred' },
  ] satisfies readonly (CommitResult | RepositoryCommitResult)[])(
    'does not expose a draft when initialization is %s',
    async (result) => {
      const store = {
        loadSpace: () =>
          Promise.resolve({ snapshot: layoutless, revision: 7n, exportedRevision: null }),
        commit: () => Promise.resolve(result),
      };

      await expect(loadWorkingSpace(store, SPACE, () => LAYOUT)).rejects.toThrow(
        `could not initialize its working state: ${result.kind}`,
      );
    },
  );
});

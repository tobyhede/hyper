import { describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import { MemorySpaceBackend, MemorySpaceBackendTestControl } from '../src/memory';
import { createSpaceSessionRegistry } from '../src/session-registry';
import type { SpaceSession, SpaceSessionState } from '../src/session';

/**
 * Wait for a session's state to satisfy `predicate` — used to confirm an Edit
 * made while a coordination held the persistence barrier actually reaches the
 * backend once the coordination releases it, rather than only checking the
 * local working state a `submit` while paused installs synchronously.
 * `settled` alone does not say that: it is already true, from the previous
 * commit, at the moment a paused `submit` queues the next one.
 */
const waitFor = (
  session: SpaceSession,
  predicate: (state: SpaceSessionState) => boolean,
): Promise<SpaceSessionState> => {
  const state = session.getState();
  if (predicate(state)) return Promise.resolve(state);
  return new Promise((resolve) => {
    const unsubscribe = session.subscribe(() => {
      const next = session.getState();
      if (!predicate(next)) return;
      unsubscribe();
      resolve(next);
    });
  });
};

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const FIRST_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const SECOND_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const FIRST_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const SECOND_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const OTHER_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const OTHER_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const OTHER_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const OTHER_REFERENCE = uuidSchema.parse('00000000-0000-4000-8000-000000000012');
const SIBLING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000013');
const SIBLING_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000014');
const SIBLING_LINK_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000015');

const loaded = {
  snapshot: {
    id: SPACE_ID,
    document: { version: 1 as const, title: 'Space' },
    resources: [
      { id: RESOURCE_ID, document: { title: 'Resource', kind: 'markdown' as const, body: '' } },
    ],
  },
  revision: 3n,
  exportedRevision: null,
};

describe('Space session registry', () => {
  it('deletes a Map while moving every Space Resource that selected it', async () => {
    const reference = (resourceId: typeof RESOURCE_ID) => ({
      id: resourceId,
      document: {
        title: 'Target',
        kind: 'space' as const,
        spaceId: TARGET_ID,
        map: SECOND_MAP,
        graph: SECOND_GRAPH,
        framing: { centreX: 120, centreY: 80, zoom: 1.5 },
      },
    });
    const source = {
      ...loaded,
      snapshot: {
        ...loaded.snapshot,
        resources: [
          reference(RESOURCE_ID),
          {
            id: OTHER_REFERENCE,
            document: {
              title: 'Other',
              kind: 'space' as const,
              spaceId: OTHER_ID,
              map: OTHER_MAP,
              graph: OTHER_GRAPH,
            },
          },
        ],
      },
    };
    const other = {
      ...loaded,
      snapshot: {
        ...loaded.snapshot,
        id: OTHER_ID,
        resources: [reference(OTHER_RESOURCE_ID)],
        document: {
          version: 1 as const,
          title: 'Other',
          defaultMap: OTHER_MAP,
          maps: [
            {
              id: OTHER_MAP,
              title: 'Other',
              kind: 'positioned' as const,
              positions: {},
              graphs: [{ id: OTHER_GRAPH, title: 'Other', edges: [] }],
            },
          ],
        },
      },
    };
    const target = {
      ...loaded,
      snapshot: {
        ...loaded.snapshot,
        id: TARGET_ID,
        resources: [],
        document: {
          version: 1 as const,
          title: 'Target',
          defaultMap: FIRST_MAP,
          maps: [
            {
              id: FIRST_MAP,
              title: 'First',
              kind: 'positioned' as const,
              positions: {},
              graphs: [{ id: FIRST_GRAPH, title: 'First', edges: [] }],
            },
            {
              id: SECOND_MAP,
              title: 'Second',
              kind: 'positioned' as const,
              positions: {},
              graphs: [{ id: SECOND_GRAPH, title: 'Second', edges: [] }],
            },
          ],
        },
      },
    };
    const backend = new MemorySpaceBackend(SPACE_ID, [source, other, target]);
    const registry = createSpaceSessionRegistry(backend);
    registry.open(source);
    registry.open(target);

    const result = await registry
      .spaceResources(() => RESOURCE_ID)
      .deleteMap({
        targetSpaceId: TARGET_ID,
        mapId: SECOND_MAP,
        preferredMapId: OTHER_MAP,
      });

    expect(result).toEqual({
      kind: 'completed',
      mapId: FIRST_MAP,
      graphId: FIRST_GRAPH,
    });
    expect((await backend.loadSpace(TARGET_ID))?.snapshot.document.maps).toHaveLength(1);
    for (const id of [SPACE_ID, OTHER_ID]) {
      const stored = await backend.loadSpace(id);
      expect(stored?.snapshot.resources[0]?.document).toMatchObject({
        map: FIRST_MAP,
        graph: FIRST_GRAPH,
      });
      expect(stored?.snapshot.resources[0]?.document).not.toHaveProperty('framing');
    }
  });

  it('deletes a Graph while moving every Space Resource that selected it', async () => {
    const source = {
      ...loaded,
      snapshot: {
        ...loaded.snapshot,
        resources: [
          {
            id: RESOURCE_ID,
            document: {
              title: 'Target',
              kind: 'space' as const,
              spaceId: TARGET_ID,
              map: FIRST_MAP,
              graph: SECOND_GRAPH,
              framing: { centreX: 120, centreY: 80, zoom: 1.5 },
            },
          },
        ],
      },
    };
    const target = {
      ...loaded,
      snapshot: {
        ...loaded.snapshot,
        id: TARGET_ID,
        resources: [],
        document: {
          version: 1 as const,
          title: 'Target',
          defaultMap: FIRST_MAP,
          maps: [
            {
              id: FIRST_MAP,
              title: 'First',
              kind: 'positioned' as const,
              positions: {},
              activeGraph: SECOND_GRAPH,
              graphs: [
                { id: FIRST_GRAPH, title: 'First', edges: [] },
                { id: SECOND_GRAPH, title: 'Second', edges: [] },
              ],
            },
          ],
        },
      },
    };
    const backend = new MemorySpaceBackend(SPACE_ID, [source, target]);
    const registry = createSpaceSessionRegistry(backend);
    registry.open(source);
    registry.open(target);

    const result = await registry
      .spaceResources(() => RESOURCE_ID)
      .deleteGraph({
        targetSpaceId: TARGET_ID,
        mapId: FIRST_MAP,
        graphId: SECOND_GRAPH,
        preferredGraphId: SECOND_GRAPH,
      });

    expect(result).toEqual({
      kind: 'completed',
      mapId: FIRST_MAP,
      graphId: FIRST_GRAPH,
    });
    expect((await backend.loadSpace(TARGET_ID))?.snapshot.document.maps?.[0]?.graphs).toHaveLength(
      1,
    );
    expect((await backend.loadSpace(SPACE_ID))?.snapshot.resources[0]?.document).toMatchObject({
      map: FIRST_MAP,
      graph: FIRST_GRAPH,
      framing: { centreX: 120, centreY: 80, zoom: 1.5 },
    });
  });

  // The behavioural invariant proved by both tests below (spec.md,
  // "Coordinated operations decide after their last wait"): whichever server
  // read a late removal of the preferred replacement lands in, `deleteGraph`
  // and `deleteMap` never reject and never answer `aggregate-refused` —
  // when the removal landed before the coordination's one decision, the
  // decision re-chooses a surviving candidate; when it did not, the
  // originally preferred one is chosen exactly as if nothing had happened.
  // The coordination makes exactly one aggregate read, so injecting on read 2
  // never fires and exercises the ordinary, nothing-removed choice instead.
  it.each([1, 2] as const)(
    'chooses a different replacement Graph when the preferred one goes during the wait (late Edit on read %i)',
    async (readToInject) => {
      const MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000100');
      const KEEP_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000101');
      const DELETED_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000102');
      const PREFERRED_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000103');

      const target = {
        snapshot: {
          id: TARGET_ID,
          document: {
            version: 1 as const,
            title: 'Target',
            defaultMap: MAP,
            maps: [
              {
                id: MAP,
                title: 'Map 1',
                kind: 'positioned' as const,
                positions: {},
                activeGraph: DELETED_GRAPH,
                graphs: [
                  { id: KEEP_GRAPH, title: 'Keep', edges: [] },
                  { id: DELETED_GRAPH, title: 'Deleted', edges: [] },
                  { id: PREFERRED_GRAPH, title: 'Preferred', edges: [] },
                ],
              },
            ],
          },
          resources: [],
        },
        revision: 3n,
        exportedRevision: null,
      };
      const backend = new MemorySpaceBackend(TARGET_ID, [target]);
      const registry = createSpaceSessionRegistry(backend);
      const targetSession = registry.open(target);

      // An ordinary Edit — removing the preferred replacement Graph from the
      // target's own live session — landing on the named read of the
      // coordination's aggregate loads.
      const loadAggregate = backend.loadAggregate.bind(backend);
      let reads = 0;
      const injected = { value: false };
      backend.loadAggregate = async () => {
        reads += 1;
        if (reads === readToInject) {
          injected.value = true;
          const working = targetSession.getState().working;
          targetSession.submit({
            ...working,
            document: {
              ...working.document,
              maps: (working.document.maps ?? []).map((map) =>
                map.id === MAP
                  ? {
                      ...map,
                      graphs: map.graphs.filter(({ id }) => id !== PREFERRED_GRAPH),
                    }
                  : map,
              ),
            },
          });
        }
        return loadAggregate();
      };

      const deletion = registry
        .spaceResources(() => RESOURCE_ID)
        .deleteGraph({
          targetSpaceId: TARGET_ID,
          mapId: MAP,
          graphId: DELETED_GRAPH,
          preferredGraphId: PREFERRED_GRAPH,
        });

      await expect(deletion).resolves.toBeDefined();
      const result = await deletion;
      if (result.kind === 'refused') expect(result.refusal.code).not.toBe('aggregate-refused');

      if (injected.value) {
        // The preferred replacement was gone by the time the decision ran:
        // the surviving Graph is chosen instead.
        expect(result).toEqual({ kind: 'completed', mapId: MAP, graphId: KEEP_GRAPH });
        expect(
          targetSession.getState().working.document.maps?.[0]?.graphs.map(({ id }) => id),
        ).toEqual([KEEP_GRAPH]);
        expect(targetSession.getState().working.document.maps?.[0]?.activeGraph).toEqual(
          KEEP_GRAPH,
        );
      } else {
        // No late removal ever landed: the ordinarily preferred Graph is
        // chosen.
        expect(result).toEqual({
          kind: 'completed',
          mapId: MAP,
          graphId: PREFERRED_GRAPH,
        });
        expect(
          targetSession.getState().working.document.maps?.[0]?.graphs.map(({ id }) => id),
        ).toEqual([KEEP_GRAPH, PREFERRED_GRAPH]);
        expect(targetSession.getState().working.document.maps?.[0]?.activeGraph).toEqual(
          PREFERRED_GRAPH,
        );
      }
    },
  );

  it.each([1, 2] as const)(
    'chooses a different replacement Map when the preferred one goes during the wait (late Edit on read %i)',
    async (readToInject) => {
      const DELETED_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000110');
      const PREFERRED_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000111');
      const KEEP_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000112');
      const DELETED_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000113');
      const PREFERRED_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000114');
      const KEEP_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000115');

      const target = {
        snapshot: {
          id: TARGET_ID,
          document: {
            version: 1 as const,
            title: 'Target',
            defaultMap: DELETED_MAP,
            maps: [
              {
                id: DELETED_MAP,
                title: 'Deleted',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: DELETED_GRAPH, title: 'Graph 1', edges: [] }],
              },
              {
                id: PREFERRED_MAP,
                title: 'Preferred',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: PREFERRED_GRAPH, title: 'Graph 1', edges: [] }],
              },
              {
                id: KEEP_MAP,
                title: 'Keep',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: KEEP_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          resources: [],
        },
        revision: 3n,
        exportedRevision: null,
      };
      const backend = new MemorySpaceBackend(TARGET_ID, [target]);
      const registry = createSpaceSessionRegistry(backend);
      const targetSession = registry.open(target);

      // Same shape as the Graph case above: an ordinary Edit removes the
      // preferred replacement Map from the target's own live session,
      // landing on the named read of the coordination's aggregate loads.
      const loadAggregate = backend.loadAggregate.bind(backend);
      let reads = 0;
      const injected = { value: false };
      backend.loadAggregate = async () => {
        reads += 1;
        if (reads === readToInject) {
          injected.value = true;
          const working = targetSession.getState().working;
          targetSession.submit({
            ...working,
            document: {
              ...working.document,
              maps: (working.document.maps ?? []).filter((map) => map.id !== PREFERRED_MAP),
            },
          });
        }
        return loadAggregate();
      };

      const deletion = registry
        .spaceResources(() => RESOURCE_ID)
        .deleteMap({
          targetSpaceId: TARGET_ID,
          mapId: DELETED_MAP,
          preferredMapId: PREFERRED_MAP,
        });

      await expect(deletion).resolves.toBeDefined();
      const result = await deletion;
      if (result.kind === 'refused') expect(result.refusal.code).not.toBe('aggregate-refused');

      if (injected.value) {
        // The preferred replacement was gone by the time the decision ran:
        // the surviving Map is chosen instead.
        expect(result).toEqual({ kind: 'completed', mapId: KEEP_MAP, graphId: KEEP_GRAPH });
        expect(targetSession.getState().working.document.maps?.map(({ id }) => id)).toEqual([
          KEEP_MAP,
        ]);
        expect(targetSession.getState().working.document.defaultMap).toEqual(KEEP_MAP);
      } else {
        // No late removal ever landed: the ordinarily preferred Map is
        // chosen.
        expect(result).toEqual({
          kind: 'completed',
          mapId: PREFERRED_MAP,
          graphId: PREFERRED_GRAPH,
        });
        expect(targetSession.getState().working.document.maps?.map(({ id }) => id)).toEqual([
          PREFERRED_MAP,
          KEEP_MAP,
        ]);
        expect(targetSession.getState().working.document.defaultMap).toEqual(PREFERRED_MAP);
      }
    },
  );

  it("does not open a referencing Space's session before every participant clears recovery", async () => {
    const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000120');
    const RESOURCE_TO_TARGET = uuidSchema.parse('00000000-0000-4000-8000-000000000121');
    const RESOURCE_TO_B = uuidSchema.parse('00000000-0000-4000-8000-000000000122');
    const AFFECTED_B_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000123');
    const AFFECTED_B_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000124');
    const AFFECTED_B_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000125');
    const RESOURCE_B_TO_TARGET = uuidSchema.parse('00000000-0000-4000-8000-000000000126');
    const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000127');
    const MAP_TO_DELETE = uuidSchema.parse('00000000-0000-4000-8000-000000000128');
    const TARGET_GRAPH_TO_DELETE = uuidSchema.parse('00000000-0000-4000-8000-000000000129');
    const MAP_KEEP = uuidSchema.parse('00000000-0000-4000-8000-000000000130');
    const TARGET_GRAPH_KEEP = uuidSchema.parse('00000000-0000-4000-8000-000000000131');

    // Meta is itself one of the two Spaces referencing Target's Map, so it
    // needs no session open before the deletion runs — exactly the Space
    // `deleteMap`'s own participant loop would have to open.
    const meta = {
      snapshot: {
        id: META_ID,
        document: { version: 1 as const, title: 'Meta' },
        resources: [
          {
            id: RESOURCE_TO_TARGET,
            document: {
              title: 'Target',
              kind: 'space' as const,
              spaceId: TARGET_ID,
              map: MAP_TO_DELETE,
              graph: TARGET_GRAPH_TO_DELETE,
            },
          },
          {
            id: RESOURCE_TO_B,
            document: {
              title: 'Affected B',
              kind: 'space' as const,
              spaceId: AFFECTED_B_ID,
              map: AFFECTED_B_MAP,
              graph: AFFECTED_B_GRAPH,
            },
          },
        ],
      },
      revision: 3n,
      exportedRevision: null,
    };
    const affectedB = {
      snapshot: {
        id: AFFECTED_B_ID,
        document: {
          version: 1 as const,
          title: 'Affected B',
          defaultMap: AFFECTED_B_MAP,
          maps: [
            {
              id: AFFECTED_B_MAP,
              title: 'Map 1',
              kind: 'positioned' as const,
              positions: {},
              graphs: [{ id: AFFECTED_B_GRAPH, title: 'Graph 1', edges: [] }],
            },
          ],
        },
        resources: [
          {
            id: RESOURCE_B_TO_TARGET,
            document: {
              title: 'Target',
              kind: 'space' as const,
              spaceId: TARGET_ID,
              map: MAP_TO_DELETE,
              graph: TARGET_GRAPH_TO_DELETE,
            },
          },
        ],
      },
      revision: 5n,
      exportedRevision: null,
    };
    const target = {
      snapshot: {
        id: TARGET_ID,
        document: {
          version: 1 as const,
          title: 'Target',
          defaultMap: MAP_KEEP,
          maps: [
            {
              id: MAP_TO_DELETE,
              title: 'To delete',
              kind: 'positioned' as const,
              positions: {},
              graphs: [{ id: TARGET_GRAPH_TO_DELETE, title: 'Graph 1', edges: [] }],
            },
            {
              id: MAP_KEEP,
              title: 'Keep',
              kind: 'positioned' as const,
              positions: {},
              graphs: [{ id: TARGET_GRAPH_KEEP, title: 'Graph 1', edges: [] }],
            },
          ],
        },
        resources: [],
      },
      revision: 3n,
      exportedRevision: null,
    };
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({ kind: 'retryable-failure', code: 'network' });
    const backend = new MemorySpaceBackend(META_ID, [target, meta, affectedB], control);
    const registry = createSpaceSessionRegistry(backend);
    registry.open(target);
    // Meta is deliberately left with no live session: the participant loop
    // is what would have to open one for it.
    const affectedBSession = registry.open(affectedB);
    affectedBSession.submit(affectedBSession.getState().working);
    await waitFor(affectedBSession, (state) => state.persistence.kind === 'failed');

    const result = await registry
      .spaceResources(() => RESOURCE_TO_TARGET)
      .deleteMap({
        targetSpaceId: TARGET_ID,
        mapId: MAP_TO_DELETE,
        preferredMapId: null,
      });

    expect(result).toEqual({
      kind: 'refused',
      refusal: {
        code: 'persistence-recovery-required',
        spaceId: AFFECTED_B_ID,
        recovery: 'retry',
      },
    });
    // The whole operation refused, so Meta's session — opened only to check
    // whether *it* held up the deletion — must not linger: nothing here ever
    // needed it once a later participant already refused.
    expect(registry.session(META_ID)).toBeUndefined();
  });

  // The "add" direction of the one recovery rule (ADR 0099): Sibling's
  // selection of the doomed Graph exists only in its own uncommitted,
  // `failed` working Space — never reflected in storage, because the Edit
  // that added it is exactly what failed. Deleting the Graph anyway would
  // relocate every *stored* reference and leave Sibling's own eventual
  // retry pointing at a Graph that no longer exists, refused forever.
  it('refuses to delete a Graph a failed sibling selects only in its working Space', async () => {
    const source = {
      ...loaded,
      snapshot: {
        ...loaded.snapshot,
        resources: [
          {
            id: RESOURCE_ID,
            document: {
              title: 'Target',
              kind: 'space' as const,
              spaceId: TARGET_ID,
              map: FIRST_MAP,
              graph: FIRST_GRAPH,
            },
          },
        ],
      },
    };
    const target = {
      ...loaded,
      snapshot: {
        ...loaded.snapshot,
        id: TARGET_ID,
        resources: [],
        document: {
          version: 1 as const,
          title: 'Target',
          defaultMap: FIRST_MAP,
          maps: [
            {
              id: FIRST_MAP,
              title: 'First',
              kind: 'positioned' as const,
              positions: {},
              activeGraph: FIRST_GRAPH,
              graphs: [
                { id: FIRST_GRAPH, title: 'First', edges: [] },
                { id: SECOND_GRAPH, title: 'Second', edges: [] },
              ],
            },
          ],
        },
      },
    };
    const sibling = {
      ...loaded,
      snapshot: {
        ...loaded.snapshot,
        id: SIBLING_ID,
        resources: [
          {
            id: SIBLING_RESOURCE_ID,
            document: { title: 'Sibling', kind: 'markdown' as const, body: '' },
          },
        ],
        document: { version: 1 as const, title: 'Sibling' },
      },
    };
    const control = new MemorySpaceBackendTestControl();
    const backend = new MemorySpaceBackend(SPACE_ID, [source, target, sibling], control);
    const registry = createSpaceSessionRegistry(backend);
    registry.open(source);
    registry.open(target);
    const siblingSession = registry.open(sibling);

    control.queueResult({ kind: 'retryable-failure', code: 'network' });
    siblingSession.submit({
      ...sibling.snapshot,
      resources: [
        ...sibling.snapshot.resources,
        {
          id: SIBLING_LINK_ID,
          document: {
            title: 'Target',
            kind: 'space' as const,
            spaceId: TARGET_ID,
            map: FIRST_MAP,
            graph: FIRST_GRAPH,
          },
        },
      ],
    });
    await vi.waitFor(() => expect(siblingSession.getState().persistence.kind).toBe('failed'));
    const requestsBefore = control.requests.length;

    const result = await registry
      .spaceResources(() => RESOURCE_ID)
      .deleteGraph({
        targetSpaceId: TARGET_ID,
        mapId: FIRST_MAP,
        graphId: FIRST_GRAPH,
        preferredGraphId: SECOND_GRAPH,
      });

    expect(result).toEqual({
      kind: 'refused',
      refusal: { code: 'persistence-recovery-required', spaceId: SIBLING_ID, recovery: 'retry' },
    });
    // Refused, not relocated: Target's Graph is untouched, and nothing
    // committed for this Edit.
    expect((await backend.loadSpace(TARGET_ID))?.snapshot.document.maps?.[0]?.graphs).toHaveLength(
      2,
    );
    expect(control.requests).toHaveLength(requestsBefore);
  });

  // The "remove" direction of the same rule: Sibling's *stored* snapshot
  // selects the doomed Graph (a real, previously committed selection), and
  // Sibling's own edit moving it away failed transiently, so its working
  // Space no longer selects it — but storage still does, and that alone is
  // enough to refuse, naming Sibling, before anything is relocated.
  it('refuses to delete a Graph a failed sibling still selects in storage', async () => {
    const source = {
      ...loaded,
      snapshot: {
        ...loaded.snapshot,
        resources: [
          {
            id: RESOURCE_ID,
            document: {
              title: 'Target',
              kind: 'space' as const,
              spaceId: TARGET_ID,
              map: FIRST_MAP,
              graph: FIRST_GRAPH,
            },
          },
        ],
      },
    };
    const target = {
      ...loaded,
      snapshot: {
        ...loaded.snapshot,
        id: TARGET_ID,
        resources: [],
        document: {
          version: 1 as const,
          title: 'Target',
          defaultMap: FIRST_MAP,
          maps: [
            {
              id: FIRST_MAP,
              title: 'First',
              kind: 'positioned' as const,
              positions: {},
              activeGraph: FIRST_GRAPH,
              graphs: [
                { id: FIRST_GRAPH, title: 'First', edges: [] },
                { id: SECOND_GRAPH, title: 'Second', edges: [] },
              ],
            },
          ],
        },
      },
    };
    const sibling = {
      ...loaded,
      snapshot: {
        ...loaded.snapshot,
        id: SIBLING_ID,
        resources: [
          {
            id: SIBLING_RESOURCE_ID,
            document: { title: 'Sibling', kind: 'markdown' as const, body: '' },
          },
          {
            id: SIBLING_LINK_ID,
            document: {
              title: 'Target',
              kind: 'space' as const,
              spaceId: TARGET_ID,
              map: FIRST_MAP,
              graph: FIRST_GRAPH,
            },
          },
        ],
        document: { version: 1 as const, title: 'Sibling' },
      },
    };
    const control = new MemorySpaceBackendTestControl();
    const backend = new MemorySpaceBackend(SPACE_ID, [source, target, sibling], control);
    const registry = createSpaceSessionRegistry(backend);
    registry.open(source);
    registry.open(target);
    const siblingSession = registry.open(sibling);

    control.queueResult({ kind: 'retryable-failure', code: 'network' });
    // Sibling's own edit moves its Space Resource away from the Graph this
    // Edit is about to delete, but the commit fails transiently: storage
    // still selects the doomed Graph, even though Sibling's working no
    // longer does.
    siblingSession.submit({
      ...sibling.snapshot,
      resources: [
        {
          id: SIBLING_RESOURCE_ID,
          document: { title: 'Sibling', kind: 'markdown' as const, body: '' },
        },
        {
          id: SIBLING_LINK_ID,
          document: {
            title: 'Target',
            kind: 'space' as const,
            spaceId: TARGET_ID,
            map: FIRST_MAP,
            graph: SECOND_GRAPH,
          },
        },
      ],
    });
    await vi.waitFor(() => expect(siblingSession.getState().persistence.kind).toBe('failed'));
    const requestsBefore = control.requests.length;

    const result = await registry
      .spaceResources(() => RESOURCE_ID)
      .deleteGraph({
        targetSpaceId: TARGET_ID,
        mapId: FIRST_MAP,
        graphId: FIRST_GRAPH,
        preferredGraphId: SECOND_GRAPH,
      });

    expect(result).toEqual({
      kind: 'refused',
      refusal: { code: 'persistence-recovery-required', spaceId: SIBLING_ID, recovery: 'retry' },
    });
    // Refused, not relocated: Target's Graph is untouched, and nothing
    // committed for this Edit. No new session was opened for Sibling
    // either, since it already had one.
    expect((await backend.loadSpace(TARGET_ID))?.snapshot.document.maps?.[0]?.graphs).toHaveLength(
      2,
    );
    expect(control.requests).toHaveLength(requestsBefore);
  });

  it('owns one live session for each Space id', () => {
    const registry = createSpaceSessionRegistry(new MemorySpaceBackend(SPACE_ID, [loaded]));
    expect(registry.entry(SPACE_ID)).toBeUndefined();
    const first = registry.open(loaded);

    expect(registry.open({ ...loaded, revision: 9n })).toBe(first);
    expect(registry.session(SPACE_ID)).toBe(first);
    expect(registry.entry(SPACE_ID)).toEqual({ kind: 'session', session: first });
  });

  it('releases an idle session after its owner safely closes it', () => {
    const registry = createSpaceSessionRegistry(new MemorySpaceBackend(SPACE_ID, [loaded]));
    const first = registry.open(loaded);

    registry.release(SPACE_ID);

    expect(registry.session(SPACE_ID)).toBeUndefined();
    expect(registry.open(loaded)).not.toBe(first);
  });

  it('refuses to release a session a queued coordination has not yet claimed', async () => {
    const registry = createSpaceSessionRegistry(new MemorySpaceBackend(SPACE_ID, [loaded]));
    registry.open(loaded);

    // A coordination takes its turn synchronously but raises the barrier only
    // after awaiting that turn. Releasing inside the window between the two
    // retires a session the coordination is about to name as a participant.
    const linking = registry
      .spaceResources(() => RESOURCE_ID)
      .link({
        containingSpaceId: SPACE_ID,
        mapId: uuidSchema.parse('00000000-0000-4000-8000-000000000009'),
        targetSpaceId: SPACE_ID,
        title: 'Linked',
        position: { x: 0, y: 0 },
      });
    expect(registry.release(SPACE_ID)).toBe(false);

    await expect(linking).resolves.toBeDefined();
    expect(registry.session(SPACE_ID)).toBeDefined();
  });

  it('offers Space Resource coordination only through its lifecycle operations', () => {
    const registry = createSpaceSessionRegistry(new MemorySpaceBackend(SPACE_ID, [loaded]));
    const lifecycle = registry.spaceResources(() => RESOURCE_ID);

    expect(Object.keys(lifecycle).sort()).toEqual([
      'create',
      'delete',
      'deleteGraph',
      'deleteMap',
      'link',
    ]);
    expect(Object.keys(registry).sort()).toEqual([
      'entry',
      'open',
      'release',
      'session',
      'spaceResources',
      'waitUntilRetirable',
    ]);
  });

  // The registry applies the same membership rules Space Authoring does,
  // through `SnapshotEdit`, and these three hold it to them.
  describe('Space Resource membership through SnapshotEdit', () => {
    it("reclaims an Open Space Resource's room from every Resource it displaced, on delete", async () => {
      const OPEN_SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000020');
      const DISPLACED_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
      const DELETE_TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
      const DELETE_TARGET_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
      const DELETE_TARGET_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000024');
      const CONTAINING_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000025');
      const CONTAINING_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000026');

      const containing = {
        snapshot: {
          id: SPACE_ID,
          document: {
            version: 1 as const,
            title: 'Space',
            defaultMap: CONTAINING_MAP,
            maps: [
              {
                id: CONTAINING_MAP,
                title: 'Map 1',
                kind: 'positioned' as const,
                positions: {
                  // 400x300 Open against the 260x146 collapsed rect is a growth
                  // of 140x154, already written into the neighbour's coordinates
                  // by the Open Edit that placed it (ADR 0084) — on `x` alone, the
                  // neighbour being clear of it there (ADR 0093), exactly the
                  // fixture `Placement.reclaim`'s own unit test uses.
                  [OPEN_SPACE_RESOURCE_ID]: {
                    x: 0,
                    y: 0,
                    open: true as const,
                    openSize: { width: 400, height: 300 },
                  },
                  [DISPLACED_RESOURCE_ID]: { x: 400, y: 0, open: false as const },
                },
                graphs: [{ id: CONTAINING_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          resources: [
            {
              id: OPEN_SPACE_RESOURCE_ID,
              document: {
                title: 'Target',
                kind: 'space' as const,
                spaceId: DELETE_TARGET_ID,
                map: DELETE_TARGET_MAP,
                graph: DELETE_TARGET_GRAPH,
              },
            },
            {
              id: DISPLACED_RESOURCE_ID,
              document: { title: 'Displaced', kind: 'markdown' as const, body: '' },
            },
          ],
        },
        revision: 3n,
        exportedRevision: null,
      };
      const target = {
        snapshot: {
          id: DELETE_TARGET_ID,
          document: {
            version: 1 as const,
            title: 'Target',
            defaultMap: DELETE_TARGET_MAP,
            maps: [
              {
                id: DELETE_TARGET_MAP,
                title: 'Map 1',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: DELETE_TARGET_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          resources: [],
        },
        revision: 0n,
        exportedRevision: null,
      };
      const backend = new MemorySpaceBackend(SPACE_ID, [containing, target]);
      const registry = createSpaceSessionRegistry(backend);
      registry.open(containing);
      registry.open(target);

      const result = await registry
        .spaceResources(() => RESOURCE_ID)
        .delete({ containingSpaceId: SPACE_ID, resourceId: OPEN_SPACE_RESOURCE_ID });

      expect(result).toEqual({ kind: 'completed' });
      const stored = await backend.loadSpace(SPACE_ID);
      expect(stored?.snapshot.document.maps?.[0]?.positions).toEqual({
        [DISPLACED_RESOURCE_ID]: { x: 260, y: 0, open: false },
      });
    });

    it('refuses to delete a Space Resource a Reference Resource targets, and commits nothing', async () => {
      const REFERENCED_SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000030');
      const REFERENCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000031');
      const REFERENCE_TARGET_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000032');
      const REFERENCE_TARGET_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000033');
      const REFERENCE_TARGET_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000034');
      const CONTAINING_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000035');
      const CONTAINING_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000036');

      const containing = {
        snapshot: {
          id: SPACE_ID,
          document: {
            version: 1 as const,
            title: 'Space',
            defaultMap: CONTAINING_MAP,
            maps: [
              {
                id: CONTAINING_MAP,
                title: 'Map 1',
                kind: 'positioned' as const,
                positions: {
                  [REFERENCED_SPACE_RESOURCE_ID]: { x: 0, y: 0, open: false as const },
                  [REFERENCE_ID]: { x: 300, y: 0, open: false as const },
                },
                graphs: [{ id: CONTAINING_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          resources: [
            {
              id: REFERENCED_SPACE_RESOURCE_ID,
              document: {
                title: 'Target',
                kind: 'space' as const,
                spaceId: REFERENCE_TARGET_SPACE_ID,
                map: REFERENCE_TARGET_MAP,
                graph: REFERENCE_TARGET_GRAPH,
              },
            },
            {
              id: REFERENCE_ID,
              document: {
                title: 'Reference Resource of Target',
                kind: 'reference' as const,
                target: REFERENCED_SPACE_RESOURCE_ID,
              },
            },
          ],
        },
        revision: 3n,
        exportedRevision: null,
      };
      const target = {
        snapshot: {
          id: REFERENCE_TARGET_SPACE_ID,
          document: {
            version: 1 as const,
            title: 'Target',
            defaultMap: REFERENCE_TARGET_MAP,
            maps: [
              {
                id: REFERENCE_TARGET_MAP,
                title: 'Map 1',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: REFERENCE_TARGET_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          resources: [],
        },
        revision: 0n,
        exportedRevision: null,
      };
      const backend = new MemorySpaceBackend(SPACE_ID, [containing, target]);
      const registry = createSpaceSessionRegistry(backend);
      registry.open(containing);
      registry.open(target);

      const result = await registry
        .spaceResources(() => RESOURCE_ID)
        .delete({ containingSpaceId: SPACE_ID, resourceId: REFERENCED_SPACE_RESOURCE_ID });

      expect(result).toEqual({
        kind: 'refused',
        refusal: {
          code: 'resource-has-references',
          referenceTitles: ['Reference Resource of Target'],
        },
      });
      const stored = await backend.loadSpace(SPACE_ID);
      expect(stored?.revision).toBe(3n);
      expect(stored?.snapshot.resources).toHaveLength(2);
      expect(await backend.loadSpace(REFERENCE_TARGET_SPACE_ID)).toBeDefined();
    });

    // The behavioural invariant proved below (spec.md, "Coordinated
    // operations decide after their last wait"): whichever server read a
    // late Reference Resource lands in, the deletion never rejects and never answers
    // `aggregate-refused` — when the Reference Resource landed before the coordination's
    // one decision, the deletion refuses `resource-has-references`; when it did
    // not, the ordinary Reference-free deletion completes. The coordination
    // makes exactly one aggregate read, so injecting on read 2 never fires
    // and exercises the ordinary completion instead.
    it.each([1, 2] as const)(
      'refuses to delete a Space Resource a Reference Resource came to target while the deletion was reading persistence (late Edit on read %i)',
      async (readToInject) => {
        const REFERENCED_SPACE_RESOURCE_ID = uuidSchema.parse(
          '00000000-0000-4000-8000-000000000050',
        );
        const LATE_REFERENCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000051');
        const REFERENCE_TARGET_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000052');
        const REFERENCE_TARGET_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000053');
        const REFERENCE_TARGET_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000054');
        const CONTAINING_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000055');
        const CONTAINING_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000056');

        const containing = {
          snapshot: {
            id: SPACE_ID,
            document: {
              version: 1 as const,
              title: 'Space',
              defaultMap: CONTAINING_MAP,
              maps: [
                {
                  id: CONTAINING_MAP,
                  title: 'Map 1',
                  kind: 'positioned' as const,
                  positions: {
                    [REFERENCED_SPACE_RESOURCE_ID]: { x: 0, y: 0, open: false as const },
                  },
                  graphs: [{ id: CONTAINING_GRAPH, title: 'Graph 1', edges: [] }],
                },
              ],
            },
            resources: [
              {
                id: REFERENCED_SPACE_RESOURCE_ID,
                document: {
                  title: 'Target',
                  kind: 'space' as const,
                  spaceId: REFERENCE_TARGET_SPACE_ID,
                  map: REFERENCE_TARGET_MAP,
                  graph: REFERENCE_TARGET_GRAPH,
                },
              },
            ],
          },
          revision: 3n,
          exportedRevision: null,
        };
        const target = {
          snapshot: {
            id: REFERENCE_TARGET_SPACE_ID,
            document: {
              version: 1 as const,
              title: 'Target',
              defaultMap: REFERENCE_TARGET_MAP,
              maps: [
                {
                  id: REFERENCE_TARGET_MAP,
                  title: 'Map 1',
                  kind: 'positioned' as const,
                  positions: {},
                  graphs: [{ id: REFERENCE_TARGET_GRAPH, title: 'Graph 1', edges: [] }],
                },
              ],
            },
            resources: [],
          },
          revision: 0n,
          exportedRevision: null,
        };
        const backend = new MemorySpaceBackend(SPACE_ID, [containing, target]);
        const registry = createSpaceSessionRegistry(backend);
        const containingSession = registry.open(containing);
        registry.open(target);

        // A Reference Resource of the Space Resource lands in the containing Space on the
        // named read of the coordination's aggregate loads.
        const loadAggregate = backend.loadAggregate.bind(backend);
        let reads = 0;
        const injected = { value: false };
        backend.loadAggregate = async () => {
          reads += 1;
          if (reads === readToInject) {
            injected.value = true;
            const working = containingSession.getState().working;
            const document = working.document;
            const maps = (document.maps ?? []).map((map) => ({
              ...map,
              positions: {
                ...map.positions,
                [LATE_REFERENCE_ID]: { x: 300, y: 0, open: false as const },
              },
            }));
            containingSession.submit({
              ...working,
              document: { ...document, maps },
              resources: [
                ...working.resources,
                {
                  id: LATE_REFERENCE_ID,
                  document: {
                    title: 'Late Reference Resource of Target',
                    kind: 'reference' as const,
                    target: REFERENCED_SPACE_RESOURCE_ID,
                  },
                },
              ],
            });
          }
          return loadAggregate();
        };

        const deletion = registry
          .spaceResources(() => RESOURCE_ID)
          .delete({ containingSpaceId: SPACE_ID, resourceId: REFERENCED_SPACE_RESOURCE_ID });

        await expect(deletion).resolves.toBeDefined();
        const result = await deletion;
        if (result.kind === 'refused') expect(result.refusal.code).not.toBe('aggregate-refused');

        if (injected.value) {
          expect(result).toEqual({
            kind: 'refused',
            refusal: {
              code: 'resource-has-references',
              referenceTitles: ['Late Reference Resource of Target'],
            },
          });
          expect(containingSession.getState().working.resources.map(({ id }) => id)).toEqual([
            REFERENCED_SPACE_RESOURCE_ID,
            LATE_REFERENCE_ID,
          ]);

          // The refused deletion must not have swallowed the late Reference Resource's own
          // Edit: the containing Space still holds the Space Resource and the
          // Reference Resource, and that Edit commits once the coordination's barrier
          // lifts.
          const settled = await waitFor(
            containingSession,
            (state) => state.persistence.kind === 'settled' && state.acknowledgedRevision > 3n,
          );
          expect(settled.working.resources.map(({ id }) => id)).toEqual([
            REFERENCED_SPACE_RESOURCE_ID,
            LATE_REFERENCE_ID,
          ]);
          const stored = await backend.loadSpace(SPACE_ID);
          expect(stored?.snapshot.resources.map(({ id }) => id)).toEqual([
            REFERENCED_SPACE_RESOURCE_ID,
            LATE_REFERENCE_ID,
          ]);
          expect(await backend.loadSpace(REFERENCE_TARGET_SPACE_ID)).toBeDefined();
        } else {
          // No late Reference Resource ever landed: the ordinary deletion completes, and
          // the Reference Resource Target — now unreferenced — is cascaded away with it.
          expect(result).toEqual({ kind: 'completed' });
          await waitFor(
            containingSession,
            (state) => state.persistence.kind === 'settled' && state.acknowledgedRevision > 3n,
          );
          const stored = await backend.loadSpace(SPACE_ID);
          expect(stored?.snapshot.resources).toEqual([]);
          expect(await backend.loadSpace(REFERENCE_TARGET_SPACE_ID)).toBeUndefined();
        }
      },
    );

    // The behavioural invariant proved below (spec.md, "Coordinated
    // operations decide after their last wait"): whichever server read a
    // late reference to Target lands in, the deletion never rejects and
    // never answers `aggregate-refused` — when the reference landed before
    // the coordination's one decision, Target survives the cascade; when it
    // did not, Target — now unreferenced — is deleted along with the Space
    // Resource. The coordination makes exactly one aggregate read, so injecting
    // on read 2 never fires and exercises the ordinary cascade instead.
    it.each([1, 2] as const)(
      'keeps a target Space alive when another Space comes to reference it while the deletion was reading persistence (late Edit on read %i)',
      async (readToInject) => {
        const REFERENCING_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000060');
        const TARGET_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000061');
        const TARGET_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000062');
        const TARGET_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000063');
        const CONTAINING_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000064');
        const CONTAINING_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000065');
        const OTHER_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000066');
        const OTHER_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000067');
        const OTHER_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000068');
        const LATE_REFERENCE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000069');
        const OTHER_REFERENCE_RESOURCE_ID = uuidSchema.parse(
          '00000000-0000-4000-8000-000000000070',
        );

        const containing = {
          snapshot: {
            id: SPACE_ID,
            document: {
              version: 1 as const,
              title: 'Space',
              defaultMap: CONTAINING_MAP,
              maps: [
                {
                  id: CONTAINING_MAP,
                  title: 'Map 1',
                  kind: 'positioned' as const,
                  positions: {
                    [REFERENCING_RESOURCE_ID]: { x: 0, y: 0, open: false as const },
                    // Keeps Other reachable from Meta independently of the
                    // deletion below, so the scenario isolates what happens to
                    // Target rather than also depending on Other's own reachability.
                    [OTHER_REFERENCE_RESOURCE_ID]: { x: 240, y: 0, open: false as const },
                  },
                  graphs: [{ id: CONTAINING_GRAPH, title: 'Graph 1', edges: [] }],
                },
              ],
            },
            resources: [
              {
                id: REFERENCING_RESOURCE_ID,
                document: {
                  title: 'Target',
                  kind: 'space' as const,
                  spaceId: TARGET_SPACE_ID,
                  map: TARGET_MAP,
                  graph: TARGET_GRAPH,
                },
              },
              {
                id: OTHER_REFERENCE_RESOURCE_ID,
                document: {
                  title: 'Other',
                  kind: 'space' as const,
                  spaceId: OTHER_SPACE_ID,
                  map: OTHER_MAP,
                  graph: OTHER_GRAPH,
                },
              },
            ],
          },
          revision: 3n,
          exportedRevision: null,
        };
        const target = {
          snapshot: {
            id: TARGET_SPACE_ID,
            document: {
              version: 1 as const,
              title: 'Target',
              defaultMap: TARGET_MAP,
              maps: [
                {
                  id: TARGET_MAP,
                  title: 'Map 1',
                  kind: 'positioned' as const,
                  positions: {},
                  graphs: [{ id: TARGET_GRAPH, title: 'Graph 1', edges: [] }],
                },
              ],
            },
            resources: [],
          },
          revision: 0n,
          exportedRevision: null,
        };
        const other = {
          snapshot: {
            id: OTHER_SPACE_ID,
            document: {
              version: 1 as const,
              title: 'Other',
              defaultMap: OTHER_MAP,
              maps: [
                {
                  id: OTHER_MAP,
                  title: 'Map 1',
                  kind: 'positioned' as const,
                  positions: {},
                  graphs: [{ id: OTHER_GRAPH, title: 'Graph 1', edges: [] }],
                },
              ],
            },
            resources: [],
          },
          revision: 0n,
          exportedRevision: null,
        };
        const backend = new MemorySpaceBackend(SPACE_ID, [containing, target, other]);
        const registry = createSpaceSessionRegistry(backend);
        const containingSession = registry.open(containing);
        registry.open(target);

        // An entirely ordinary Edit — Other referencing Target — commits to
        // the backend on the named read of the coordination's aggregate
        // loads, the way an unrelated author's Edit could land in that
        // window.
        const loadAggregate = backend.loadAggregate.bind(backend);
        const commit = backend.commit.bind(backend);
        let reads = 0;
        const injected = { value: false };
        backend.loadAggregate = async () => {
          reads += 1;
          if (reads === readToInject) {
            injected.value = true;
            const maps = other.snapshot.document.maps.map((map) => ({
              ...map,
              positions: {
                ...map.positions,
                [LATE_REFERENCE_RESOURCE_ID]: { x: 0, y: 0, open: false as const },
              },
            }));
            const committed = await commit({
              changes: [
                {
                  kind: 'update',
                  spaceId: OTHER_SPACE_ID,
                  expectedRevision: other.revision,
                  snapshot: {
                    ...other.snapshot,
                    document: { ...other.snapshot.document, maps },
                    resources: [
                      ...other.snapshot.resources,
                      {
                        id: LATE_REFERENCE_RESOURCE_ID,
                        document: {
                          title: 'Late reference to Target',
                          kind: 'space' as const,
                          spaceId: TARGET_SPACE_ID,
                          map: TARGET_MAP,
                          graph: TARGET_GRAPH,
                        },
                      },
                    ],
                  },
                },
              ],
            });
            if (committed.kind !== 'committed') {
              throw new Error(`Other's late reference failed to commit: ${committed.kind}`);
            }
          }
          return loadAggregate();
        };

        const deletion = registry
          .spaceResources(() => RESOURCE_ID)
          .delete({ containingSpaceId: SPACE_ID, resourceId: REFERENCING_RESOURCE_ID });

        await expect(deletion).resolves.toBeDefined();
        const result = await deletion;
        if (result.kind === 'refused') expect(result.refusal.code).not.toBe('aggregate-refused');
        expect(result).toEqual({ kind: 'completed' });

        // The coordinated commit is asynchronous even once `delete` resolves
        // (ADR 0030): wait for the containing Space's own commit to land
        // before reading it back off the backend.
        await waitFor(
          containingSession,
          (state) => state.persistence.kind === 'settled' && state.acknowledgedRevision > 3n,
        );

        if (injected.value) {
          // Other's late reference landed before the cascade was planned, so
          // it kept Target alive through it.
          expect(await backend.loadSpace(TARGET_SPACE_ID)).toBeDefined();
          const storedContaining = await backend.loadSpace(SPACE_ID);
          expect(storedContaining?.snapshot.resources.map(({ id }) => id)).toEqual([
            OTHER_REFERENCE_RESOURCE_ID,
          ]);
          const storedOther = await backend.loadSpace(OTHER_SPACE_ID);
          expect(storedOther?.snapshot.resources.map(({ id }) => id)).toEqual([
            LATE_REFERENCE_RESOURCE_ID,
          ]);
        } else {
          // No late reference ever landed: Target, now unreferenced, is
          // deleted along with the Space Resource that named it.
          expect(await backend.loadSpace(TARGET_SPACE_ID)).toBeUndefined();
          const storedContaining = await backend.loadSpace(SPACE_ID);
          expect(storedContaining?.snapshot.resources.map(({ id }) => id)).toEqual([
            OTHER_REFERENCE_RESOURCE_ID,
          ]);
          const storedOther = await backend.loadSpace(OTHER_SPACE_ID);
          expect(storedOther?.snapshot.resources).toEqual([]);
        }
      },
    );

    it('steps a created Space Resource off a point another Resource already occupies', async () => {
      const CONTAINING_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000040');
      const CONTAINING_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000041');
      const OCCUPYING_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000042');
      const NEW_TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000043');
      const NEW_TARGET_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000044');
      const NEW_TARGET_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000045');
      const NEW_TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000046');
      const NEW_SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000047');
      const OCCUPIED_ANCHOR = { x: 240, y: 80 };

      const containing = {
        snapshot: {
          id: SPACE_ID,
          document: {
            version: 1 as const,
            title: 'Space',
            defaultMap: CONTAINING_MAP,
            maps: [
              {
                id: CONTAINING_MAP,
                title: 'Map 1',
                kind: 'positioned' as const,
                positions: {
                  [OCCUPYING_RESOURCE_ID]: { ...OCCUPIED_ANCHOR, open: false as const },
                },
                graphs: [{ id: CONTAINING_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          resources: [
            {
              id: OCCUPYING_RESOURCE_ID,
              document: { title: 'Occupying', kind: 'markdown' as const, body: '' },
            },
          ],
        },
        revision: 3n,
        exportedRevision: null,
      };
      const backend = new MemorySpaceBackend(SPACE_ID, [containing]);
      const registry = createSpaceSessionRegistry(backend);
      registry.open(containing);

      const ids = [
        NEW_TARGET_ID,
        NEW_TARGET_RESOURCE_ID,
        NEW_TARGET_MAP_ID,
        NEW_TARGET_GRAPH_ID,
        NEW_SPACE_RESOURCE_ID,
      ];
      const remaining = [...ids];
      const newId = () => {
        const id = remaining.shift();
        if (id === undefined) throw new Error('test identity source exhausted');
        return id;
      };

      const result = await registry.spaceResources(newId).create({
        containingSpaceId: SPACE_ID,
        mapId: CONTAINING_MAP,
        title: 'New Space Resource',
        position: OCCUPIED_ANCHOR,
      });

      expect(result).toEqual({ kind: 'completed', resourceId: NEW_SPACE_RESOURCE_ID });
      const stored = await backend.loadSpace(SPACE_ID);
      expect(stored?.snapshot.document.maps?.[0]?.positions[NEW_SPACE_RESOURCE_ID]).toEqual({
        x: OCCUPIED_ANCHOR.x + 24,
        y: OCCUPIED_ANCHOR.y + 24,
        open: false,
      });
    });

    // Create and link decide on their containing Map after the coordination's
    // own aggregate read, not only before it.
    it('refuses to create a Space Resource when its containing Map is deleted while the creation was reading persistence', async () => {
      const CONTAINING_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000080');
      const CONTAINING_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000081');
      const KEEP_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000082');
      const KEEP_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000083');
      const NEW_TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000084');
      const NEW_TARGET_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000085');
      const NEW_TARGET_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000086');
      const NEW_TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000087');
      const NEW_SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000088');

      const containing = {
        snapshot: {
          id: SPACE_ID,
          document: {
            version: 1 as const,
            title: 'Space',
            defaultMap: KEEP_MAP,
            maps: [
              {
                id: CONTAINING_MAP,
                title: 'Map 1',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: CONTAINING_GRAPH, title: 'Graph 1', edges: [] }],
              },
              {
                id: KEEP_MAP,
                title: 'Map 2',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: KEEP_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          resources: [],
        },
        revision: 3n,
        exportedRevision: null,
      };
      const backend = new MemorySpaceBackend(SPACE_ID, [containing]);
      const registry = createSpaceSessionRegistry(backend);
      const containingSession = registry.open(containing);

      // The creation's coordination reads the aggregate exactly once, right
      // before it decides. The containing Map is deleted in the
      // containing Space during that one read.
      const loadAggregate = backend.loadAggregate.bind(backend);
      let reads = 0;
      backend.loadAggregate = async () => {
        reads += 1;
        if (reads === 1) {
          const working = containingSession.getState().working;
          containingSession.submit({
            ...working,
            document: {
              ...working.document,
              maps: (working.document.maps ?? []).filter((map) => map.id !== CONTAINING_MAP),
            },
          });
        }
        return loadAggregate();
      };

      const ids = [
        NEW_TARGET_ID,
        NEW_TARGET_RESOURCE_ID,
        NEW_TARGET_MAP_ID,
        NEW_TARGET_GRAPH_ID,
        NEW_SPACE_RESOURCE_ID,
      ];
      const remaining = [...ids];
      const newId = () => {
        const id = remaining.shift();
        if (id === undefined) throw new Error('test identity source exhausted');
        return id;
      };

      const creation = registry.spaceResources(newId).create({
        containingSpaceId: SPACE_ID,
        mapId: CONTAINING_MAP,
        title: 'New Space Resource',
        position: { x: 0, y: 0 },
      });

      await expect(creation).resolves.toEqual({
        kind: 'refused',
        refusal: { code: 'map-not-found', mapId: CONTAINING_MAP },
      });
      expect(reads).toBe(1);
      expect(containingSession.getState().working.resources).toEqual([]);

      // The refused creation must not have swallowed the Map-deletion
      // Edit: it commits once the coordination's barrier lifts.
      const settled = await waitFor(
        containingSession,
        (state) => state.persistence.kind === 'settled' && state.acknowledgedRevision > 3n,
      );
      expect(settled.working.document.maps?.map(({ id }) => id)).toEqual([KEEP_MAP]);
      const stored = await backend.loadSpace(SPACE_ID);
      expect(stored?.snapshot.document.maps?.map(({ id }) => id)).toEqual([KEEP_MAP]);
      expect(stored?.snapshot.resources).toEqual([]);
    });

    it('refuses to link a Space Resource when its containing Map is deleted while the link was reading persistence', async () => {
      const CONTAINING_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000090');
      const CONTAINING_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000091');
      const KEEP_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000092');
      const KEEP_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000093');
      const LINK_TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000094');
      const LINK_TARGET_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000095');
      const LINK_TARGET_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000096');
      const LINKED_SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000097');

      const containing = {
        snapshot: {
          id: SPACE_ID,
          document: {
            version: 1 as const,
            title: 'Space',
            defaultMap: KEEP_MAP,
            maps: [
              {
                id: CONTAINING_MAP,
                title: 'Map 1',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: CONTAINING_GRAPH, title: 'Graph 1', edges: [] }],
              },
              {
                id: KEEP_MAP,
                title: 'Map 2',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: KEEP_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          resources: [],
        },
        revision: 3n,
        exportedRevision: null,
      };
      const target = {
        snapshot: {
          id: LINK_TARGET_ID,
          document: {
            version: 1 as const,
            title: 'Target',
            defaultMap: LINK_TARGET_MAP,
            maps: [
              {
                id: LINK_TARGET_MAP,
                title: 'Map 1',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: LINK_TARGET_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          resources: [],
        },
        revision: 0n,
        exportedRevision: null,
      };
      const backend = new MemorySpaceBackend(SPACE_ID, [containing, target]);
      const registry = createSpaceSessionRegistry(backend);
      const containingSession = registry.open(containing);
      registry.open(target);

      // Same shape as the creation test above: the containing Map is
      // deleted during the coordination's one aggregate read, after `link`
      // has already confirmed the Map exists and read the target's
      // selection off its live session.
      const loadAggregate = backend.loadAggregate.bind(backend);
      let reads = 0;
      backend.loadAggregate = async () => {
        reads += 1;
        if (reads === 1) {
          const working = containingSession.getState().working;
          containingSession.submit({
            ...working,
            document: {
              ...working.document,
              maps: (working.document.maps ?? []).filter((map) => map.id !== CONTAINING_MAP),
            },
          });
        }
        return loadAggregate();
      };

      const linking = registry
        .spaceResources(() => LINKED_SPACE_RESOURCE_ID)
        .link({
          containingSpaceId: SPACE_ID,
          mapId: CONTAINING_MAP,
          targetSpaceId: LINK_TARGET_ID,
          title: 'Linked',
          position: { x: 0, y: 0 },
        });

      await expect(linking).resolves.toEqual({
        kind: 'refused',
        refusal: { code: 'map-not-found', mapId: CONTAINING_MAP },
      });
      expect(reads).toBe(1);
      expect(containingSession.getState().working.resources).toEqual([]);

      const settled = await waitFor(
        containingSession,
        (state) => state.persistence.kind === 'settled' && state.acknowledgedRevision > 3n,
      );
      expect(settled.working.document.maps?.map(({ id }) => id)).toEqual([KEEP_MAP]);
      const stored = await backend.loadSpace(SPACE_ID);
      expect(stored?.snapshot.document.maps?.map(({ id }) => id)).toEqual([KEEP_MAP]);
      expect(stored?.snapshot.resources).toEqual([]);
    });
  });
});

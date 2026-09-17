import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { MemorySpaceBackend } from '../src/memory';
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
const THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const FIRST_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const SECOND_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const FIRST_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const SECOND_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const OTHER_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const OTHER_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const OTHER_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const OTHER_REFERENCE = uuidSchema.parse('00000000-0000-4000-8000-000000000012');

const loaded = {
  snapshot: {
    id: SPACE_ID,
    document: { version: 1 as const, title: 'Space' },
    things: [{ id: THING_ID, document: { title: 'Thing', kind: 'markdown' as const, body: '' } }],
  },
  revision: 3n,
  exportedRevision: null,
};

describe('Space session registry', () => {
  it('deletes a Diagram while moving every Space Thing that selected it', async () => {
    const reference = (thingId: typeof THING_ID) => ({
      id: thingId,
      document: {
        title: 'Target',
        kind: 'space' as const,
        spaceId: TARGET_ID,
        diagram: SECOND_DIAGRAM,
        graph: SECOND_GRAPH,
        framing: { centreX: 120, centreY: 80, zoom: 1.5 },
      },
    });
    const source = {
      ...loaded,
      snapshot: {
        ...loaded.snapshot,
        things: [
          reference(THING_ID),
          {
            id: OTHER_REFERENCE,
            document: {
              title: 'Other',
              kind: 'space' as const,
              spaceId: OTHER_ID,
              diagram: OTHER_DIAGRAM,
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
        things: [reference(OTHER_THING_ID)],
        document: {
          version: 1 as const,
          title: 'Other',
          defaultDiagram: OTHER_DIAGRAM,
          diagrams: [
            {
              id: OTHER_DIAGRAM,
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
        things: [],
        document: {
          version: 1 as const,
          title: 'Target',
          defaultDiagram: FIRST_DIAGRAM,
          diagrams: [
            {
              id: FIRST_DIAGRAM,
              title: 'First',
              kind: 'positioned' as const,
              positions: {},
              graphs: [{ id: FIRST_GRAPH, title: 'First', edges: [] }],
            },
            {
              id: SECOND_DIAGRAM,
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
      .spaceThings(() => THING_ID)
      .deleteDiagram({
        targetSpaceId: TARGET_ID,
        diagramId: SECOND_DIAGRAM,
        preferredDiagramId: OTHER_DIAGRAM,
      });

    expect(result).toEqual({
      kind: 'completed',
      diagramId: FIRST_DIAGRAM,
      graphId: FIRST_GRAPH,
    });
    expect((await backend.loadSpace(TARGET_ID))?.snapshot.document.diagrams).toHaveLength(1);
    for (const id of [SPACE_ID, OTHER_ID]) {
      const stored = await backend.loadSpace(id);
      expect(stored?.snapshot.things[0]?.document).toMatchObject({
        diagram: FIRST_DIAGRAM,
        graph: FIRST_GRAPH,
      });
      expect(stored?.snapshot.things[0]?.document).not.toHaveProperty('framing');
    }
  });

  it('deletes a Graph while moving every Space Thing that selected it', async () => {
    const source = {
      ...loaded,
      snapshot: {
        ...loaded.snapshot,
        things: [
          {
            id: THING_ID,
            document: {
              title: 'Target',
              kind: 'space' as const,
              spaceId: TARGET_ID,
              diagram: FIRST_DIAGRAM,
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
        things: [],
        document: {
          version: 1 as const,
          title: 'Target',
          defaultDiagram: FIRST_DIAGRAM,
          diagrams: [
            {
              id: FIRST_DIAGRAM,
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
      .spaceThings(() => THING_ID)
      .deleteGraph({
        targetSpaceId: TARGET_ID,
        diagramId: FIRST_DIAGRAM,
        graphId: SECOND_GRAPH,
        preferredGraphId: SECOND_GRAPH,
      });

    expect(result).toEqual({
      kind: 'completed',
      diagramId: FIRST_DIAGRAM,
      graphId: FIRST_GRAPH,
    });
    expect(
      (await backend.loadSpace(TARGET_ID))?.snapshot.document.diagrams?.[0]?.graphs,
    ).toHaveLength(1);
    expect((await backend.loadSpace(SPACE_ID))?.snapshot.things[0]?.document).toMatchObject({
      diagram: FIRST_DIAGRAM,
      graph: FIRST_GRAPH,
      framing: { centreX: 120, centreY: 80, zoom: 1.5 },
    });
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
      .spaceThings(() => THING_ID)
      .link({
        containingSpaceId: SPACE_ID,
        diagramId: uuidSchema.parse('00000000-0000-4000-8000-000000000009'),
        targetSpaceId: SPACE_ID,
        title: 'Linked',
        position: { x: 0, y: 0 },
      });
    expect(registry.release(SPACE_ID)).toBe(false);

    await expect(linking).resolves.toBeDefined();
    expect(registry.session(SPACE_ID)).toBeDefined();
  });

  it('offers Space Thing coordination only through its lifecycle operations', () => {
    const registry = createSpaceSessionRegistry(new MemorySpaceBackend(SPACE_ID, [loaded]));
    const lifecycle = registry.spaceThings(() => THING_ID);

    expect(Object.keys(lifecycle).sort()).toEqual([
      'create',
      'delete',
      'deleteDiagram',
      'deleteGraph',
      'link',
    ]);
    expect(Object.keys(registry).sort()).toEqual([
      'entry',
      'open',
      'release',
      'session',
      'spaceThings',
      'waitUntilRetirable',
    ]);
  });

  // Ticket 01 (`.scratch/snapshot-edits/issues/01-registry-edits-through-snapshot-edit.md`):
  // the registry's own copy of the membership rules diverged from Space
  // Authoring's. These three are the failing tests that prove it, written
  // before `SnapshotEdit` existed.
  describe('Space Thing membership through SnapshotEdit', () => {
    it("reclaims an Open Space Thing's room from every Thing it displaced, on delete", async () => {
      const OPEN_SPACE_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000020');
      const DISPLACED_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
      const DELETE_TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
      const DELETE_TARGET_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
      const DELETE_TARGET_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000024');
      const CONTAINING_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000025');
      const CONTAINING_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000026');

      const containing = {
        snapshot: {
          id: SPACE_ID,
          document: {
            version: 1 as const,
            title: 'Space',
            defaultDiagram: CONTAINING_DIAGRAM,
            diagrams: [
              {
                id: CONTAINING_DIAGRAM,
                title: 'Diagram 1',
                kind: 'positioned' as const,
                positions: {
                  // 400x300 Open against the 260x146 collapsed rect is a growth
                  // of 140x154, already written into the neighbour's coordinates
                  // by the Open Edit that placed it (ADR 0084) — exactly the
                  // fixture `Placement.reclaim`'s own unit test uses.
                  [OPEN_SPACE_THING_ID]: {
                    x: 0,
                    y: 0,
                    open: true as const,
                    openSize: { width: 400, height: 300 },
                  },
                  [DISPLACED_THING_ID]: { x: 140, y: 154, open: false as const },
                },
                graphs: [{ id: CONTAINING_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          things: [
            {
              id: OPEN_SPACE_THING_ID,
              document: {
                title: 'Target',
                kind: 'space' as const,
                spaceId: DELETE_TARGET_ID,
                diagram: DELETE_TARGET_DIAGRAM,
                graph: DELETE_TARGET_GRAPH,
              },
            },
            {
              id: DISPLACED_THING_ID,
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
            defaultDiagram: DELETE_TARGET_DIAGRAM,
            diagrams: [
              {
                id: DELETE_TARGET_DIAGRAM,
                title: 'Diagram 1',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: DELETE_TARGET_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          things: [],
        },
        revision: 0n,
        exportedRevision: null,
      };
      const backend = new MemorySpaceBackend(SPACE_ID, [containing, target]);
      const registry = createSpaceSessionRegistry(backend);
      registry.open(containing);
      registry.open(target);

      const result = await registry
        .spaceThings(() => THING_ID)
        .delete({ containingSpaceId: SPACE_ID, thingId: OPEN_SPACE_THING_ID });

      expect(result).toEqual({ kind: 'completed' });
      const stored = await backend.loadSpace(SPACE_ID);
      expect(stored?.snapshot.document.diagrams?.[0]?.positions).toEqual({
        [DISPLACED_THING_ID]: { x: 0, y: 0, open: false },
      });
    });

    it('refuses to delete a Space Thing an Alias targets, and commits nothing', async () => {
      const ALIASED_SPACE_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000030');
      const ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000031');
      const ALIAS_TARGET_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000032');
      const ALIAS_TARGET_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000033');
      const ALIAS_TARGET_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000034');
      const CONTAINING_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000035');
      const CONTAINING_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000036');

      const containing = {
        snapshot: {
          id: SPACE_ID,
          document: {
            version: 1 as const,
            title: 'Space',
            defaultDiagram: CONTAINING_DIAGRAM,
            diagrams: [
              {
                id: CONTAINING_DIAGRAM,
                title: 'Diagram 1',
                kind: 'positioned' as const,
                positions: {
                  [ALIASED_SPACE_THING_ID]: { x: 0, y: 0, open: false as const },
                  [ALIAS_ID]: { x: 300, y: 0, open: false as const },
                },
                graphs: [{ id: CONTAINING_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          things: [
            {
              id: ALIASED_SPACE_THING_ID,
              document: {
                title: 'Target',
                kind: 'space' as const,
                spaceId: ALIAS_TARGET_SPACE_ID,
                diagram: ALIAS_TARGET_DIAGRAM,
                graph: ALIAS_TARGET_GRAPH,
              },
            },
            {
              id: ALIAS_ID,
              document: {
                title: 'Alias of Target',
                kind: 'alias' as const,
                target: ALIASED_SPACE_THING_ID,
              },
            },
          ],
        },
        revision: 3n,
        exportedRevision: null,
      };
      const target = {
        snapshot: {
          id: ALIAS_TARGET_SPACE_ID,
          document: {
            version: 1 as const,
            title: 'Target',
            defaultDiagram: ALIAS_TARGET_DIAGRAM,
            diagrams: [
              {
                id: ALIAS_TARGET_DIAGRAM,
                title: 'Diagram 1',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: ALIAS_TARGET_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          things: [],
        },
        revision: 0n,
        exportedRevision: null,
      };
      const backend = new MemorySpaceBackend(SPACE_ID, [containing, target]);
      const registry = createSpaceSessionRegistry(backend);
      registry.open(containing);
      registry.open(target);

      const result = await registry
        .spaceThings(() => THING_ID)
        .delete({ containingSpaceId: SPACE_ID, thingId: ALIASED_SPACE_THING_ID });

      expect(result).toEqual({
        kind: 'refused',
        refusal: { code: 'thing-has-aliases', aliasTitles: ['Alias of Target'] },
      });
      const stored = await backend.loadSpace(SPACE_ID);
      expect(stored?.revision).toBe(3n);
      expect(stored?.snapshot.things).toHaveLength(2);
      expect(await backend.loadSpace(ALIAS_TARGET_SPACE_ID)).toBeDefined();
    });

    it('refuses to delete a Space Thing an Alias came to target while the deletion was reading persistence', async () => {
      const ALIASED_SPACE_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000050');
      const LATE_ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000051');
      const ALIAS_TARGET_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000052');
      const ALIAS_TARGET_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000053');
      const ALIAS_TARGET_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000054');
      const CONTAINING_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000055');
      const CONTAINING_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000056');

      const containing = {
        snapshot: {
          id: SPACE_ID,
          document: {
            version: 1 as const,
            title: 'Space',
            defaultDiagram: CONTAINING_DIAGRAM,
            diagrams: [
              {
                id: CONTAINING_DIAGRAM,
                title: 'Diagram 1',
                kind: 'positioned' as const,
                positions: {
                  [ALIASED_SPACE_THING_ID]: { x: 0, y: 0, open: false as const },
                },
                graphs: [{ id: CONTAINING_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          things: [
            {
              id: ALIASED_SPACE_THING_ID,
              document: {
                title: 'Target',
                kind: 'space' as const,
                spaceId: ALIAS_TARGET_SPACE_ID,
                diagram: ALIAS_TARGET_DIAGRAM,
                graph: ALIAS_TARGET_GRAPH,
              },
            },
          ],
        },
        revision: 3n,
        exportedRevision: null,
      };
      const target = {
        snapshot: {
          id: ALIAS_TARGET_SPACE_ID,
          document: {
            version: 1 as const,
            title: 'Target',
            defaultDiagram: ALIAS_TARGET_DIAGRAM,
            diagrams: [
              {
                id: ALIAS_TARGET_DIAGRAM,
                title: 'Diagram 1',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: ALIAS_TARGET_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          things: [],
        },
        revision: 0n,
        exportedRevision: null,
      };
      const backend = new MemorySpaceBackend(SPACE_ID, [containing, target]);
      const registry = createSpaceSessionRegistry(backend);
      const containingSession = registry.open(containing);
      registry.open(target);

      // The deletion's coordination reads the aggregate exactly once, right
      // before it decides. An Alias of the Space Thing lands in the
      // containing Space during that one read.
      const loadAggregate = backend.loadAggregate.bind(backend);
      let reads = 0;
      backend.loadAggregate = async () => {
        reads += 1;
        if (reads === 1) {
          const working = containingSession.getState().working;
          const document = working.document;
          const diagrams = (document.diagrams ?? []).map((diagram) => ({
            ...diagram,
            positions: {
              ...diagram.positions,
              [LATE_ALIAS_ID]: { x: 300, y: 0, open: false as const },
            },
          }));
          containingSession.submit({
            ...working,
            document: { ...document, diagrams },
            things: [
              ...working.things,
              {
                id: LATE_ALIAS_ID,
                document: {
                  title: 'Late Alias of Target',
                  kind: 'alias' as const,
                  target: ALIASED_SPACE_THING_ID,
                },
              },
            ],
          });
        }
        return loadAggregate();
      };

      const deletion = registry
        .spaceThings(() => THING_ID)
        .delete({ containingSpaceId: SPACE_ID, thingId: ALIASED_SPACE_THING_ID });

      await expect(deletion).resolves.toEqual({
        kind: 'refused',
        refusal: { code: 'thing-has-aliases', aliasTitles: ['Late Alias of Target'] },
      });
      expect(reads).toBe(1);
      expect(containingSession.getState().working.things.map(({ id }) => id)).toEqual([
        ALIASED_SPACE_THING_ID,
        LATE_ALIAS_ID,
      ]);

      // The refused deletion must not have swallowed the late Alias's own
      // Edit: the containing Space still holds the Space Thing and the Alias,
      // and that Edit commits once the coordination's barrier lifts.
      const settled = await waitFor(
        containingSession,
        (state) => state.persistence.kind === 'settled' && state.acknowledgedRevision > 3n,
      );
      expect(settled.working.things.map(({ id }) => id)).toEqual([
        ALIASED_SPACE_THING_ID,
        LATE_ALIAS_ID,
      ]);
      const stored = await backend.loadSpace(SPACE_ID);
      expect(stored?.snapshot.things.map(({ id }) => id)).toEqual([
        ALIASED_SPACE_THING_ID,
        LATE_ALIAS_ID,
      ]);
      expect(await backend.loadSpace(ALIAS_TARGET_SPACE_ID)).toBeDefined();
    });

    it('keeps a target Space alive when another Space comes to reference it while the deletion was reading persistence', async () => {
      const REFERENCING_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000060');
      const TARGET_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000061');
      const TARGET_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000062');
      const TARGET_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000063');
      const CONTAINING_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000064');
      const CONTAINING_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000065');
      const OTHER_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000066');
      const OTHER_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000067');
      const OTHER_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000068');
      const LATE_REFERENCE_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000069');
      const OTHER_REFERENCE_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000070');

      const containing = {
        snapshot: {
          id: SPACE_ID,
          document: {
            version: 1 as const,
            title: 'Space',
            defaultDiagram: CONTAINING_DIAGRAM,
            diagrams: [
              {
                id: CONTAINING_DIAGRAM,
                title: 'Diagram 1',
                kind: 'positioned' as const,
                positions: {
                  [REFERENCING_THING_ID]: { x: 0, y: 0, open: false as const },
                  // Keeps Other reachable from Meta independently of the
                  // deletion below, so the scenario isolates what happens to
                  // Target rather than also depending on Other's own reachability.
                  [OTHER_REFERENCE_THING_ID]: { x: 240, y: 0, open: false as const },
                },
                graphs: [{ id: CONTAINING_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          things: [
            {
              id: REFERENCING_THING_ID,
              document: {
                title: 'Target',
                kind: 'space' as const,
                spaceId: TARGET_SPACE_ID,
                diagram: TARGET_DIAGRAM,
                graph: TARGET_GRAPH,
              },
            },
            {
              id: OTHER_REFERENCE_THING_ID,
              document: {
                title: 'Other',
                kind: 'space' as const,
                spaceId: OTHER_SPACE_ID,
                diagram: OTHER_DIAGRAM,
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
            defaultDiagram: TARGET_DIAGRAM,
            diagrams: [
              {
                id: TARGET_DIAGRAM,
                title: 'Diagram 1',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: TARGET_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          things: [],
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
            defaultDiagram: OTHER_DIAGRAM,
            diagrams: [
              {
                id: OTHER_DIAGRAM,
                title: 'Diagram 1',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: OTHER_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          things: [],
        },
        revision: 0n,
        exportedRevision: null,
      };
      const backend = new MemorySpaceBackend(SPACE_ID, [containing, target, other]);
      const registry = createSpaceSessionRegistry(backend);
      const containingSession = registry.open(containing);
      registry.open(target);

      // The deletion's coordination reads the aggregate exactly once, right
      // before it plans the cascade. An entirely ordinary Edit — Other
      // referencing Target — commits to the backend during that one read, the
      // way an unrelated author's Edit could land in the same window.
      const loadAggregate = backend.loadAggregate.bind(backend);
      const commit = backend.commit.bind(backend);
      let reads = 0;
      backend.loadAggregate = async () => {
        reads += 1;
        if (reads === 1) {
          const diagrams = other.snapshot.document.diagrams.map((diagram) => ({
            ...diagram,
            positions: {
              ...diagram.positions,
              [LATE_REFERENCE_THING_ID]: { x: 0, y: 0, open: false as const },
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
                  document: { ...other.snapshot.document, diagrams },
                  things: [
                    ...other.snapshot.things,
                    {
                      id: LATE_REFERENCE_THING_ID,
                      document: {
                        title: 'Late reference to Target',
                        kind: 'space' as const,
                        spaceId: TARGET_SPACE_ID,
                        diagram: TARGET_DIAGRAM,
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
        .spaceThings(() => THING_ID)
        .delete({ containingSpaceId: SPACE_ID, thingId: REFERENCING_THING_ID });

      await expect(deletion).resolves.toEqual({ kind: 'completed' });
      expect(reads).toBe(1);

      // The coordinated commit is asynchronous even once `delete` resolves
      // (ADR 0030): wait for the containing Space's own commit to land before
      // reading it back off the backend.
      await waitFor(
        containingSession,
        (state) => state.persistence.kind === 'settled' && state.acknowledgedRevision > 3n,
      );

      // Other's late reference must have kept Target alive through the
      // cascade, planned from the Spaces as they stood after that one read.
      expect(await backend.loadSpace(TARGET_SPACE_ID)).toBeDefined();
      const storedContaining = await backend.loadSpace(SPACE_ID);
      expect(storedContaining?.snapshot.things.map(({ id }) => id)).toEqual([
        OTHER_REFERENCE_THING_ID,
      ]);
      const storedOther = await backend.loadSpace(OTHER_SPACE_ID);
      expect(storedOther?.snapshot.things.map(({ id }) => id)).toEqual([LATE_REFERENCE_THING_ID]);
    });

    it('steps a created Space Thing off a point another Thing already occupies', async () => {
      const CONTAINING_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000040');
      const CONTAINING_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000041');
      const OCCUPYING_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000042');
      const NEW_TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000043');
      const NEW_TARGET_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000044');
      const NEW_TARGET_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000045');
      const NEW_TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000046');
      const NEW_SPACE_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000047');
      const OCCUPIED_ANCHOR = { x: 240, y: 80 };

      const containing = {
        snapshot: {
          id: SPACE_ID,
          document: {
            version: 1 as const,
            title: 'Space',
            defaultDiagram: CONTAINING_DIAGRAM,
            diagrams: [
              {
                id: CONTAINING_DIAGRAM,
                title: 'Diagram 1',
                kind: 'positioned' as const,
                positions: { [OCCUPYING_THING_ID]: { ...OCCUPIED_ANCHOR, open: false as const } },
                graphs: [{ id: CONTAINING_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          things: [
            {
              id: OCCUPYING_THING_ID,
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
        NEW_TARGET_THING_ID,
        NEW_TARGET_DIAGRAM_ID,
        NEW_TARGET_GRAPH_ID,
        NEW_SPACE_THING_ID,
      ];
      const remaining = [...ids];
      const newId = () => {
        const id = remaining.shift();
        if (id === undefined) throw new Error('test identity source exhausted');
        return id;
      };

      const result = await registry.spaceThings(newId).create({
        containingSpaceId: SPACE_ID,
        diagramId: CONTAINING_DIAGRAM,
        title: 'New Space Thing',
        position: OCCUPIED_ANCHOR,
      });

      expect(result).toEqual({ kind: 'completed', thingId: NEW_SPACE_THING_ID });
      const stored = await backend.loadSpace(SPACE_ID);
      expect(stored?.snapshot.document.diagrams?.[0]?.positions[NEW_SPACE_THING_ID]).toEqual({
        x: OCCUPIED_ANCHOR.x + 24,
        y: OCCUPIED_ANCHOR.y + 24,
        open: false,
      });
    });

    // Ticket 05 (`.scratch/snapshot-edits/issues/05-creation-decides-after-its-last-wait.md`):
    // create and link checked their containing Diagram once, before the
    // coordination's own aggregate read, and never again.
    it('refuses to create a Space Thing when its containing Diagram is deleted while the creation was reading persistence', async () => {
      const CONTAINING_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000080');
      const CONTAINING_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000081');
      const KEEP_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000082');
      const KEEP_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000083');
      const NEW_TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000084');
      const NEW_TARGET_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000085');
      const NEW_TARGET_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000086');
      const NEW_TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000087');
      const NEW_SPACE_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000088');

      const containing = {
        snapshot: {
          id: SPACE_ID,
          document: {
            version: 1 as const,
            title: 'Space',
            defaultDiagram: KEEP_DIAGRAM,
            diagrams: [
              {
                id: CONTAINING_DIAGRAM,
                title: 'Diagram 1',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: CONTAINING_GRAPH, title: 'Graph 1', edges: [] }],
              },
              {
                id: KEEP_DIAGRAM,
                title: 'Diagram 2',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: KEEP_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          things: [],
        },
        revision: 3n,
        exportedRevision: null,
      };
      const backend = new MemorySpaceBackend(SPACE_ID, [containing]);
      const registry = createSpaceSessionRegistry(backend);
      const containingSession = registry.open(containing);

      // The creation's coordination reads the aggregate exactly once, right
      // before it decides. The containing Diagram is deleted in the
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
              diagrams: (working.document.diagrams ?? []).filter(
                (diagram) => diagram.id !== CONTAINING_DIAGRAM,
              ),
            },
          });
        }
        return loadAggregate();
      };

      const ids = [
        NEW_TARGET_ID,
        NEW_TARGET_THING_ID,
        NEW_TARGET_DIAGRAM_ID,
        NEW_TARGET_GRAPH_ID,
        NEW_SPACE_THING_ID,
      ];
      const remaining = [...ids];
      const newId = () => {
        const id = remaining.shift();
        if (id === undefined) throw new Error('test identity source exhausted');
        return id;
      };

      const creation = registry.spaceThings(newId).create({
        containingSpaceId: SPACE_ID,
        diagramId: CONTAINING_DIAGRAM,
        title: 'New Space Thing',
        position: { x: 0, y: 0 },
      });

      await expect(creation).resolves.toEqual({
        kind: 'refused',
        refusal: { code: 'diagram-not-found', diagramId: CONTAINING_DIAGRAM },
      });
      expect(reads).toBe(1);
      expect(containingSession.getState().working.things).toEqual([]);

      // The refused creation must not have swallowed the Diagram-deletion
      // Edit: it commits once the coordination's barrier lifts.
      const settled = await waitFor(
        containingSession,
        (state) => state.persistence.kind === 'settled' && state.acknowledgedRevision > 3n,
      );
      expect(settled.working.document.diagrams?.map(({ id }) => id)).toEqual([KEEP_DIAGRAM]);
      const stored = await backend.loadSpace(SPACE_ID);
      expect(stored?.snapshot.document.diagrams?.map(({ id }) => id)).toEqual([KEEP_DIAGRAM]);
      expect(stored?.snapshot.things).toEqual([]);
    });

    it('refuses to link a Space Thing when its containing Diagram is deleted while the link was reading persistence', async () => {
      const CONTAINING_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000090');
      const CONTAINING_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000091');
      const KEEP_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000092');
      const KEEP_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000093');
      const LINK_TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000094');
      const LINK_TARGET_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000095');
      const LINK_TARGET_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000096');
      const LINKED_SPACE_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000097');

      const containing = {
        snapshot: {
          id: SPACE_ID,
          document: {
            version: 1 as const,
            title: 'Space',
            defaultDiagram: KEEP_DIAGRAM,
            diagrams: [
              {
                id: CONTAINING_DIAGRAM,
                title: 'Diagram 1',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: CONTAINING_GRAPH, title: 'Graph 1', edges: [] }],
              },
              {
                id: KEEP_DIAGRAM,
                title: 'Diagram 2',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: KEEP_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          things: [],
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
            defaultDiagram: LINK_TARGET_DIAGRAM,
            diagrams: [
              {
                id: LINK_TARGET_DIAGRAM,
                title: 'Diagram 1',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: LINK_TARGET_GRAPH, title: 'Graph 1', edges: [] }],
              },
            ],
          },
          things: [],
        },
        revision: 0n,
        exportedRevision: null,
      };
      const backend = new MemorySpaceBackend(SPACE_ID, [containing, target]);
      const registry = createSpaceSessionRegistry(backend);
      const containingSession = registry.open(containing);
      registry.open(target);

      // Same shape as the creation test above: the containing Diagram is
      // deleted during the coordination's one aggregate read, after `link`
      // has already confirmed the Diagram exists and read the target's
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
              diagrams: (working.document.diagrams ?? []).filter(
                (diagram) => diagram.id !== CONTAINING_DIAGRAM,
              ),
            },
          });
        }
        return loadAggregate();
      };

      const linking = registry
        .spaceThings(() => LINKED_SPACE_THING_ID)
        .link({
          containingSpaceId: SPACE_ID,
          diagramId: CONTAINING_DIAGRAM,
          targetSpaceId: LINK_TARGET_ID,
          title: 'Linked',
          position: { x: 0, y: 0 },
        });

      await expect(linking).resolves.toEqual({
        kind: 'refused',
        refusal: { code: 'diagram-not-found', diagramId: CONTAINING_DIAGRAM },
      });
      expect(reads).toBe(1);
      expect(containingSession.getState().working.things).toEqual([]);

      const settled = await waitFor(
        containingSession,
        (state) => state.persistence.kind === 'settled' && state.acknowledgedRevision > 3n,
      );
      expect(settled.working.document.diagrams?.map(({ id }) => id)).toEqual([KEEP_DIAGRAM]);
      const stored = await backend.loadSpace(SPACE_ID);
      expect(stored?.snapshot.document.diagrams?.map(({ id }) => id)).toEqual([KEEP_DIAGRAM]);
      expect(stored?.snapshot.things).toEqual([]);
    });
  });
});

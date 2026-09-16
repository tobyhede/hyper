import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { MemorySpaceBackend } from '../src/memory';
import { createSpaceSessionRegistry } from '../src/session-registry';

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
  });
});

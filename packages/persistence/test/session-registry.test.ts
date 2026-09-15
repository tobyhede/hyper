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
});

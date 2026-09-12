import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import {
  createSpaceSessionRegistry,
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
} from '@project/persistence';
import { composeApp } from '../src/compose-app';
import { canvasProjection } from '../src/canvas-projection';
import { resolveDiagram } from '../src/diagram-resolution';
import { mintingIds } from './minting';

/**
 * A Space whose working snapshot was replaced under it still names a Graph.
 *
 * Every other replacement of a Space's working snapshot re-opens that Space's
 * Navigation with it — `acceptStoredSpace` does, and every Edit that changes a
 * Diagram's Graph set answers the next Active Graph before it installs. The
 * coordinated Space Thing lifecycle is the one that did not: its recovery
 * restores *every participant's* snapshot (`session-registry.ts`), and only the
 * Space the author answered the conflict on had a `SpaceAuthoring` to re-open.
 *
 * So a second open Space could be rolled back past a Graph it had locally, and
 * go on naming that Graph as active — a state nothing corrected, because no
 * replacement epoch advanced and nothing else re-resolved the pair.
 *
 * The consequences were not cosmetic. The Dock resolves its Active Graph from
 * the projection and falls back to the first visible Graph, so it named and
 * commanded one Graph while `SpaceCanvas` and Navigation named another: Present
 * was enabled and did nothing, the two Copy links answered different URLs, and
 * the next Edit rode the stale id into the Diagram's `activeGraph` for intake
 * to reject.
 */

const id = (value: string): UUID => uuidSchema.parse(value);

const META_ID = id('00000000-0000-4000-8000-000000000001');
const META_THING_ID = id('00000000-0000-4000-8000-000000000002');
const META_DIAGRAM_ID = id('00000000-0000-4000-8000-000000000003');
const META_GRAPH_ID = id('00000000-0000-4000-8000-000000000004');
const TARGET_ID = id('00000000-0000-4000-8000-000000000010');
const TARGET_THING_ID = id('00000000-0000-4000-8000-000000000011');
const TARGET_DIAGRAM_ID = id('00000000-0000-4000-8000-000000000012');
const TARGET_GRAPH_ID = id('00000000-0000-4000-8000-000000000013');
const SPACE_THING_ID = id('00000000-0000-4000-8000-000000000014');
const TARGET_THING_TWO = id('00000000-0000-4000-8000-000000000015');
const ADDED_GRAPH_ID = id('00000000-0000-4000-8000-0000000000f1');

const targetSnapshot: SpaceSnapshot = {
  id: TARGET_ID,
  document: {
    version: 1,
    title: 'Architecture',
    defaultDiagram: TARGET_DIAGRAM_ID,
    diagrams: [
      {
        id: TARGET_DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: {
          [TARGET_THING_ID]: { x: 0, y: 0, open: false },
          [TARGET_THING_TWO]: { x: 300, y: 0, open: false },
        },
        graphs: [
          {
            id: TARGET_GRAPH_ID,
            title: 'Graph 1',
            edges: [{ from: TARGET_THING_ID, to: TARGET_THING_TWO }],
          },
        ],
        activeGraph: TARGET_GRAPH_ID,
      },
    ],
  },
  things: [
    { id: TARGET_THING_ID, document: { title: 'Architecture', kind: 'markdown', body: '' } },
    { id: TARGET_THING_TWO, document: { title: 'Second', kind: 'markdown', body: '' } },
  ],
};

const metaSnapshot: SpaceSnapshot = {
  id: META_ID,
  document: {
    version: 1,
    title: 'Meta',
    defaultDiagram: META_DIAGRAM_ID,
    diagrams: [
      {
        id: META_DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: {
          [META_THING_ID]: { x: 0, y: 0, open: false },
          [SPACE_THING_ID]: { x: 240, y: 80, open: false },
        },
        graphs: [{ id: META_GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: META_GRAPH_ID,
      },
    ],
  },
  things: [
    { id: META_THING_ID, document: { title: 'Meta', kind: 'markdown', body: '' } },
    {
      id: SPACE_THING_ID,
      document: {
        title: 'Target',
        kind: 'space',
        spaceId: TARGET_ID,
        diagram: TARGET_DIAGRAM_ID,
        graph: TARGET_GRAPH_ID,
      },
    },
  ],
};

/**
 * Two Spaces open on one registry, the Target holding a Graph only it has.
 *
 * The conflict is queued against the Target rather than the Meta Space, because
 * the participant nobody answered the conflict on is the one whose Navigation
 * had no owner to re-open it.
 */
const openRolledBackTarget = async (): Promise<ReturnType<typeof composeApp>> => {
  const control = new MemorySpaceBackendTestControl();
  const backend = new MemorySpaceBackend(
    META_ID,
    [
      { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
      { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
    ],
    control,
  );
  const registry = createSpaceSessionRegistry(backend);
  const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
  const targetSession = registry.open({
    snapshot: targetSnapshot,
    revision: 7n,
    exportedRevision: null,
  });

  const target = composeApp({ spaceSession: targetSession, newId: mintingIds(ADDED_GRAPH_ID) });
  expect(target.authoring.complete({ kind: 'added-graph' }).kind).toBe('completed');
  expect(target.navigation.getState().activeGraphId).toBe(ADDED_GRAPH_ID);
  await vi.waitFor(() => expect(targetSession.getState().persistence.kind).toBe('settled'));

  // The stored Target is the one that never had the added Graph, so the
  // recovery below restores the Space out from under its Navigation.
  control.queueResult({
    kind: 'conflict',
    conflicts: [
      {
        spaceId: TARGET_ID,
        current: { snapshot: targetSnapshot, revision: 9n, exportedRevision: null },
      },
    ],
  });
  await registry
    .spaceThings(mintingIds(ADDED_GRAPH_ID))
    .delete({ containingSpaceId: META_ID, thingId: SPACE_THING_ID });
  await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('conflicted'));

  // The author answers on the containing Space, through the operation
  // `PersistenceControl`'s "use the stored Space" spends.
  const metaApp = composeApp({ spaceSession: meta, newId: mintingIds(ADDED_GRAPH_ID) });
  expect(metaApp.authoring.acceptStoredSpace()).toBeNull();
  return target;
};

describe('the Active Graph after a coordinated recovery restores a participant', () => {
  it('names a Graph the restored Diagram owns', async () => {
    const target = await openRolledBackTarget();

    const space = target.currentSpace();
    const { activeGraphId, selectedDiagramId } = target.navigation.getState();
    const visible = canvasProjection(space, resolveDiagram(space, selectedDiagramId)).visibleGraphs;

    expect(visible.map((graph) => graph.id)).toContain(activeGraphId);
    // Re-resolved rather than merely valid: the Graph the restore removed is
    // gone, so the Diagram's own Active Graph is the only answer left.
    expect(activeGraphId).toBe(TARGET_GRAPH_ID);
  });

  it('leaves the Dock and the canvas naming one Graph', async () => {
    const target = await openRolledBackTarget();

    const space = target.currentSpace();
    const { activeGraphId, selectedDiagramId } = target.navigation.getState();
    const projection = canvasProjection(space, resolveDiagram(space, selectedDiagramId));

    // `App` hands `SpaceCanvas` the raw id and the Dock the Graph it finds, so
    // the two agree exactly when the find succeeds.
    expect(projection.visibleGraphs.find((graph) => graph.id === activeGraphId)).toBeDefined();
  });

  it('leaves Present and the next Edit working on the restored Space', async () => {
    const target = await openRolledBackTarget();

    // Graph 1 kept its Edge through the restore, so there is something to
    // traverse — and the Dock's Present is enabled on exactly that fact.
    target.navigation.present();
    expect(target.navigation.getState().mode).toBe('presenting');

    expect(
      target.authoring.complete({
        kind: 'renamed-graph',
        graphId: TARGET_GRAPH_ID,
        title: 'Renamed',
      }).kind,
    ).toBe('completed');
  });
});

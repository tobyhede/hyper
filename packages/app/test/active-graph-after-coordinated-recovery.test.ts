import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import {
  createSpaceSessionRegistry,
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
} from '@project/persistence';
import { composeApp } from '../src/compose-app';
import { canvasProjection } from '../src/canvas-projection';
import { resolveMap } from '../src/map-resolution';
import { mintingIds } from './minting';

/**
 * A Space whose working snapshot was replaced under it still names a Graph.
 *
 * Every replacement of a Space's working snapshot re-opens that Space's
 * Navigation with it — `acceptStoredSpace` does, and every Edit that changes a
 * Map's Graph set answers the next Active Graph before it installs. The
 * coordinated Space Resource lifecycle's recovery restores *every
 * participant's* snapshot (`session-registry.ts`), not only the Space the
 * author answered the conflict on, so every participant has to re-resolve.
 *
 * A second open Space rolled back past a Graph it had locally must not go on
 * naming that Graph as active: no replacement epoch advances, so nothing else
 * re-resolves the pair. The Dock resolves its Active Graph from the projection
 * and falls back to the first visible Graph, so a stale id would have it
 * command one Graph while `SpaceCanvas` and Navigation named another: Present
 * enabled and doing nothing, the two Copy links answering different URLs, and
 * the next Edit riding the stale id into the Map's `activeGraph` for intake to
 * reject.
 */

const id = (value: string): UUID => uuidSchema.parse(value);

/**
 * A minter for a collaborator this test expects to mint nothing.
 *
 * ADR 0016 has a test name the ids it is about to assert on, and three collaborators
 * here take a minter while only one of them mints. Sharing the Target's would
 * let an unexpected mint duplicate its Graph id into another Space and pass;
 * this fails at the call instead.
 */
const mintsNothing =
  (message: string): (() => UUID) =>
  () => {
    throw new Error(message);
  };

const META_ID = id('00000000-0000-4000-8000-000000000001');
const META_RESOURCE_ID = id('00000000-0000-4000-8000-000000000002');
const META_MAP_ID = id('00000000-0000-4000-8000-000000000003');
const META_GRAPH_ID = id('00000000-0000-4000-8000-000000000004');
const TARGET_ID = id('00000000-0000-4000-8000-000000000010');
const TARGET_RESOURCE_ID = id('00000000-0000-4000-8000-000000000011');
const TARGET_MAP_ID = id('00000000-0000-4000-8000-000000000012');
const TARGET_GRAPH_ID = id('00000000-0000-4000-8000-000000000013');
const SPACE_RESOURCE_ID = id('00000000-0000-4000-8000-000000000014');
const TARGET_RESOURCE_TWO = id('00000000-0000-4000-8000-000000000015');
const ADDED_GRAPH_ID = id('00000000-0000-4000-8000-0000000000f1');
const CREATED_MAP_ID = id('00000000-0000-4000-8000-0000000000f2');
const CREATED_MAP_GRAPH_ID = id('00000000-0000-4000-8000-0000000000f3');

const targetSnapshot: SpaceSnapshot = {
  id: TARGET_ID,
  document: {
    version: 1,
    title: 'Architecture',
    defaultMap: TARGET_MAP_ID,
    maps: [
      {
        id: TARGET_MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [TARGET_RESOURCE_ID]: { x: 0, y: 0, open: false },
          [TARGET_RESOURCE_TWO]: { x: 300, y: 0, open: false },
        },
        graphs: [
          {
            id: TARGET_GRAPH_ID,
            title: 'Graph 1',
            edges: [{ from: TARGET_RESOURCE_ID, to: TARGET_RESOURCE_TWO }],
          },
        ],
        activeGraph: TARGET_GRAPH_ID,
      },
    ],
  },
  resources: [
    { id: TARGET_RESOURCE_ID, document: { title: 'Architecture', kind: 'markdown', body: '' } },
    { id: TARGET_RESOURCE_TWO, document: { title: 'Second', kind: 'markdown', body: '' } },
  ],
};

const metaSnapshot: SpaceSnapshot = {
  id: META_ID,
  document: {
    version: 1,
    title: 'Meta',
    defaultMap: META_MAP_ID,
    maps: [
      {
        id: META_MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [META_RESOURCE_ID]: { x: 0, y: 0, open: false },
          [SPACE_RESOURCE_ID]: { x: 240, y: 80, open: false },
        },
        graphs: [{ id: META_GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: META_GRAPH_ID,
      },
    ],
  },
  resources: [
    { id: META_RESOURCE_ID, document: { title: 'Meta', kind: 'markdown', body: '' } },
    {
      id: SPACE_RESOURCE_ID,
      document: {
        title: 'Target',
        kind: 'space',
        spaceId: TARGET_ID,
        map: TARGET_MAP_ID,
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
    .spaceResources(mintsNothing('The coordinated deletion minted an identity.'))
    .delete({ containingSpaceId: META_ID, resourceId: SPACE_RESOURCE_ID });
  await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('conflicted'));

  // The author answers on the containing Space, through the operation
  // `PersistenceControl`'s "use the stored Space" spends.
  const metaApp = composeApp({
    spaceSession: meta,
    newId: mintsNothing('Accepting the stored Space minted an identity.'),
  });
  expect(metaApp.authoring.acceptStoredSpace()).toBeNull();
  return target;
};

/**
 * The same recovery, taking the *selected Map* rather than its Active Graph.
 *
 * Left unresolved, this is worse than the Graph half rather than milder: the
 * restored Space still loads, so nothing refuses it — `resolveMap` would throw
 * `MapNotFoundError` for a Space with nothing wrong with it, and the canvas
 * would be replaced by the failure surface.
 */
const openRolledBackOverCreatedMap = async (): Promise<ReturnType<typeof composeApp>> => {
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

  const target = composeApp({
    spaceSession: targetSession,
    newId: mintingIds(CREATED_MAP_ID, CREATED_MAP_GRAPH_ID),
  });
  expect(target.authoring.complete({ kind: 'created-map' }).kind).toBe('completed');
  expect(target.navigation.getState().selectedMapId).toBe(CREATED_MAP_ID);
  await vi.waitFor(() => expect(targetSession.getState().persistence.kind).toBe('settled'));

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
    .spaceResources(mintsNothing('The coordinated deletion minted an identity.'))
    .delete({ containingSpaceId: META_ID, resourceId: SPACE_RESOURCE_ID });
  await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('conflicted'));
  const metaApp = composeApp({
    spaceSession: meta,
    newId: mintsNothing('Accepting the stored Space minted an identity.'),
  });
  expect(metaApp.authoring.acceptStoredSpace()).toBeNull();
  return target;
};

describe('the selected Map after a coordinated recovery restores a participant', () => {
  it('names a Map the restored Space holds', async () => {
    const target = await openRolledBackOverCreatedMap();

    const space = target.currentSpace();
    const { selectedMapId } = target.navigation.getState();

    expect(space.maps.map((map) => map.id)).toContain(selectedMapId);
    expect(selectedMapId).toBe(TARGET_MAP_ID);
  });

  it('leaves the canvas resolvable rather than the failure surface', async () => {
    const target = await openRolledBackOverCreatedMap();

    const space = target.currentSpace();
    const { selectedMapId, activeGraphId } = target.navigation.getState();

    // What `App` does every render, and what threw for a Space that loads.
    expect(() => resolveMap(space, selectedMapId)).not.toThrow();
    expect(
      canvasProjection(space, resolveMap(space, selectedMapId)).visibleGraphs.map(
        (graph) => graph.id,
      ),
    ).toContain(activeGraphId);
  });

  it('derives the placement from the Map the repair selected', async () => {
    const target = await openRolledBackOverCreatedMap();

    // Authoring holds no placement of its own to reconcile: `mapPlacement`
    // reads `Placement.fromMap` of whatever Navigation currently selects,
    // so it names the restored target Map's own Resources once the repair has
    // moved Navigation off the dangling, rolled-back one.
    const placement = target.authoring.mapPlacement();

    expect([...placement.keys()].toSorted()).toEqual(
      [TARGET_RESOURCE_ID, TARGET_RESOURCE_TWO].toSorted(),
    );
  });
});

describe('the Active Graph after a coordinated recovery restores a participant', () => {
  it('names a Graph the restored Map owns', async () => {
    const target = await openRolledBackTarget();

    const space = target.currentSpace();
    const { activeGraphId, selectedMapId } = target.navigation.getState();
    const visible = canvasProjection(space, resolveMap(space, selectedMapId)).visibleGraphs;

    expect(visible.map((graph) => graph.id)).toContain(activeGraphId);
    // Re-resolved rather than merely valid: the Graph the restore removed is
    // gone, so the Map's own Active Graph is the only answer left.
    expect(activeGraphId).toBe(TARGET_GRAPH_ID);
  });

  it('leaves the Dock and the canvas naming one Graph', async () => {
    const target = await openRolledBackTarget();

    const space = target.currentSpace();
    const { activeGraphId, selectedMapId } = target.navigation.getState();
    const projection = canvasProjection(space, resolveMap(space, selectedMapId));

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

import { describe, expect, it } from 'vitest';
import { newUuid, uuidSchema, type SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { composeApp } from '../src/compose-app';
import { topLevelMapAuthoringCommands } from '../src/map-authoring-commands';
import { createOpenSpaces } from '../src/open-spaces';
import { recordingHistory } from './browser-history';
import { openTestSpace } from './opened-space';
import { node, settled } from './render-adapter-fixtures';

/**
 * Authored placement has one home, the session's snapshot. Every assertion
 * here reads the session's own written snapshot or the render adapter's own
 * drawn projection, never an intermediate copy of placement, so each test
 * states what is written and what is drawn.
 */

const id = (suffix: string) =>
  uuidSchema.parse(`00000000-0000-4000-8000-${suffix.padStart(12, '0')}`);

describe('Map delete draws the right geometry (ticket 02, item 1)', () => {
  const SPACE_ID = id('1');
  const DELETED_MAP_ID = id('2');
  const SURVIVING_MAP_ID = id('3');
  const DELETED_GRAPH_ID = id('4');
  const SURVIVING_GRAPH_ID = id('5');
  const SHARED_RESOURCE_ID = id('6');

  /**
   * One Resource placed in both Maps, at two different points: a Resource in
   * both the deleted Map and the newly selected one.
   */
  const snapshot: SpaceSnapshot = {
    id: SPACE_ID,
    document: {
      version: 1,
      title: 'Space',
      defaultMap: DELETED_MAP_ID,
      maps: [
        {
          id: DELETED_MAP_ID,
          title: 'Deleted',
          kind: 'positioned',
          positions: { [SHARED_RESOURCE_ID]: { x: 10, y: 20, open: false } },
          graphs: [{ id: DELETED_GRAPH_ID, title: 'Deleted Graph', edges: [] }],
        },
        {
          id: SURVIVING_MAP_ID,
          title: 'Surviving',
          kind: 'positioned',
          positions: { [SHARED_RESOURCE_ID]: { x: 500, y: 600, open: false } },
          graphs: [{ id: SURVIVING_GRAPH_ID, title: 'Surviving Graph', edges: [] }],
        },
      ],
    },
    resources: [
      { id: SHARED_RESOURCE_ID, document: { title: 'Shared', kind: 'markdown', body: '' } },
    ],
  };

  it('writes the surviving Map’s own position for a Resource both Maps place, not the deleted Map’s', async () => {
    const backend = MemorySpaceBackend.asMeta({ snapshot, revision: 0n, exportedRevision: null });
    const { spaceSession: session, spaceResources } = openTestSpace(backend, {
      snapshot,
      revision: 0n,
      exportedRevision: null,
    });
    const app = composeApp({ spaceSession: session });
    expect(app.navigation.getState().selectedMapId).toBe(DELETED_MAP_ID);

    // What the Dock's Delete does (`dock-chrome.ts`): Map authoring deletes the Map and
    // leaves the canvas on the survivor.
    const everything = () => true;
    const result = await topLevelMapAuthoringCommands(
      { app, spaceResources },
      { rename: everything, create: everything, delete: everything },
    )
      .map(DELETED_MAP_ID)
      .delete.invoke();
    if (result.kind !== 'completed')
      throw new Error(`Expected a completed delete, got ${result.kind}`);
    expect(result.mapId).toBe(SURVIVING_MAP_ID);
    expect(app.navigation.getState().selectedMapId).toBe(SURVIVING_MAP_ID);

    // An Edit that touches no position — renaming the surviving Map's own
    // Graph — still writes the whole placement into the Map
    // (`updatePositionedMap`). The correct source for that write is the
    // surviving Map's own authored position for the shared Resource.
    const renamed = app.authoring.complete({
      kind: 'renamed-graph',
      graphId: SURVIVING_GRAPH_ID,
      title: 'Renamed Graph',
    });
    expect(renamed.kind).toBe('completed');

    const written = session
      .getState()
      .working.document.maps?.find((map) => map.id === SURVIVING_MAP_ID);
    expect(written?.positions[SHARED_RESOURCE_ID]).toEqual({ x: 500, y: 600, open: false });
  });
});

describe('Entering draws the entered Map’s geometry (ticket 02, item 2)', () => {
  const META_ID = id('10');
  const OTHER_ID = id('11');
  const DEFAULT_MAP_ID = id('12');
  const ENTERED_MAP_ID = id('13');
  const DEFAULT_GRAPH_ID = id('14');
  const ENTERED_GRAPH_ID = id('15');
  const SHARED_RESOURCE_ID = id('16');
  const META_RESOURCE_ID = id('17');
  const META_MAP_ID = id('18');
  const META_GRAPH_ID = id('19');

  const metaSnapshot: SpaceSnapshot = {
    id: META_ID,
    document: {
      version: 1,
      title: 'Meta',
      defaultMap: META_MAP_ID,
      maps: [
        {
          id: META_MAP_ID,
          title: 'Meta Map',
          kind: 'positioned',
          positions: { [META_RESOURCE_ID]: { x: 0, y: 0, open: false } },
          graphs: [{ id: META_GRAPH_ID, title: 'Meta Graph', edges: [] }],
        },
      ],
    },
    resources: [
      { id: META_RESOURCE_ID, document: { title: 'Meta Resource', kind: 'markdown', body: '' } },
    ],
  };

  /**
   * The Space Enter opens: a Space-default Map, and a second one that
   * places the same Resource at a different point — the shape a Space Resource
   * entered at a non-default Map/Graph makes real (ADR 0079).
   */
  const otherSnapshot: SpaceSnapshot = {
    id: OTHER_ID,
    document: {
      version: 1,
      title: 'Other',
      defaultMap: DEFAULT_MAP_ID,
      maps: [
        {
          id: DEFAULT_MAP_ID,
          title: 'Default',
          kind: 'positioned',
          positions: { [SHARED_RESOURCE_ID]: { x: 10, y: 20, open: false } },
          graphs: [{ id: DEFAULT_GRAPH_ID, title: 'Default Graph', edges: [] }],
        },
        {
          id: ENTERED_MAP_ID,
          title: 'Entered',
          kind: 'positioned',
          positions: { [SHARED_RESOURCE_ID]: { x: 500, y: 600, open: false } },
          graphs: [{ id: ENTERED_GRAPH_ID, title: 'Entered Graph', edges: [] }],
        },
      ],
    },
    resources: [
      { id: SHARED_RESOURCE_ID, document: { title: 'Shared', kind: 'markdown', body: '' } },
    ],
  };

  it('writes the entered Map’s own position for a Resource both Maps place, not the Space default one', async () => {
    const backend = new MemorySpaceBackend(META_ID, [
      { snapshot: metaSnapshot, revision: 0n, exportedRevision: null },
      { snapshot: otherSnapshot, revision: 0n, exportedRevision: null },
    ]);
    const spaces = createOpenSpaces({
      backend,
      metaSpaceId: META_ID,
      metaSpaceTitle: metaSnapshot.document.title,
      newId: newUuid,
      history: recordingHistory(),
    });
    await spaces.open(META_ID);
    const entered = await spaces.enter(OTHER_ID, ENTERED_MAP_ID, ENTERED_GRAPH_ID);
    expect(entered.app.navigation.getState().selectedMapId).toBe(ENTERED_MAP_ID);

    // Again, an Edit that touches no position.
    const renamed = entered.app.authoring.complete({
      kind: 'renamed-graph',
      graphId: ENTERED_GRAPH_ID,
      title: 'Renamed Graph',
    });
    expect(renamed.kind).toBe('completed');

    const written = entered.session
      .getState()
      .working.document.maps?.find((map) => map.id === ENTERED_MAP_ID);
    expect(written?.positions[SHARED_RESOURCE_ID]).toEqual({ x: 500, y: 600, open: false });
  });
});

describe('An embedded Edit in an unselected Map leaves no stale member (ticket 02, item 3)', () => {
  const SPACE_ID = id('30');
  const TOP_MAP_ID = id('31');
  const OTHER_MAP_ID = id('32');
  const TOP_GRAPH_ID = id('33');
  const OTHER_GRAPH_ID = id('34');
  const OTHER_GRAPH_TO_DELETE_ID = id('35');
  const TOP_RESOURCE_ID = id('36');
  const OTHER_RESOURCE_ID = id('37');

  const snapshot: SpaceSnapshot = {
    id: SPACE_ID,
    document: {
      version: 1,
      title: 'Space',
      defaultMap: TOP_MAP_ID,
      maps: [
        {
          id: TOP_MAP_ID,
          title: 'Top',
          kind: 'positioned',
          positions: { [TOP_RESOURCE_ID]: { x: 10, y: 20, open: false } },
          graphs: [{ id: TOP_GRAPH_ID, title: 'Top Graph', edges: [] }],
        },
        {
          id: OTHER_MAP_ID,
          title: 'Other',
          kind: 'positioned',
          positions: { [OTHER_RESOURCE_ID]: { x: 500, y: 600, open: false } },
          graphs: [
            { id: OTHER_GRAPH_ID, title: 'Other Graph', edges: [] },
            { id: OTHER_GRAPH_TO_DELETE_ID, title: 'Doomed Graph', edges: [] },
          ],
        },
      ],
    },
    resources: [
      { id: TOP_RESOURCE_ID, document: { title: 'Top Resource', kind: 'markdown', body: '' } },
      { id: OTHER_RESOURCE_ID, document: { title: 'Other Resource', kind: 'markdown', body: '' } },
    ],
  };

  /**
   * An embedded Edit writes straight into the session's snapshot, exactly as a
   * top-level one does, and every later read derives its placement fresh from
   * that same snapshot, so there is no second store to go stale.
   *
   * What is pinned: an embedded Edit on a Map other than the one selected has
   * to produce a snapshot intake accepts, and a later top-level Edit has to see
   * it. It is exercised with `deleted-graph`, the closest reachable kind that
   * changes an unselected Map's own content — `SpaceAuthoring.completeInMap`'s
   * parameter type (`EmbeddedResourceCompletion | EmbeddedContextCompletion`)
   * excludes `deleted-resource` — called directly through `completeInMap`
   * exactly as `space-authoring-operations.test.ts` does to reach this same
   * primitive outside its production callers.
   */
  it('produces a snapshot intake accepts after a later top-level Edit', () => {
    const backend = MemorySpaceBackend.asMeta({ snapshot, revision: 0n, exportedRevision: null });
    const session = openSpaceSession(backend, { snapshot, revision: 0n, exportedRevision: null });
    const app = composeApp({ spaceSession: session });
    expect(app.navigation.getState().selectedMapId).toBe(TOP_MAP_ID);

    // An embedded Edit against a Map other than the one selected at the
    // top level.
    const embedded = app.authoring.completeInMap(OTHER_MAP_ID, {
      kind: 'deleted-graph',
      graphId: OTHER_GRAPH_TO_DELETE_ID,
    });
    expect(embedded.kind).toBe('completed');

    // The next top-level Edit, against the (still selected) other Map.
    const renamed = app.authoring.complete({
      kind: 'renamed-map',
      mapId: TOP_MAP_ID,
      title: 'Renamed Top',
    });
    expect(renamed.kind).toBe('completed');

    const written = session.getState().working;
    const loaded = loadSpaceSnapshot(written);
    expect(loaded.ok).toBe(true);

    const top = written.document.maps?.find((map) => map.id === TOP_MAP_ID);
    expect(top?.positions[TOP_RESOURCE_ID]).toEqual({ x: 10, y: 20, open: false });
    const other = written.document.maps?.find((map) => map.id === OTHER_MAP_ID);
    expect(other?.graphs.map((graph) => graph.id)).toEqual([OTHER_GRAPH_ID]);
  });
});

describe('A queued drag holds its drop point (ticket 02, item 4 — guards the change)', () => {
  const SPACE_ID = id('40');
  const MAP_ID = id('41');
  const GRAPH_ID = id('42');
  const RESOURCE_A = id('43');
  const RESOURCE_B = id('44');

  const snapshot: SpaceSnapshot = {
    id: SPACE_ID,
    document: {
      version: 1,
      title: 'Space',
      defaultMap: MAP_ID,
      maps: [
        {
          id: MAP_ID,
          title: 'Map',
          kind: 'positioned',
          positions: {
            [RESOURCE_A]: { x: 10, y: 20, open: false },
            [RESOURCE_B]: { x: 300, y: 20, open: false },
          },
          graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
        },
      ],
    },
    resources: [
      { id: RESOURCE_A, document: { title: 'A', kind: 'markdown', body: '' } },
      { id: RESOURCE_B, document: { title: 'B', kind: 'markdown', body: '' } },
    ],
  };

  /**
   * A `settled-resource-movement` that queues behind an in-flight commit must
   * stay drawn at its drop point until it is derived and lands there.
   *
   * The nested `changeNodes` call below simulates a drag settling from inside
   * an `EditCompleted` notification of an unrelated, already-in-flight Edit —
   * which is exactly what makes Space Authoring's `completing` gate answer
   * `queued` rather than deriving it immediately (`session-registry`/
   * `space-authoring.ts` reentrancy rules, `docs/agents/editing-and-persistence.md`
   * "Session notification is non-throwing…").
   */
  it('keeps a moved Resource drawn at its drop point while its completion waits behind an in-flight one', () => {
    const backend = MemorySpaceBackend.asMeta({ snapshot, revision: 0n, exportedRevision: null });
    const session = openSpaceSession(backend, { snapshot, revision: 0n, exportedRevision: null });
    const { authoring, adapter } = composeApp({ spaceSession: session, selection: MAP_ID });

    adapter.getState().syncProjection([node(RESOURCE_A, 10, 20), node(RESOURCE_B, 300, 20)], []);

    let sawDuringQueue: { readonly x: number; readonly y: number } | undefined;
    let notifications = 0;
    const unsubscribe = session.subscribe(() => {
      notifications += 1;
      // Only the first notification is the outer Edit's own submit; a later
      // one is the queued drag's own derivation draining, and re-entering
      // there would settle the same drag a second time.
      if (notifications !== 1) return;
      adapter.getState().changeNodes(settled(RESOURCE_B, 777, 888));
      sawDuringQueue = adapter
        .getState()
        .projection?.nodes.find((resource) => resource.id === RESOURCE_B)?.position;
    });
    try {
      const result = authoring.complete({
        kind: 'renamed-map',
        mapId: MAP_ID,
        title: 'Renamed',
      });
      expect(result.kind).toBe('completed');
    } finally {
      unsubscribe();
    }

    expect(sawDuringQueue).toEqual({ x: 777, y: 888 });
    // And it is still the drop point once the queued completion has drained.
    expect(
      adapter.getState().projection?.nodes.find((resource) => resource.id === RESOURCE_B)?.position,
    ).toEqual({ x: 777, y: 888 });
  });
});

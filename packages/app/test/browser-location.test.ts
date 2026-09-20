import { describe, expect, it } from 'vitest';
import {
  uuidSchema,
  type ResourceId,
  type GraphId,
  type MapId,
  type SpaceSnapshot,
} from '@project/core';
import { productDestinationPath } from '@project/http';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { createBrowserLocation } from '../src/browser-location';
import { composeApp } from '../src/compose-app';
import { recordingHistory } from './browser-history';

/**
 * The rules that decide a browser history entry, proved without a DOM.
 *
 * Every one of these was reachable only through a full jsdom mount and a spy on
 * `window.history.pushState` before `browser-location.ts` existed — the shape
 * ADR 0081 removed one level in, arriving again as "a rule with no owner,
 * proved by the only instrument that can reach where it happens to live". What
 * makes them reachable here is that the browser is a five-member interface and
 * the recording adapter is a real implementation of it.
 *
 * What is deliberately *not* here is anything about a real browser honouring
 * these writes. `packages/app/e2e/space-routing.spec.ts` proves that, which a
 * fake cannot.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const RESOURCE_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const SECOND_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const OTHER_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
/** Named by no Map in the Space: the dead address a Back can land on. */
const MISSING_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    maps: [
      {
        id: MAP_ID,
        title: 'Map',
        kind: 'positioned',
        positions: {
          [RESOURCE_A]: { x: 10, y: 20, open: false },
          [RESOURCE_B]: { x: 300, y: 20, open: false },
        },
        graphs: [
          { id: GRAPH_ID, title: 'Graph', edges: [{ from: RESOURCE_A, to: RESOURCE_B }] },
          { id: SECOND_GRAPH_ID, title: 'Second Graph', edges: [] },
        ],
      },
      {
        id: OTHER_MAP_ID,
        title: 'Other Map',
        kind: 'positioned',
        positions: { [RESOURCE_A]: { x: 0, y: 0, open: false } },
        graphs: [{ id: OTHER_GRAPH_ID, title: 'Other Graph', edges: [] }],
      },
    ],
    defaultMap: MAP_ID,
  },
  resources: [
    { id: RESOURCE_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: RESOURCE_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
  ],
};

/** One Resource whose Graph leaves it by an Edge back to itself. */
const selfEdge: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    maps: [
      {
        id: MAP_ID,
        title: 'Map',
        kind: 'positioned',
        positions: { [RESOURCE_A]: { x: 10, y: 20, open: false } },
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [{ from: RESOURCE_A, to: RESOURCE_A }] }],
      },
    ],
    defaultMap: MAP_ID,
  },
  resources: [{ id: RESOURCE_A, document: { title: 'A', kind: 'markdown', body: 'A' } }],
};

const compose = (opened: SpaceSnapshot = snapshot) => {
  const loaded = { snapshot: opened, revision: 0n, exportedRevision: null };
  return composeApp({ spaceSession: openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded) });
};

const mapPath = (mapId: MapId): string =>
  productDestinationPath({ kind: 'map', spaceId: SPACE_ID, mapId });

const mapGraphPath = (mapId: MapId, graphId: GraphId): string =>
  productDestinationPath({ kind: 'map-graph', spaceId: SPACE_ID, mapId, graphId });

const presentationPath = productDestinationPath({
  kind: 'presentation',
  spaceId: SPACE_ID,
  mapId: MAP_ID,
  graphId: GRAPH_ID,
  resourceId: RESOURCE_A,
});

const resourcePath = (mapId: MapId, resourceId: ResourceId): string =>
  productDestinationPath({ kind: 'map-resource', spaceId: SPACE_ID, mapId, resourceId });

const deadPath = mapPath(MISSING_MAP_ID);

describe('the browser location', () => {
  /**
   * Startup reads the location once and composes from it, so the position the
   * application is at is already the one the location names — and where it is
   * not, the reader put it there. Correcting it here would silently undo a Back
   * taken before this module was listening.
   */
  it('writes nothing when it begins following, whatever the location says', () => {
    const app = compose();
    const history = recordingHistory(mapPath(OTHER_MAP_ID));
    const location = createBrowserLocation(history);

    location.follow(app);

    expect(history.writes).toEqual([]);
    expect(history.pathname()).toBe(mapPath(OTHER_MAP_ID));
    location.dispose();
  });

  /**
   * StrictMode invokes a mounting effect twice, and the redundant publication
   * that used to reach the sync effect reaches this module as an ordinary second
   * notification. Both are the same rule: a position already decided about is
   * decided about no further, which is what `syncedPosition` is for and why it
   * is private.
   */
  it('writes nothing when the same position is decided a second time', () => {
    const app = compose();
    const history = recordingHistory(mapPath(OTHER_MAP_ID));
    const location = createBrowserLocation(history);

    location.follow(app);
    location.follow(app);
    // Navigation republishing the selection it already holds: the notification
    // arrives, the position has not moved, and nothing is written.
    app.navigation.selectMap(MAP_ID);

    expect(history.writes).toEqual([]);
    location.dispose();
  });

  /**
   * The arrival is the reader's, and only the arrival. Rewriting the location
   * here would take the entry they navigated to.
   */
  it('reports a Back onto a dead address rather than correcting it', () => {
    const app = compose();
    const history = recordingHistory(mapPath(MAP_ID));
    const location = createBrowserLocation(history);
    location.follow(app);

    history.popTo(deadPath);

    expect(location.getState().destinationNotFound).toBe(true);
    expect(history.writes).toEqual([]);
    expect(history.pathname()).toBe(deadPath);
    location.dispose();
  });

  /**
   * Restoring through Open Spaces refuses two different resources with the same
   * rejection, and only one of them is a destination that failed to resolve.
   *
   * A pathname outside product addressing is refused because it is not an
   * address of ours at all — the same answer the followed Space's own
   * restoration gives it, which is `ignored` and is left alone. Reporting it
   * puts a not-found in front of a reader standing on a location this
   * application never wrote and names no position to be wrong about.
   */
  it('leaves a Back onto a location outside product addressing alone', async () => {
    const app = compose();
    const history = recordingHistory(mapPath(MAP_ID));
    const refusal = Promise.reject(new Error('The URL is outside product addressing.'));
    const settled = refusal.catch(() => undefined);
    const location = createBrowserLocation(history, undefined, () => refusal);
    location.follow(app);

    history.popTo('/not-a-product-url');
    await settled;

    expect(location.getState().destinationNotFound).toBe(false);
    expect(history.writes).toEqual([]);
    location.dispose();
  });

  /** The half that must survive the one above: a dead product address reports. */
  it('reports a Back onto a dead address the Space could not be opened for', async () => {
    const app = compose();
    const history = recordingHistory(mapPath(MAP_ID));
    const refusal = Promise.reject(new Error('The product URL does not resolve.'));
    const settled = refusal.catch(() => undefined);
    const location = createBrowserLocation(history, undefined, () => refusal);
    location.follow(app);

    history.popTo(deadPath);
    await settled;

    expect(location.getState().destinationNotFound).toBe(true);
    expect(history.writes).toEqual([]);
    location.dispose();
  });

  /**
   * A cleared report and a corrected location are one repair, not two.
   *
   * The choice is the Map already selected, so the position does not move
   * and no entry is earned — while the location the reader is still on is the
   * one that could not be resolved, which reloads into a host 404. Reporting it
   * as answered and leaving it in the address bar is the half-fix.
   */
  it('corrects an unresolved location when a repeated Map choice answers the report', () => {
    const app = compose();
    const history = recordingHistory(mapPath(MAP_ID));
    const location = createBrowserLocation(history);
    location.follow(app);
    history.popTo(deadPath);

    location.chooseMap(MAP_ID);

    expect(location.getState().destinationNotFound).toBe(false);
    expect(history.writes).toEqual([{ method: 'replace', path: mapPath(MAP_ID) }]);
    location.dispose();
  });

  /**
   * Presenting from an unresolved location is a move, and a move is answered.
   *
   * Leaving the dead path in the address bar strands the whole presentation
   * behind a URL that 404s on reload and is what Copy link copies. The guard
   * preserves the arrival, so it may only hold while the position has not moved.
   */
  it('clears the report and takes one entry when presenting moves off an unresolved location', () => {
    const app = compose();
    const history = recordingHistory(mapPath(MAP_ID));
    const location = createBrowserLocation(history);
    location.follow(app);
    history.popTo(deadPath);

    app.navigation.present();

    expect(location.getState().destinationNotFound).toBe(false);
    expect(history.writes).toEqual([{ method: 'push', path: presentationPath }]);
    location.dispose();
  });

  /**
   * Entering the presentation moves the address and earns its entry; advancing
   * across a self-Edge and retreating back out of it both grow and shrink the
   * Traversal history without moving the address, so neither takes another one.
   * Both used to push a duplicate entry (ADR 0081).
   */
  it('takes one entry for a presentation a self-Edge never moves', () => {
    const app = compose(selfEdge);
    const history = recordingHistory(mapPath(MAP_ID));
    const location = createBrowserLocation(history);
    location.follow(app);

    app.navigation.present();
    app.navigation.advance();
    app.navigation.retreat();

    expect(history.writes).toEqual([{ method: 'push', path: presentationPath }]);
    location.dispose();
  });

  /**
   * Activating a Graph makes the same deliberate move a Map choice does — it
   * clears the addressed Resource and answers the report — and differs in exactly
   * one operation, which is the reason it may not simply call the same operation:
   * it does not change the Map, so the published projection stays.
   */
  it('answers the report from an activated Graph without disturbing the render adapter', () => {
    const app = compose();
    const history = recordingHistory(
      productDestinationPath({
        kind: 'map-resource',
        spaceId: SPACE_ID,
        mapId: MAP_ID,
        resourceId: RESOURCE_A,
      }),
    );
    const location = createBrowserLocation(history);
    location.follow(app);
    app.adapter.getState().syncProjection([], []);
    expect(location.getState().addressedResourceId).toBe(RESOURCE_A);
    history.popTo(deadPath);
    expect(location.getState().destinationNotFound).toBe(true);

    location.activateGraph(SECOND_GRAPH_ID);

    expect(location.getState()).toEqual({ addressedResourceId: null, destinationNotFound: false });
    expect(history.writes).toEqual([
      { method: 'push', path: mapGraphPath(MAP_ID, SECOND_GRAPH_ID) },
    ]);
    expect(app.adapter.getState().projection).not.toBeNull();
    location.dispose();
  });

  /** The contrast the test above rests on: a Map choice *does* clear it. */
  it('clears the published projection when a choice changes the Map', () => {
    const app = compose();
    const location = createBrowserLocation(recordingHistory(mapPath(MAP_ID)));
    location.follow(app);
    app.adapter.getState().syncProjection([], []);

    location.chooseMap(OTHER_MAP_ID);

    expect(app.adapter.getState().projection).toBeNull();
    expect(app.navigation.getState().selectedMapId).toBe(OTHER_MAP_ID);
    location.dispose();
  });

  it('resolves a destination against the current location for the clipboard', () => {
    const app = compose();
    const history = recordingHistory(mapPath(MAP_ID));
    const location = createBrowserLocation(history);
    location.follow(app);

    expect(location.href({ kind: 'map', spaceId: SPACE_ID, mapId: OTHER_MAP_ID })).toBe(
      new URL(mapPath(OTHER_MAP_ID), history.href()).href,
    );
    location.dispose();
  });

  /**
   * The Back that lands somewhere real, which every other Back here does not.
   *
   * It is the one path that both moves Navigation and names a Resource, so it is
   * where the order of the two matters: the Resource is known the moment the
   * restoration resolves, and moving Navigation before recording it would
   * notify against a position still carrying the Resource the reader is leaving.
   * The sync that notification triggers would then see an address that moved
   * and take an entry over the one the browser has just navigated to — which is
   * the entry ADR 0081's `none` outcome exists to refuse.
   */
  it('restores a Back onto a resolvable Resource location without earning an entry', () => {
    const app = compose();
    const history = recordingHistory(mapPath(MAP_ID));
    const location = createBrowserLocation(history);
    location.follow(app);
    location.chooseMap(OTHER_MAP_ID);
    expect(history.writes).toEqual([{ method: 'push', path: mapPath(OTHER_MAP_ID) }]);

    history.popTo(resourcePath(MAP_ID, RESOURCE_B));

    expect(app.navigation.getState().selectedMapId).toBe(MAP_ID);
    expect(location.getState().addressedResourceId).toBe(RESOURCE_B);
    expect(location.getState().destinationNotFound).toBe(false);
    expect(history.writes).toEqual([{ method: 'push', path: mapPath(OTHER_MAP_ID) }]);
    location.dispose();
  });

  /**
   * One history stack, so one followed composition — the reason this module is
   * the session's and not each Space's.
   *
   * Following a second one re-points every later operation at it, and leaves
   * the first where it was. Without that, two open Spaces would each hold the
   * position they last synced to and disagree about the one address bar.
   */
  it('sends a later operation to the composition it followed last', () => {
    const first = compose();
    const second = compose();
    const history = recordingHistory(mapPath(MAP_ID));
    const location = createBrowserLocation(history);

    location.follow(first);
    location.follow(second);
    location.chooseMap(OTHER_MAP_ID);

    expect(second.navigation.getState().selectedMapId).toBe(OTHER_MAP_ID);
    expect(first.navigation.getState().selectedMapId).toBe(MAP_ID);
    expect(history.writes).toEqual([{ method: 'push', path: mapPath(OTHER_MAP_ID) }]);
    location.dispose();
  });

  it('releases the Back listener it registered when disposed', () => {
    const history = recordingHistory(mapPath(MAP_ID));
    const location = createBrowserLocation(history);
    location.follow(compose());
    expect(history.listenerCount()).toBe(1);

    location.dispose();

    expect(history.listenerCount()).toBe(0);
  });

  /**
   * The location follows exactly one Space, and the Resource it addresses is a fact
   * about that pair rather than about a mounted component's lifetime.
   */
  it('reads the addressed Resource off the location of the Space it follows', () => {
    const app = compose();
    const location = createBrowserLocation(
      recordingHistory(
        productDestinationPath({
          kind: 'map-resource',
          spaceId: SPACE_ID,
          mapId: MAP_ID,
          resourceId: RESOURCE_B,
        }),
      ),
    );

    location.follow(app);

    expect(location.getState().addressedResourceId).toBe(RESOURCE_B);
    location.dispose();
  });
});

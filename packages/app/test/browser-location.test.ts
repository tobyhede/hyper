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
import { createBrowserHistory } from '../src/browser-history';
import { createBrowserLocation, NavigationUnavailableError } from '../src/browser-location';
import { composeApp } from '../src/compose-app';
import { pinSource } from '../src/mount/mount-source';
import { carriedAddress, sourceParameter } from '../src/source-parameter';
import { recordingHistory, standInBrowser } from './browser-history';
import type { ImageSources } from '../src/image-creation';
import { heldImageSources, unusedImageSources } from './image-sources';

/**
 * The rules that decide a browser history entry, proved without a DOM.
 *
 * What makes them reachable without a DOM is that the browser is a five-member
 * interface and the recording adapter is a real implementation of it.
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
    { id: RESOURCE_A, document: { title: 'A', kind: 'markdown', content: { source: 'A' } } },
    { id: RESOURCE_B, document: { title: 'B', kind: 'markdown', content: { source: 'B' } } },
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
  resources: [
    { id: RESOURCE_A, document: { title: 'A', kind: 'markdown', content: { source: 'A' } } },
  ],
};

const compose = (opened: SpaceSnapshot = snapshot, images: ImageSources = unusedImageSources) => {
  const loaded = { snapshot: opened, revision: 0n, exportedRevision: null };
  return composeApp({
    images,
    spaceSession: openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded),
  });
};

/** The hold for a location whose open set is replacing no image. */
const nothingHeld = (): boolean => false;

/** An Image Resource no Map places, so a replacement has something to replace. */
const IMAGE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');

/**
 * The Space composed with a replacement of its Image Resource held while it
 * measures, and the release that lets it finish.
 */
const composeReplacing = () => {
  const held = heldImageSources();
  const app = compose(
    {
      ...snapshot,
      resources: [
        ...snapshot.resources,
        {
          id: IMAGE_ID,
          document: {
            title: 'Figure',
            kind: 'image',
            content: { url: 'https://example.com/figure.png' },
          },
        },
      ],
    },
    held.images,
  );
  const replace = () =>
    app.imageReplacement.replace(IMAGE_ID, {
      kind: 'url',
      url: 'https://example.com/replacement.png',
    });
  return { app, replace, release: held.release };
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

it('holds Maps, Graphs and browser traversal during replacement, then permits navigation', async () => {
  const { app, replace, release } = composeReplacing();
  const history = recordingHistory(mapPath(MAP_ID));
  const location = createBrowserLocation(history, {
    isNavigationHeld: () => app.imageReplacement.getState(),
  });
  location.follow(app);
  const pending = replace();
  location.activateGraph(SECOND_GRAPH_ID);
  location.chooseMap(OTHER_MAP_ID);
  history.popTo(mapPath(OTHER_MAP_ID));
  expect(app.navigation.getState().selectedMapId).toBe(MAP_ID);
  expect(history.pathname()).toBe(mapPath(MAP_ID));
  expect(history.writes).toEqual([]);
  release();
  await pending;
  history.popTo(mapPath(OTHER_MAP_ID));
  expect(app.navigation.getState().selectedMapId).toBe(OTHER_MAP_ID);
  history.popTo(mapPath(MAP_ID));
  expect(app.navigation.getState().selectedMapId).toBe(MAP_ID);
  location.dispose();
});

it('holds Back, Forward and deliberate navigation when another composed Space replaces an image', async () => {
  const app = compose();
  const other = composeReplacing();
  const history = recordingHistory(mapPath(MAP_ID));
  const location = createBrowserLocation(history, {
    isNavigationHeld: () => other.app.imageReplacement.getState(),
  });
  location.follow(app);
  const pending = other.replace();
  location.activateGraph(SECOND_GRAPH_ID);
  location.chooseMap(OTHER_MAP_ID);
  history.popTo(mapPath(OTHER_MAP_ID));
  expect(history.pathname()).toBe(mapPath(MAP_ID));
  expect(app.navigation.getState().selectedMapId).toBe(MAP_ID);
  expect(app.navigation.getState().activeGraphId).toBe(GRAPH_ID);
  other.release();
  await pending;
  history.popTo(mapPath(OTHER_MAP_ID));
  expect(app.navigation.getState().selectedMapId).toBe(OTHER_MAP_ID);
  const second = other.replace();
  history.popTo(mapPath(MAP_ID));
  expect(history.pathname()).toBe(mapPath(OTHER_MAP_ID));
  other.release();
  await second;
  location.dispose();
});

it('holds a Back refused by a replacement while a later held Back is still returning', async () => {
  const { app, replace, release } = composeReplacing();
  const stand = standInBrowser({ path: mapPath(MAP_ID) });
  const history = createBrowserHistory(stand.browser);
  history.push(mapGraphPath(MAP_ID, SECOND_GRAPH_ID));
  history.push(mapPath(OTHER_MAP_ID));
  app.navigation.selectMap(OTHER_MAP_ID);
  const opened: string[] = [];
  const openings: PromiseWithResolvers<undefined>[] = [];
  const location = createBrowserLocation(history, {
    openPath: (pathname) => {
      const opening = Promise.withResolvers<undefined>();
      opened.push(pathname);
      openings.push(opening);
      return opening.promise;
    },
    isNavigationHeld: () => app.imageReplacement.getState(),
  });
  location.follow(app);
  stand.back();
  stand.settle();
  const replacement = replace();
  // The second Back is held at once, and its rewind has not arrived when the
  // first Back's destination refuses to open.
  stand.back();
  stand.step();
  expect(history.pathname()).toBe(mapPath(MAP_ID));
  openings[0]?.reject(new NavigationUnavailableError());
  // Let the refusal reach the adapter before the browser applies the rewind.
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(history.pathname()).toBe(mapPath(MAP_ID));
  stand.settle();
  expect(history.pathname()).toBe(mapPath(OTHER_MAP_ID));
  expect(opened).toEqual([mapGraphPath(MAP_ID, SECOND_GRAPH_ID)]);
  expect(app.navigation.getState().selectedMapId).toBe(OTHER_MAP_ID);
  release();
  await replacement;
  expect(history.pathname()).toBe(mapPath(OTHER_MAP_ID));
  location.dispose();
});

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
    const location = createBrowserLocation(history, { isNavigationHeld: nothingHeld });

    location.follow(app);

    expect(history.writes).toEqual([]);
    expect(history.pathname()).toBe(mapPath(OTHER_MAP_ID));
    location.dispose();
  });

  /**
   * StrictMode invokes a mounting effect twice, and the redundant publication
   * reaches this module as an ordinary second notification. Both are the same rule: a position already decided about is
   * decided about no further, which is what `syncedPosition` is for and why it
   * is private.
   */
  it('writes nothing when the same position is decided a second time', () => {
    const app = compose();
    const history = recordingHistory(mapPath(OTHER_MAP_ID));
    const location = createBrowserLocation(history, { isNavigationHeld: nothingHeld });

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
    const location = createBrowserLocation(history, { isNavigationHeld: nothingHeld });
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
    const location = createBrowserLocation(history, {
      openPath: () => refusal,
      isNavigationHeld: nothingHeld,
    });
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
    const location = createBrowserLocation(history, {
      openPath: () => refusal,
      isNavigationHeld: nothingHeld,
    });
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
    const location = createBrowserLocation(history, { isNavigationHeld: nothingHeld });
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
    const location = createBrowserLocation(history, { isNavigationHeld: nothingHeld });
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
   */
  it('takes one entry for a presentation a self-Edge never moves', () => {
    const app = compose(selfEdge);
    const history = recordingHistory(mapPath(MAP_ID));
    const location = createBrowserLocation(history, { isNavigationHeld: nothingHeld });
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
    const location = createBrowserLocation(history, { isNavigationHeld: nothingHeld });
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
    const location = createBrowserLocation(recordingHistory(mapPath(MAP_ID)), {
      isNavigationHeld: nothingHeld,
    });
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
    const location = createBrowserLocation(history, { isNavigationHeld: nothingHeld });
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
    const location = createBrowserLocation(history, { isNavigationHeld: nothingHeld });
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
    const location = createBrowserLocation(history, { isNavigationHeld: nothingHeld });

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
    const location = createBrowserLocation(history, { isNavigationHeld: nothingHeld });
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
      { isNavigationHeld: nothingHeld },
    );

    location.follow(app);

    expect(location.getState().addressedResourceId).toBe(RESOURCE_B);
    location.dispose();
  });
});

const COMMIT = 'a'.repeat(40);
const LATER_COMMIT = 'b'.repeat(40);
/** A complete resolved GitHub location, as a successful mount writes it. */
const SOURCE = `github:tobyhede/talk@${COMMIT}/slides`;
const OTHER_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const ENTERED_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const ENTERED_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000012');

/** A product path with the mounted source carried after it. */
const sourced = (path: string, source = SOURCE): string => `${path}?source=${source}`;

/** A Mounting session's options: its addresses carry the `source`. */
const mountedOptions = { isNavigationHeld: nothingHeld, carriesSource: true };

/**
 * A mounted page names its GitHub location in the `source` query parameter
 * (ADR 0130). Product URLs are otherwise unchanged, so every write the location
 * makes carries the parameter and no destination resolver ever reads it.
 */
describe('the mounted source in the address', () => {
  it('reads a literal + in the source as itself, as a hand-typed ref spells it', () => {
    expect(sourceParameter('https://hyper.test/?source=github:o/r@v1.0+build')).toBe(
      'github:o/r@v1.0+build',
    );
    expect(
      sourceParameter(
        `https://hyper.test/${carriedAddress('', 'https://hyper.test/', { set: 'github:o/r@v1.0+build' })}`,
      ),
    ).toBe('github:o/r@v1.0+build');
  });

  it('carries a hand-typed source as it was written', () => {
    const app = compose();
    const typed = 'github:o/r@v1.0+build';
    const history = recordingHistory(`${mapPath(MAP_ID)}?source=${typed}`);
    const location = createBrowserLocation(history, mountedOptions);
    location.follow(app);

    location.chooseMap(OTHER_MAP_ID);

    expect(history.writes).toEqual([
      { method: 'push', path: `${mapPath(OTHER_MAP_ID)}?source=${typed}` },
    ]);
    location.dispose();
  });

  it('survives a Map move', () => {
    const app = compose();
    const history = recordingHistory(sourced(mapPath(MAP_ID)));
    const location = createBrowserLocation(history, mountedOptions);
    location.follow(app);

    location.chooseMap(OTHER_MAP_ID);

    expect(history.writes).toEqual([{ method: 'push', path: sourced(mapPath(OTHER_MAP_ID)) }]);
    location.dispose();
  });

  it('survives a Graph move', () => {
    const app = compose();
    const history = recordingHistory(sourced(mapPath(MAP_ID)));
    const location = createBrowserLocation(history, mountedOptions);
    location.follow(app);

    location.activateGraph(SECOND_GRAPH_ID);

    expect(history.writes).toEqual([
      { method: 'push', path: sourced(mapGraphPath(MAP_ID, SECOND_GRAPH_ID)) },
    ]);
    location.dispose();
  });

  it('survives Present', () => {
    const app = compose();
    const history = recordingHistory(sourced(mapPath(MAP_ID)));
    const location = createBrowserLocation(history, mountedOptions);
    location.follow(app);

    app.navigation.present();

    expect(history.writes).toEqual([{ method: 'push', path: sourced(presentationPath) }]);
    location.dispose();
  });

  it('survives Enter into another Space', () => {
    const app = compose();
    const entered = compose({
      id: OTHER_SPACE_ID,
      document: {
        version: 1,
        title: 'Entered',
        maps: [
          {
            id: ENTERED_MAP_ID,
            title: 'Map',
            kind: 'positioned',
            positions: {},
            graphs: [{ id: ENTERED_GRAPH_ID, title: 'Graph', edges: [] }],
          },
        ],
        defaultMap: ENTERED_MAP_ID,
      },
      resources: [],
    });
    const history = recordingHistory(sourced(mapPath(MAP_ID)));
    const location = createBrowserLocation(history, mountedOptions);
    location.follow(app);

    location.activate(entered);

    expect(history.writes).toEqual([
      {
        method: 'push',
        path: sourced(
          productDestinationPath({ kind: 'map', spaceId: OTHER_SPACE_ID, mapId: ENTERED_MAP_ID }),
        ),
      },
    ]);
    location.dispose();
  });

  it('survives a browser traversal, which resolves the path alone', () => {
    const app = compose();
    const history = recordingHistory(sourced(mapPath(MAP_ID)));
    const location = createBrowserLocation(history, mountedOptions);
    location.follow(app);
    location.chooseMap(OTHER_MAP_ID);

    history.popTo(sourced(mapPath(MAP_ID)));
    expect(app.navigation.getState().selectedMapId).toBe(MAP_ID);
    expect(location.getState().destinationNotFound).toBe(false);
    location.activateGraph(SECOND_GRAPH_ID);

    expect(history.writes).toEqual([
      { method: 'push', path: sourced(mapPath(OTHER_MAP_ID)) },
      { method: 'push', path: sourced(mapGraphPath(MAP_ID, SECOND_GRAPH_ID)) },
    ]);
    location.dispose();
  });

  it('survives Back and Forward in the native adapter', () => {
    const app = compose();
    const stand = standInBrowser({ path: sourced(mapPath(MAP_ID)) });
    const history = createBrowserHistory(stand.browser);
    const location = createBrowserLocation(history, mountedOptions);
    location.follow(app);
    location.chooseMap(OTHER_MAP_ID);

    stand.back();
    stand.settle();
    expect(history.href()).toBe(new URL(sourced(mapPath(MAP_ID)), history.href()).href);
    stand.forward();
    stand.settle();

    expect(app.navigation.getState().selectedMapId).toBe(OTHER_MAP_ID);
    expect(history.href()).toBe(new URL(sourced(mapPath(OTHER_MAP_ID)), history.href()).href);
    location.dispose();
  });

  it('carries the source into a copied link', () => {
    const app = compose();
    const history = recordingHistory(sourced(mapPath(MAP_ID)));
    const location = createBrowserLocation(history, mountedOptions);
    location.follow(app);

    expect(location.href({ kind: 'map', spaceId: SPACE_ID, mapId: OTHER_MAP_ID })).toBe(
      `https://space.test${sourced(mapPath(OTHER_MAP_ID))}`,
    );
    location.dispose();
  });

  it('carries no source on a page that is not mounted', () => {
    const app = compose();
    const history = recordingHistory(sourced(mapPath(MAP_ID)));
    const location = createBrowserLocation(history, { isNavigationHeld: nothingHeld });
    location.follow(app);

    location.chooseMap(OTHER_MAP_ID);

    expect(history.writes).toEqual([{ method: 'push', path: mapPath(OTHER_MAP_ID) }]);
    expect(location.href({ kind: 'map', spaceId: SPACE_ID, mapId: MAP_ID })).toBe(
      `https://space.test${mapPath(MAP_ID)}`,
    );
    location.dispose();
  });

  it('carries the rest of the query beside the source, but not the hash', () => {
    const app = compose();
    const history = recordingHistory(`${mapPath(MAP_ID)}?utm=feed&source=${SOURCE}&x=1#notes`);
    const location = createBrowserLocation(history, mountedOptions);
    location.follow(app);

    location.chooseMap(OTHER_MAP_ID);

    expect(history.writes).toEqual([
      { method: 'push', path: `${mapPath(OTHER_MAP_ID)}?utm=feed&source=${SOURCE}&x=1` },
    ]);
    expect(location.href({ kind: 'map', spaceId: SPACE_ID, mapId: MAP_ID })).toBe(
      `https://space.test${mapPath(MAP_ID)}?utm=feed&source=${SOURCE}&x=1`,
    );
    location.dispose();
  });

  it('carries the rest of the query on a page that is not mounted, but no source or hash', () => {
    const app = compose();
    const history = recordingHistory(`${mapPath(MAP_ID)}?utm=feed&source=${SOURCE}#notes`);
    const location = createBrowserLocation(history, { isNavigationHeld: nothingHeld });
    location.follow(app);

    location.chooseMap(OTHER_MAP_ID);

    expect(history.writes).toEqual([{ method: 'push', path: `${mapPath(OTHER_MAP_ID)}?utm=feed` }]);
    location.dispose();
  });
});

const resolved = (sha: string) => ({ owner: 'tobyhede', repo: 'talk', sha, path: 'slides' });

describe('pinning the mounted source', () => {
  it('replaces a branch location with its commit exactly once', () => {
    const history = recordingHistory(sourced(mapPath(MAP_ID), 'github:tobyhede/talk@main/slides'));

    pinSource(history, resolved(COMMIT));
    pinSource(history, resolved(COMMIT));

    expect(history.writes).toEqual([{ method: 'replace', path: sourced(mapPath(MAP_ID)) }]);
  });

  it('keeps the rest of the query as it pins, but not the hash', () => {
    const history = recordingHistory(
      `${mapPath(MAP_ID)}?utm=feed&source=github:tobyhede/talk@main/slides#notes`,
    );

    pinSource(history, resolved(COMMIT));

    expect(history.writes).toEqual([
      { method: 'replace', path: `${mapPath(MAP_ID)}?utm=feed&source=${SOURCE}` },
    ]);
  });

  it('writes nothing when the address already names the commit', () => {
    const history = recordingHistory(sourced(mapPath(MAP_ID)));

    pinSource(history, resolved(COMMIT));

    expect(history.writes).toEqual([]);
  });

  it('writes nothing when the address names the commit in its encoded spelling', () => {
    const history = recordingHistory(`${mapPath(MAP_ID)}?source=${encodeURIComponent(SOURCE)}`);

    pinSource(history, resolved(COMMIT));

    expect(history.writes).toEqual([]);
  });

  it('writes a build-time default into the address as a pinned source', () => {
    const history = recordingHistory(mapPath(MAP_ID));

    pinSource(history, resolved(COMMIT));

    expect(history.writes).toEqual([{ method: 'replace', path: sourced(mapPath(MAP_ID)) }]);
  });

  it('replaces a source that names another commit', () => {
    const history = recordingHistory(
      sourced(mapPath(MAP_ID), `github:tobyhede/talk@${LATER_COMMIT}/slides`),
    );

    pinSource(history, resolved(COMMIT));

    expect(history.writes).toEqual([{ method: 'replace', path: sourced(mapPath(MAP_ID)) }]);
  });

  it('is carried by every later move the location makes', () => {
    const app = compose();
    const history = recordingHistory(mapPath(MAP_ID));
    const location = createBrowserLocation(history, mountedOptions);
    location.follow(app);
    pinSource(history, resolved(COMMIT));

    location.chooseMap(OTHER_MAP_ID);

    expect(history.writes).toEqual([
      { method: 'replace', path: sourced(mapPath(MAP_ID)) },
      { method: 'push', path: sourced(mapPath(OTHER_MAP_ID)) },
    ]);
    location.dispose();
  });
});

describe('carrying the query to another path', () => {
  const href = 'https://hyper.test/from?a=1&&source=x&b&source=y#notes';

  it('keeps every pair as written, empty and duplicate ones included', () => {
    expect(carriedAddress('/to', href, 'keep')).toBe('/to?a=1&&source=x&b&source=y');
  });

  it('drops every source pair, a bare one included', () => {
    expect(carriedAddress('/to', href, 'drop')).toBe('/to?a=1&&b');
    expect(carriedAddress('/to', 'https://hyper.test/?source', 'drop')).toBe('/to');
  });

  it('sets the source in the first one’s place, dropping the rest', () => {
    expect(carriedAddress('/to', href, { set: 'github:o/r' })).toBe('/to?a=1&&source=github:o/r&b');
  });

  it('appends a source the query does not have', () => {
    expect(carriedAddress('/to', 'https://hyper.test/?a=1', { set: 'github:o/r' })).toBe(
      '/to?a=1&source=github:o/r',
    );
  });

  it('writes the path alone when no pair is left, never a bare ?', () => {
    expect(carriedAddress('/to', 'https://hyper.test/?#x', 'keep')).toBe('/to');
  });
});

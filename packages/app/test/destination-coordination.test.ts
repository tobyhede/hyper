import { describe, expect, it } from 'vitest';
import {
  encodeCompactUuid,
  spaceSnapshotSchema,
  uuidSchema,
  type ResourceId,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { productDestinationPath, resolveProductDestinationInSnapshot } from '@project/http';
import { destinationSync } from '../src/destination-coordination';
import type { NavigationAddress } from '../src/navigation';
import { createWorkingSpaceReader } from '../src/snapshot';

const uuid = (value: string): UUID => uuidSchema.parse(value);

const SPACE_ID = uuid('00000000-0000-4000-8000-000000000001');
const RESOURCE_A = uuid('00000000-0000-4000-8000-000000000002');
const RESOURCE_B = uuid('00000000-0000-4000-8000-000000000003');
/** A Resource of the Space the Map does not hold, so no contextual URL names it. */
const RESOURCE_OFF_MAP = uuid('00000000-0000-4000-8000-000000000004');
const MAP = uuid('00000000-0000-4000-8000-000000000010');
const OPENING_GRAPH = uuid('00000000-0000-4000-8000-000000000020');
const OTHER_GRAPH = uuid('00000000-0000-4000-8000-000000000021');
/** A second Map, so a selection can move to a Map no location names. */
const OTHER_MAP = uuid('00000000-0000-4000-8000-000000000011');
const OTHER_MAP_GRAPH = uuid('00000000-0000-4000-8000-000000000022');

/**
 * One Map owning two Graphs, only one of which it opens on.
 *
 * Two, because the whole question this module answers is whether a location
 * already opens an address, and a Space whose only Graph is the one every
 * location opens on cannot tell "already open" from "cannot say".
 */
const snapshot: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    defaultMap: MAP,
    maps: [
      {
        id: MAP,
        title: 'Map',
        kind: 'positioned',
        positions: {
          [RESOURCE_A]: { x: 0, y: 0, open: false },
          [RESOURCE_B]: { x: 320, y: 0, open: false },
        },
        graphs: [
          { id: OPENING_GRAPH, title: 'Opening', edges: [{ from: RESOURCE_A, to: RESOURCE_B }] },
          { id: OTHER_GRAPH, title: 'Other', edges: [{ from: RESOURCE_B, to: RESOURCE_A }] },
        ],
        activeGraph: OPENING_GRAPH,
      },
      {
        id: OTHER_MAP,
        title: 'Other Map',
        kind: 'positioned',
        positions: { [RESOURCE_A]: { x: 0, y: 0, open: false } },
        graphs: [{ id: OTHER_MAP_GRAPH, title: 'Other Map Graph', edges: [] }],
      },
    ],
  },
  resources: [
    { id: RESOURCE_A, document: { title: 'A', kind: 'markdown', body: '' } },
    { id: RESOURCE_B, document: { title: 'B', kind: 'markdown', body: '' } },
    { id: RESOURCE_OFF_MAP, document: { title: 'C', kind: 'markdown', body: '' } },
  ],
});

const space = createWorkingSpaceReader()(snapshot);

const overview = (activeGraphId: UUID | null = OPENING_GRAPH): NavigationAddress => ({
  selectedMapId: MAP,
  activeGraphId,
  presentingResourceId: null,
});

const presenting = (
  resourceId: ResourceId,
  activeGraphId: UUID = OPENING_GRAPH,
): NavigationAddress => ({
  selectedMapId: MAP,
  activeGraphId,
  presentingResourceId: resourceId,
});

const view = `/spaces/${encodeCompactUuid(SPACE_ID)}/maps/${encodeCompactUuid(MAP)}`;

const sync = (
  pathname: string,
  address: NavigationAddress,
  synced: NavigationAddress,
  addressedResourceId: ResourceId | null = null,
) =>
  destinationSync({
    space,
    snapshot,
    pathname,
    position: { ...address, addressedResourceId },
    synced,
  });

describe('what the browser should do about an address', () => {
  it('does nothing when the location already opens the address, however it got there', () => {
    // Back to a Graph destination: the address has just moved to what the
    // location names, so a decision that only compared addresses would push a
    // second entry over the one the browser navigated to.
    expect(
      sync(`${view}/graphs/${encodeCompactUuid(OTHER_GRAPH)}`, overview(OTHER_GRAPH), overview()),
    ).toEqual({ kind: 'none' });
  });

  it('does nothing at a Space location that opens the default renderer', () => {
    expect(sync(`/spaces/${encodeCompactUuid(SPACE_ID)}`, overview(), overview())).toEqual({
      kind: 'none',
    });
  });

  it('does nothing at a canonical Resource location naming the addressed Resource', () => {
    expect(
      sync(
        productDestinationPath({ kind: 'resource', spaceId: SPACE_ID, resourceId: RESOURCE_A }),
        overview(),
        overview(),
        RESOURCE_A,
      ),
    ).toEqual({ kind: 'none' });
  });

  it('leaves a location outside product addressing alone until the reader moves', () => {
    expect(sync('/', overview(), overview())).toEqual({ kind: 'none' });
  });

  it('pushes when the address moved away from the location', () => {
    expect(sync(view, overview(OTHER_GRAPH), overview())).toEqual({
      kind: 'push',
      destination: {
        kind: 'map-graph',
        spaceId: SPACE_ID,
        mapId: MAP,
        graphId: OTHER_GRAPH,
      },
    });
  });

  it('pushes the presentation point a presenting address is at', () => {
    expect(sync(view, presenting(RESOURCE_A), overview())).toEqual({
      kind: 'push',
      destination: {
        kind: 'presentation',
        spaceId: SPACE_ID,
        mapId: MAP,
        graphId: OPENING_GRAPH,
        resourceId: RESOURCE_A,
      },
    });
  });

  /**
   * The rule `adoptedRendererDestination` carried, generalised: a location that
   * is *more* specific than the address, in the same Map, is left as
   * specific as it was rather than widened.
   */
  it('keeps the Graph a location already names when a presentation ends', () => {
    const point = `${view}/graphs/${encodeCompactUuid(OPENING_GRAPH)}/present/${encodeCompactUuid(RESOURCE_A)}`;

    expect(sync(point, overview(), presenting(RESOURCE_A))).toEqual({
      kind: 'push',
      destination: {
        kind: 'map-graph',
        spaceId: SPACE_ID,
        mapId: MAP,
        graphId: OPENING_GRAPH,
      },
    });
  });

  /**
   * Leaving a presentation returns to the Graph, whatever Resource the location has
   * been naming.
   *
   * A canonical Resource URL leaves `addressedResourceId` set, and nothing on the way
   * out of a presentation clears it. Answering a Resource destination there would
   * drop the Active Graph out of the address — which is exactly the
   * distinction the two Resource spellings exist to keep.
   */
  it('leaves a presentation for the Graph even while a Resource is still addressed', () => {
    const point = `${view}/graphs/${encodeCompactUuid(OPENING_GRAPH)}/present/${encodeCompactUuid(RESOURCE_A)}`;

    expect(sync(point, overview(), presenting(RESOURCE_A), RESOURCE_A)).toEqual({
      kind: 'push',
      destination: {
        kind: 'map-graph',
        spaceId: SPACE_ID,
        mapId: MAP,
        graphId: OPENING_GRAPH,
      },
    });
  });

  /**
   * The canonical Resource URL is the Resource's identity and names no Map; the
   * contextual one names both. Nothing here may rewrite the first into the
   * second — the reader holding a canonical link would find it silently
   * narrowed to the context they happened to be in.
   */
  it('does not rewrite a canonical Resource location into its contextual spelling', () => {
    const canonical = productDestinationPath({
      kind: 'resource',
      spaceId: SPACE_ID,
      resourceId: RESOURCE_A,
    });

    expect(sync(canonical, overview(OTHER_GRAPH), overview(), RESOURCE_A)).toEqual({
      kind: 'push',
      destination: {
        kind: 'map-graph',
        spaceId: SPACE_ID,
        mapId: MAP,
        graphId: OTHER_GRAPH,
      },
    });
  });

  /**
   * Every destination this answers must be one the same Space can open again.
   *
   * A Resource the Map omits has a canonical URL and no contextual one: the
   * resolver refuses `/maps/<map>/resources/<resource>` and the host answers 404.
   * Addressing that Resource *within* the Map would therefore write a
   * location that reloads into nothing.
   */
  it('answers no destination this Space refuses to resolve', () => {
    const point = `${view}/graphs/${encodeCompactUuid(OPENING_GRAPH)}/present/${encodeCompactUuid(RESOURCE_A)}`;

    const decision = sync(point, overview(), presenting(RESOURCE_A), RESOURCE_OFF_MAP);

    expect(decision.kind).not.toBe('none');
    if (decision.kind === 'none') return;
    expect(
      resolveProductDestinationInSnapshot(snapshot, productDestinationPath(decision.destination))
        .kind,
    ).toBe('resolved');
  });

  it('replaces, without a history entry, when the location still names a Resource the address has dropped', () => {
    // Choosing the current Map row again: Navigation republishes the same
    // address, and the Resource the location names is no longer addressed.
    expect(
      sync(`${view}/resources/${encodeCompactUuid(RESOURCE_A)}`, overview(), overview()),
    ).toEqual({
      kind: 'replace',
      destination: { kind: 'map', spaceId: SPACE_ID, mapId: MAP },
    });
  });

  it('replaces a location that no longer resolves once the address has settled elsewhere', () => {
    const missing = uuid('00000000-0000-4000-8000-0000000000aa');

    expect(sync(`${view}/graphs/${encodeCompactUuid(missing)}`, overview(), overview())).toEqual({
      kind: 'replace',
      destination: { kind: 'map', spaceId: SPACE_ID, mapId: MAP },
    });
  });

  it('addresses the Map a selection has moved to', () => {
    expect(
      sync(
        view,
        {
          selectedMapId: OTHER_MAP,
          activeGraphId: OTHER_MAP_GRAPH,
          presentingResourceId: null,
        },
        overview(),
      ),
    ).toEqual({
      kind: 'push',
      destination: { kind: 'map', spaceId: SPACE_ID, mapId: OTHER_MAP },
    });
  });
});

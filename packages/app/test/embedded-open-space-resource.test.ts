import { describe, expect, it } from 'vitest';
import { uuidSchema, type Resource } from '@project/core';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import { DRAG_TILT_RADIANS, tiltResourcePosition } from '../src/drag-tilt';
import { embeddedMap } from '../src/embedded-map';
import {
  discoverEmbeddedOpenSpaceResources,
  embedBounds,
  embeddedAuthoringEnabled,
  editingPortalAncestor,
  embeddingIsPortalEditing,
} from '../src/embedded-open-space-resource';

const id = (value: number) =>
  uuidSchema.parse(`00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`);

const HOST = id(1);
const TARGET = id(2);
const MAP = id(3);
const GRAPH = id(4);
const NESTED = id(5);
const OTHER_MAP = id(6);
const CHILD_RESOURCE = id(7);

/** A leaned publication, via the same `tiltResourcePosition` `embeddedMap` uses. */
const lean = (
  position: { readonly x: number; readonly y: number },
  size: { readonly width: number; readonly height: number },
  tilt: {
    readonly center: { readonly x: number; readonly y: number };
    readonly parentAbsolute: { readonly x: number; readonly y: number };
  },
) =>
  tiltResourcePosition(
    position,
    size,
    {
      x: tilt.center.x - tilt.parentAbsolute.x,
      y: tilt.center.y - tilt.parentAbsolute.y,
    },
    DRAG_TILT_RADIANS,
  );

const spaceContent = (
  resourceId: typeof HOST,
  spaceId: typeof TARGET,
  map: typeof MAP,
  graph: typeof GRAPH = GRAPH,
): Extract<Resource, { kind: 'space' }> => ({
  id: resourceId,
  title: 'Elsewhere',
  kind: 'space',
  spaceId,
  map,
  graph,
});

const openSpaceResource = (
  resourceId: typeof HOST,
  target: { readonly spaceId: typeof TARGET; readonly map: typeof MAP },
  geometry: {
    readonly position?: { readonly x: number; readonly y: number };
    readonly width?: number;
    readonly height?: number;
    readonly kind?: Resource['kind'];
    readonly expanded?: boolean;
  } = {},
): ResourceFlowNode => ({
  id: resourceId,
  type: 'resource',
  position: geometry.position ?? { x: 100, y: 200 },
  width: geometry.width ?? 700,
  height: geometry.height ?? 500,
  data: {
    resourceId,
    title: 'Elsewhere',
    readOnly: false,
    kind: geometry.kind ?? 'space',
    expanded: geometry.expanded ?? true,
    spaceContent: spaceContent(resourceId, target.spaceId, target.map),
    active: false,
    selectedForAuthoring: false,
    showContent: false,
    activeGraphId: null,
    activeGraphColor: '#8a94a6',
  },
});

describe('embed bounds', () => {
  it('uses the reserved footer until a measured title height replaces it', () => {
    const parent = { id: HOST, position: { x: 100, y: 200 }, width: 700, height: 500 };
    const origin = { x: 0, y: 0 };
    expect(embedBounds(parent, origin, null, undefined)).toEqual({
      absolute: { x: 100, y: 200 },
      intersection: { left: 116, top: 216, right: 784, bottom: 596 },
      bounds: { left: 16, top: 16, right: 684, bottom: 396 },
    });
    expect(embedBounds(parent, origin, null, 40)).toEqual({
      absolute: { x: 100, y: 200 },
      intersection: { left: 116, top: 216, right: 784, bottom: 656 },
      bounds: { left: 16, top: 16, right: 684, bottom: 456 },
    });
  });

  it('intersects the containing window with an ancestor clip', () => {
    const parent = { id: HOST, position: { x: 100, y: 200 }, width: 700, height: 500 };
    const clip = { left: 150, top: 250, right: 400, bottom: 500 };
    expect(embedBounds(parent, { x: 0, y: 0 }, clip, undefined)).toEqual({
      absolute: { x: 100, y: 200 },
      intersection: { left: 150, top: 250, right: 400, bottom: 500 },
      bounds: { left: 50, top: 50, right: 300, bottom: 300 },
    });
  });
});

describe('embedded open Space Resource discovery', () => {
  it('does not nest a Map already crossed on the path', () => {
    const parent = openSpaceResource(HOST, { spaceId: TARGET, map: MAP });
    const nested = openSpaceResource(
      NESTED,
      { spaceId: TARGET, map: MAP },
      {
        position: { x: 50, y: 60 },
        width: 400,
        height: 300,
      },
    );
    const requests = discoverEmbeddedOpenSpaceResources({
      nodes: [parent],
      entries: [{ id: TARGET }],
      publications: new Map([[HOST, { mapId: MAP, nodes: [nested] }]]),
      bodyHeights: new Map(),
      draggingIds: new Set<string>(),
    });
    expect(requests.map((request) => request.parent.id)).toEqual([HOST]);
  });

  it('discovers a nested Open Space Resource on a Map the path has not crossed', () => {
    const parent = openSpaceResource(HOST, { spaceId: TARGET, map: MAP });
    const nested = openSpaceResource(
      NESTED,
      { spaceId: TARGET, map: OTHER_MAP },
      { position: { x: 50, y: 60 }, width: 400, height: 300 },
    );
    const requests = discoverEmbeddedOpenSpaceResources({
      nodes: [parent],
      entries: [{ id: TARGET }],
      publications: new Map([[HOST, { mapId: MAP, nodes: [nested] }]]),
      bodyHeights: new Map(),
      draggingIds: new Set<string>(),
    });
    expect(requests.map((request) => request.parent.id)).toEqual([HOST, NESTED]);
    expect(requests[1]?.absolute).toEqual({ x: 150, y: 260 });
    expect(requests[1]?.bounds).toEqual({
      left: 16,
      top: 16,
      right: 384,
      bottom: 196,
    });
  });

  it('leans every embedding under a dragged Resource about that Resource, not about its own parent', () => {
    const parent = openSpaceResource(HOST, { spaceId: TARGET, map: MAP });
    const nested = openSpaceResource(
      NESTED,
      { spaceId: TARGET, map: OTHER_MAP },
      { position: { x: 50, y: 60 }, width: 400, height: 300 },
    );
    const requests = discoverEmbeddedOpenSpaceResources({
      nodes: [parent],
      entries: [{ id: TARGET }],
      publications: new Map([[HOST, { mapId: MAP, nodes: [nested] }]]),
      bodyHeights: new Map(),
      draggingIds: new Set<string>([HOST]),
    });
    // The dragged Resource's own centre: (100, 200) plus half of 700x500. The
    // nested embedding is at (150, 260) with a centre of its own, and takes
    // this one — anything else leans it twice and slides it out of the frame.
    expect(requests.map((request) => request.tiltCenter)).toEqual([
      { x: 450, y: 450 },
      { x: 450, y: 450 },
    ]);
    expect(requests[0]?.drawnAbsolute).toEqual(requests[0]?.absolute);
  });

  it('builds a nested window from the authored origin when the publication has already leaned', () => {
    const parent = openSpaceResource(HOST, { spaceId: TARGET, map: MAP });
    const authored = { x: 50, y: 60 };
    const size = { width: 400, height: 300 };
    const nested = openSpaceResource(
      NESTED,
      { spaceId: TARGET, map: OTHER_MAP },
      {
        position: lean(authored, size, {
          center: { x: 450, y: 450 },
          parentAbsolute: { x: 100, y: 200 },
        }),
        width: size.width,
        height: size.height,
      },
    );
    const requests = discoverEmbeddedOpenSpaceResources({
      nodes: [parent],
      entries: [{ id: TARGET }],
      publications: new Map([
        [
          HOST,
          {
            mapId: MAP,
            nodes: [{ ...nested, data: { ...nested.data, dragTilted: true } }],
          },
        ],
      ]),
      bodyHeights: new Map(),
      draggingIds: new Set<string>([HOST]),
    });
    expect(requests[1]?.absolute).toEqual({ x: 150, y: 260 });
    expect(requests[1]?.bounds).toEqual({
      left: 16,
      top: 16,
      right: 384,
      bottom: 196,
    });
  });

  it('places Resources inside a nested window relative to where that window is drawn', () => {
    const parent = openSpaceResource(HOST, { spaceId: TARGET, map: MAP });
    const authored = { x: 50, y: 60 };
    const size = { width: 400, height: 300 };
    const hostTilt = {
      center: { x: 450, y: 450 },
      parentAbsolute: { x: 100, y: 200 },
    };
    const nestedLeaned = lean(authored, size, hostTilt);
    const nested = openSpaceResource(
      NESTED,
      { spaceId: TARGET, map: OTHER_MAP },
      {
        position: nestedLeaned,
        width: size.width,
        height: size.height,
      },
    );
    const requests = discoverEmbeddedOpenSpaceResources({
      nodes: [parent],
      entries: [{ id: TARGET }],
      publications: new Map([
        [
          HOST,
          {
            mapId: MAP,
            nodes: [{ ...nested, data: { ...nested.data, dragTilted: true } }],
          },
        ],
      ]),
      bodyHeights: new Map(),
      draggingIds: new Set<string>([HOST]),
    });
    const nestedRequest = requests[1];
    const tiltCenter = nestedRequest?.tiltCenter;
    if (nestedRequest === undefined || tiltCenter === undefined) {
      throw new Error('Expected a nested embedding under the dragged Resource');
    }
    expect(nestedRequest.absolute).toEqual({ x: 150, y: 260 });
    const nestedDrawn = { x: 100 + nestedLeaned.x, y: 200 + nestedLeaned.y };
    expect(nestedRequest.drawnAbsolute.x).toBeCloseTo(nestedDrawn.x, 9);
    expect(nestedRequest.drawnAbsolute.y).toBeCloseTo(nestedDrawn.y, 9);

    const innerAuthored = { x: 20, y: 30 };
    const innerSize = { width: 260, height: 146 };
    const inner: ResourceFlowNode = {
      id: CHILD_RESOURCE,
      type: 'resource',
      position: innerAuthored,
      width: innerSize.width,
      height: innerSize.height,
      data: {
        resourceId: CHILD_RESOURCE,
        title: 'Note',
        readOnly: false,
        kind: 'markdown',
        expanded: false,
        active: false,
        selectedForAuthoring: false,
        showContent: false,
        activeGraphId: null,
        activeGraphColor: '#8a94a6',
      },
    };
    const drawn = embeddedMap({
      parent: { id: NESTED, width: size.width, height: size.height },
      projection: { nodes: [inner], edges: [] },
      offset: { x: 0, y: 0 },
      enabled: false,
      tilt: {
        center: tiltCenter,
        parentAbsolute: nestedRequest.absolute,
        parentDrawn: nestedRequest.drawnAbsolute,
      },
    });
    const placed = drawn.nodes[0];
    if (placed === undefined) throw new Error('Expected the inner Resource to be drawn');
    const canvas = {
      x: nestedDrawn.x + placed.position.x,
      y: nestedDrawn.y + placed.position.y,
    };
    const desired = tiltResourcePosition(
      {
        x: nestedRequest.absolute.x + innerAuthored.x,
        y: nestedRequest.absolute.y + innerAuthored.y,
      },
      innerSize,
      tiltCenter,
      DRAG_TILT_RADIANS,
    );
    expect(canvas.x).toBeCloseTo(desired.x, 9);
    expect(canvas.y).toBeCloseTo(desired.y, 9);
  });

  it('leans nothing while no Resource is being moved', () => {
    const parent = openSpaceResource(HOST, { spaceId: TARGET, map: MAP });
    const requests = discoverEmbeddedOpenSpaceResources({
      nodes: [parent],
      entries: [{ id: TARGET }],
      publications: new Map(),
      bodyHeights: new Map(),
      draggingIds: new Set<string>(),
    });
    expect(requests.map((request) => request.tiltCenter)).toEqual([undefined]);
  });

  it('marks a Reference Resource embedding and everything nested under it read-only', () => {
    const parent = openSpaceResource(HOST, { spaceId: TARGET, map: MAP }, { kind: 'reference' });
    const nested = openSpaceResource(
      NESTED,
      { spaceId: TARGET, map: OTHER_MAP },
      { position: { x: 50, y: 60 }, width: 400, height: 300 },
    );
    const requests = discoverEmbeddedOpenSpaceResources({
      nodes: [parent],
      entries: [{ id: TARGET }],
      publications: new Map([[HOST, { mapId: MAP, nodes: [nested] }]]),
      bodyHeights: new Map(),
      draggingIds: new Set<string>(),
    });
    expect(requests.map((request) => request.readOnly)).toEqual([true, true]);
  });

  it('does not discover a closed Space Resource or one without space content', () => {
    const closed = openSpaceResource(HOST, { spaceId: TARGET, map: MAP }, { expanded: false });
    const markdown: ResourceFlowNode = {
      id: CHILD_RESOURCE,
      type: 'resource',
      position: { x: 0, y: 0 },
      data: {
        resourceId: CHILD_RESOURCE,
        title: 'Note',
        readOnly: false,
        kind: 'markdown',
        expanded: true,
        active: false,
        selectedForAuthoring: false,
        showContent: false,
        activeGraphId: null,
        activeGraphColor: '#8a94a6',
      },
    };
    expect(
      discoverEmbeddedOpenSpaceResources({
        nodes: [closed, markdown],
        entries: [],
        publications: new Map(),
        bodyHeights: new Map(),
        draggingIds: new Set<string>(),
      }),
    ).toEqual([]);
  });
});

const nodesById = (...nodes: readonly ResourceFlowNode[]) =>
  new Map(nodes.map((node) => [node.id, node]));

describe('edit portal ancestry', () => {
  it('finds the nearest Open Space Resource currently in portal Edit', () => {
    const host = openSpaceResource(HOST, { spaceId: TARGET, map: MAP });
    const nested = {
      ...openSpaceResource(NESTED, { spaceId: TARGET, map: OTHER_MAP }),
      parentId: HOST,
    };
    const byId = nodesById(host, nested);
    expect(editingPortalAncestor(nested, byId, new Set([HOST]))).toBe(host);
    expect(editingPortalAncestor(nested, byId, new Set())).toBeUndefined();
    expect(embeddingIsPortalEditing(nested, byId, new Set([HOST]))).toBe(true);
    expect(embeddingIsPortalEditing(host, byId, new Set([NESTED]))).toBe(false);
  });
});

describe('embedded Read/Edit enabled gate', () => {
  const open = {
    authorInEmbeddedMap: true,
    authorOnCanvas: true,
    thisEmbeddingEditing: false,
    hostBodyEditing: false,
    hostTitleEditing: false,
  };

  it('enables authoring only while a portal ancestor is in Edit and the host is free', () => {
    expect(embeddedAuthoringEnabled({ readOnly: false, portalEditing: true, ...open })).toBe(true);
    expect(embeddedAuthoringEnabled({ readOnly: false, portalEditing: false, ...open })).toBe(
      false,
    );
    expect(embeddedAuthoringEnabled({ readOnly: true, portalEditing: true, ...open })).toBe(false);
    expect(
      embeddedAuthoringEnabled({
        readOnly: false,
        portalEditing: true,
        ...open,
        hostBodyEditing: true,
      }),
    ).toBe(false);
  });

  it('keeps the embedding that owns the edit enabled when the host canvas has withdrawn', () => {
    expect(
      embeddedAuthoringEnabled({
        readOnly: false,
        portalEditing: true,
        ...open,
        authorOnCanvas: false,
        thisEmbeddingEditing: true,
      }),
    ).toBe(true);
    expect(
      embeddedAuthoringEnabled({
        readOnly: false,
        portalEditing: true,
        ...open,
        authorOnCanvas: false,
        thisEmbeddingEditing: false,
      }),
    ).toBe(false);
  });
});

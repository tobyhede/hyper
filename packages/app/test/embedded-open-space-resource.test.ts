import { describe, expect, it } from 'vitest';
import { uuidSchema, type Resource } from '@project/core';
import { bareKindData, type ResourceFlowNode } from '@project/react-flow-adapter';
import { CLOSED_DISPLAY, type ResourceDisplay } from '@project/ui';
import { DRAG_TILT_RADIANS, tiltResourcePosition } from '../src/drag-tilt';
import { embeddedMap } from '../src/embedded-map';
import {
  discoverEmbeddedOpenSpaceResources,
  embedBounds,
  editingPortalAncestor,
  embeddingIsPortalEditing,
  reportsBodyHeight,
} from '../src/embedded-open-space-resource';
import { fixtureDisplay, fixtureFacts } from './render-adapter-fixtures';

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

/**
 * What a Space Resource, or a Reference Resource to one, shows: its Space view
 * once Open, reached through the Reference Resource for the second.
 */
const spaceDisplay = (
  open: boolean,
  kind: Exclude<Resource['kind'], 'image'>,
  target: { readonly spaceId: typeof TARGET; readonly map: typeof MAP },
): ResourceDisplay =>
  open
    ? {
        shown: 'open',
        content: {
          kind: 'space',
          view: { ...target, graph: GRAPH, framing: undefined },
          via: kind === 'reference' ? 'reference' : 'self',
        },
      }
    : CLOSED_DISPLAY;

const openSpaceResource = (
  resourceId: typeof HOST,
  target: { readonly spaceId: typeof TARGET; readonly map: typeof MAP },
  geometry: {
    readonly position?: { readonly x: number; readonly y: number };
    readonly width?: number;
    readonly height?: number;
    readonly kind?: Exclude<Resource['kind'], 'image'>;
    readonly open?: boolean;
  } = {},
): ResourceFlowNode => ({
  id: resourceId,
  type: 'resource',
  position: geometry.position ?? { x: 100, y: 200 },
  width: geometry.width ?? 700,
  height: geometry.height ?? 500,
  data: {
    shape: 'rectangle',
    resourceId,
    title: 'Elsewhere',
    readOnly: false,
    ...bareKindData(geometry.kind ?? 'space'),
    contentAction: geometry.kind === 'reference' ? 'none' : 'author-space-view',
    embedsMap: geometry.kind !== 'markdown',
    open: geometry.open ?? true,
    selectedForAuthoring: false,
    display: spaceDisplay(geometry.open ?? true, geometry.kind ?? 'space', target),
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
  it('never draws the root Map inside itself', () => {
    const requests = discoverEmbeddedOpenSpaceResources({
      root: { spaceId: TARGET, mapId: MAP, policy: 'authoring' },
      editingResources: new Set(),
      staleSpaces: new Set(),
      nodes: [openSpaceResource(HOST, { spaceId: TARGET, map: MAP })],
      entries: [{ id: TARGET }],
      publications: new Map(),
      bodyHeights: new Map(),
      draggingIds: new Set(),
    });
    expect(requests).toEqual([]);
  });

  it('allows Edit one level deep and inherits read-only below a stale target', () => {
    const parent = openSpaceResource(HOST, { spaceId: TARGET, map: MAP });
    const nested = openSpaceResource(NESTED, { spaceId: TARGET, map: OTHER_MAP });
    const input = {
      root: { spaceId: HOST, mapId: OTHER_MAP, policy: 'authoring' as const },
      editingResources: new Set([HOST, NESTED]),
      nodes: [parent],
      entries: [{ id: TARGET }],
      publications: new Map([[HOST, { mapId: MAP, nodes: [nested] }]]),
      bodyHeights: new Map(),
      draggingIds: new Set<string>(),
    };
    expect(
      discoverEmbeddedOpenSpaceResources({ ...input, staleSpaces: new Set() }).map(
        (request) => request.policy,
      ),
    ).toEqual(['authoring', 'inert']);
    expect(
      discoverEmbeddedOpenSpaceResources({ ...input, staleSpaces: new Set([TARGET]) }).map(
        (request) => request.policy,
      ),
    ).toEqual(['read-only', 'read-only']);
  });

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
      root: { spaceId: HOST, mapId: OTHER_MAP, policy: 'authoring' },
      editingResources: new Set(),
      staleSpaces: new Set(),
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
      root: { spaceId: HOST, mapId: OTHER_MAP, policy: 'authoring' },
      editingResources: new Set(),
      staleSpaces: new Set(),
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
      root: { spaceId: HOST, mapId: OTHER_MAP, policy: 'authoring' },
      editingResources: new Set(),
      staleSpaces: new Set(),
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
      root: { spaceId: HOST, mapId: OTHER_MAP, policy: 'authoring' },
      editingResources: new Set(),
      staleSpaces: new Set(),
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
      root: { spaceId: HOST, mapId: OTHER_MAP, policy: 'authoring' },
      editingResources: new Set(),
      staleSpaces: new Set(),
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
        shape: 'rectangle',
        resourceId: CHILD_RESOURCE,
        title: 'Note',
        readOnly: false,
        ...bareKindData('markdown'),
        ...fixtureFacts('markdown'),
        open: false,
        selectedForAuthoring: false,
        display: fixtureDisplay(false, 'markdown'),
        activeGraphId: null,
        activeGraphColor: '#8a94a6',
      },
    };
    const drawn = embeddedMap({
      parent: { id: NESTED, width: size.width, height: size.height },
      projection: { nodes: [inner], edges: [] },
      offset: { x: 0, y: 0 },
      policy: 'inert',
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
      root: { spaceId: HOST, mapId: OTHER_MAP, policy: 'authoring' },
      editingResources: new Set(),
      staleSpaces: new Set(),
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
      root: { spaceId: HOST, mapId: OTHER_MAP, policy: 'authoring' },
      editingResources: new Set(),
      staleSpaces: new Set(),
      nodes: [parent],
      entries: [{ id: TARGET }],
      publications: new Map([[HOST, { mapId: MAP, nodes: [nested] }]]),
      bodyHeights: new Map(),
      draggingIds: new Set<string>(),
    });
    expect(requests.map((request) => request.policy)).toEqual(['read-only', 'read-only']);
  });

  it('does not discover a closed Space Resource or one without space content', () => {
    const closed = openSpaceResource(HOST, { spaceId: TARGET, map: MAP }, { open: false });
    const markdown: ResourceFlowNode = {
      id: CHILD_RESOURCE,
      type: 'resource',
      position: { x: 0, y: 0 },
      data: {
        shape: 'rectangle',
        resourceId: CHILD_RESOURCE,
        title: 'Note',
        readOnly: false,
        ...bareKindData('markdown'),
        ...fixtureFacts('markdown'),
        open: true,
        selectedForAuthoring: false,
        display: fixtureDisplay(true, 'markdown'),
        activeGraphId: null,
        activeGraphColor: '#8a94a6',
      },
    };
    expect(
      discoverEmbeddedOpenSpaceResources({
        root: { spaceId: HOST, mapId: OTHER_MAP, policy: 'authoring' },
        editingResources: new Set(),
        staleSpaces: new Set(),
        nodes: [closed, markdown],
        entries: [],
        publications: new Map(),
        bodyHeights: new Map(),
        draggingIds: new Set<string>(),
      }),
    ).toEqual([]);
  });
});

describe('the body height an embedding is clipped by', () => {
  it('is known on the first request after a Space Resource Opens, having been reported while Closed', () => {
    const closed = openSpaceResource(HOST, { spaceId: TARGET, map: MAP }, { open: false });
    expect(reportsBodyHeight(closed)).toBe(true);
    // What the Closed Resource's body reports before the Open commit.
    const bodyHeights = new Map([[HOST, 40]]);
    const opened = openSpaceResource(HOST, { spaceId: TARGET, map: MAP });
    const [first] = discoverEmbeddedOpenSpaceResources({
      root: { spaceId: HOST, mapId: OTHER_MAP, policy: 'authoring' },
      editingResources: new Set(),
      staleSpaces: new Set(),
      nodes: [opened],
      entries: [{ id: TARGET }],
      publications: new Map(),
      bodyHeights,
      draggingIds: new Set<string>(),
    });
    // The reserved footer would put the bottom at 396; the measured 40 puts it at 456.
    expect(first?.bounds).toEqual({ left: 16, top: 16, right: 684, bottom: 456 });
  });

  it('is reported by a Closed Reference Resource whose Target is a Space Resource', () => {
    expect(
      reportsBodyHeight(
        openSpaceResource(HOST, { spaceId: TARGET, map: MAP }, { kind: 'reference', open: false }),
      ),
    ).toBe(true);
  });

  it('does not report a Closed Reference whose resolved content embeds no Map', () => {
    const node = openSpaceResource(
      HOST,
      { spaceId: TARGET, map: MAP },
      { kind: 'reference', open: false },
    );
    expect(reportsBodyHeight({ ...node, data: { ...node.data, embedsMap: false } })).toBe(false);
  });

  it('is not reported by a Resource that can draw no Space', () => {
    const node = openSpaceResource(HOST, { spaceId: TARGET, map: MAP }, { open: false });
    const markdown = openSpaceResource(
      HOST,
      { spaceId: TARGET, map: MAP },
      { kind: 'markdown', open: false },
    );
    expect(reportsBodyHeight(markdown)).toBe(false);
    expect(
      reportsBodyHeight({
        ...node,
        data: { ...node.data, ...bareKindData('image'), embedsMap: false },
      }),
    ).toBe(false);
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

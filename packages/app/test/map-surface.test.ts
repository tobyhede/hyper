import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { positionedStrategy } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { composeApp } from '../src/compose-app';
import { createMapSurface, observeMapSurfaces, type DrawnSurfaceContext } from '../src/map-surface';
import { unusedImageSources } from './image-sources';

const id = (tail: string) => uuidSchema.parse(`00000000-0000-4000-8000-${tail.padStart(12, '0')}`);
const SPACE = id('1');
const RESOURCE = id('2');
const OTHER_RESOURCE = id('3');
const MAP = id('4');
const OTHER_MAP = id('5');
const GRAPH = id('6');
const OTHER_GRAPH = id('7');

function composition() {
  const snapshot: SpaceSnapshot = {
    id: SPACE,
    document: {
      version: 1,
      title: 'Drawn Maps',
      defaultMap: MAP,
      maps: [
        {
          id: MAP,
          title: 'Canvas',
          kind: 'positioned',
          positions: { [RESOURCE]: { x: 10, y: 20, open: false } },
          graphs: [{ id: GRAPH, title: 'Canvas Graph', edges: [] }],
        },
        {
          id: OTHER_MAP,
          title: 'Drawn',
          kind: 'positioned',
          positions: { [OTHER_RESOURCE]: { x: 350, y: 240, open: false } },
          graphs: [{ id: OTHER_GRAPH, title: 'Drawn Graph', edges: [] }],
        },
      ],
    },
    resources: [
      { id: RESOURCE, document: { title: 'Canvas Resource', kind: 'markdown', body: '' } },
      { id: OTHER_RESOURCE, document: { title: 'Drawn Resource', kind: 'markdown', body: '' } },
    ],
  };
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const spaceSession = openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded);
  return composeApp({ spaceSession, images: unusedImageSources });
}

function drawing(
  app: ReturnType<typeof composeApp>,
  context: Omit<DrawnSurfaceContext, 'kind' | 'occurrence'> & { readonly occurrence?: string },
) {
  const surface = createMapSurface(app, () => ({
    kind: 'drawn',
    occurrence: 'drawing',
    ...context,
  }));
  surface.observe();
  return surface;
}

describe('a drawn Map', () => {
  it('projects its explicit Map and Graph independently of the Space navigation', async () => {
    const app = composition();
    const surface = drawing(app, {
      mapId: OTHER_MAP,
      graphId: OTHER_GRAPH,
      policy: 'authoring',
    });
    const view = surface.view();
    const placed = await positionedStrategy(view.mapPlacement)(view.projection.strategyGraph);
    const projection = surface.project(placed);

    expect(projection.nodes.map((node) => node.data.resourceId)).toEqual([OTHER_RESOURCE]);
    expect(projection.nodes[0]?.position).toEqual({ x: 350, y: 240 });
    expect(projection.nodes[0]?.data.activeGraphId).toBe(OTHER_GRAPH);
    expect(app.navigation.getState().selectedMapId).toBe(MAP);
    surface.dispose();
  });

  it('opens and connects in the drawn Map without moving Navigation', async () => {
    const app = composition();
    const surface = drawing(app, {
      mapId: OTHER_MAP,
      graphId: OTHER_GRAPH,
      policy: 'authoring',
    });
    expect(
      surface.authoring.complete({ kind: 'opened-resource', resourceId: OTHER_RESOURCE }),
    ).toMatchObject({ kind: 'completed' });
    expect(surface.view().mapPlacement.get(OTHER_RESOURCE)?.open).toBe(true);
    const view = surface.view();
    const placed = await positionedStrategy(view.mapPlacement)(view.projection.strategyGraph);
    const projection = surface.project(placed);
    surface.adapter.getState().syncProjection(projection.nodes, projection.edges);
    surface.edgeAuthoring.connect(OTHER_RESOURCE, OTHER_RESOURCE, projection.nodes);
    expect(surface.view().selectedMap.map.graphs[0]?.edges).toEqual([
      { from: OTHER_RESOURCE, to: OTHER_RESOURCE },
    ]);
    expect(app.navigation.getState().selectedMapId).toBe(MAP);
    expect(app.currentSpace().lookup.map(MAP)?.map.graphs[0]?.edges).toEqual([]);
    surface.dispose();
  });
  it.each([
    { policy: 'authoring', authoring: true, readOnly: false },
    { policy: 'inert', authoring: false, readOnly: false },
    { policy: 'read-only', authoring: false, readOnly: true },
  ] as const)('offers $policy capabilities', ({ policy, authoring, readOnly }) => {
    const surface = drawing(composition(), { mapId: OTHER_MAP, graphId: OTHER_GRAPH, policy });
    expect(surface.offers()).toEqual({
      authoring,
      readOnly,
      editEmbeddedMap: false,
      present: false,
    });
    surface.dispose();
  });
  it('continues only in the drawing that requested it and drops a departed drawing', () => {
    const app = composition();
    const left = drawing(app, {
      mapId: OTHER_MAP,
      graphId: OTHER_GRAPH,
      policy: 'authoring',
      occurrence: 'left',
    });
    const right = drawing(app, {
      mapId: OTHER_MAP,
      graphId: OTHER_GRAPH,
      policy: 'authoring',
      occurrence: 'right',
    });
    const request = {
      target: { kind: 'resource', resourceId: OTHER_RESOURCE },
      select: true,
      then: 'rename',
    } as const;
    const stopDrawing = left.observe();
    left.continuation.request(request);
    expect(left.continuation.getState().pending).toEqual(request);
    expect(right.continuation.getState().pending).toBeNull();
    expect(app.continuation.getState().pending).toBeNull();
    stopDrawing();
    left.continuation.request(request);
    expect(left.continuation.getState().pending).toBeNull();
    expect(right.continuation.getState().pending).toBeNull();
    left.dispose();
    right.dispose();
  });
  it('keeps one selection and continuation across two drawings of the same Map', () => {
    const app = composition();
    const left = drawing(app, {
      mapId: OTHER_MAP,
      graphId: OTHER_GRAPH,
      policy: 'authoring',
      occurrence: 'left',
    });
    const right = drawing(app, {
      mapId: OTHER_MAP,
      graphId: OTHER_GRAPH,
      policy: 'authoring',
      occurrence: 'right',
    });
    const stop = observeMapSurfaces([app.surface, left, right]);
    left.adapter.getState().selectResource(OTHER_RESOURCE);
    right.adapter.getState().selectResource(OTHER_RESOURCE);
    expect(left.adapter.getState().selection.kind).toBe('none');
    expect(right.adapter.getState().selection).toEqual({
      kind: 'resource',
      resourceId: OTHER_RESOURCE,
    });
    left.continuation.request({
      target: { kind: 'resource', resourceId: OTHER_RESOURCE },
      select: true,
      then: 'focus',
    });
    right.continuation.request({
      target: { kind: 'resource', resourceId: OTHER_RESOURCE },
      select: true,
      then: 'rename',
    });
    expect(left.continuation.getState().pending).toBeNull();
    expect(right.continuation.getState().pending?.then).toBe('rename');
    stop();
    left.dispose();
    right.dispose();
  });
});

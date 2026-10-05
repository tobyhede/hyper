import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { composeApp } from '../src/compose-app';
import { createMapSurface } from '../src/map-surface';
import { mintingIds } from './minting';
import { unusedImageSources } from './image-sources';

const id = (tail: string) => uuidSchema.parse(`00000000-0000-4000-8000-${tail.padStart(12, '0')}`);
const SPACE = id('1');
const RESOURCE = id('2');
const OPENING_MAP = id('3');
const OTHER_MAP = id('4');
const OPENING_GRAPH = id('5');
const STORED_GRAPH = id('6');
const SHOWN_GRAPH = id('7');
const MINTED_GRAPH = id('8');

/** A Space opening on one Map, with a second whose stored Graph is not the one a drawing shows. */
function composition(newId?: () => ReturnType<typeof id>) {
  const snapshot: SpaceSnapshot = {
    id: SPACE,
    document: {
      version: 1,
      title: 'Edit targets',
      defaultMap: OPENING_MAP,
      maps: [
        {
          id: OPENING_MAP,
          title: 'Opening',
          kind: 'positioned',
          positions: { [RESOURCE]: { x: 0, y: 0, open: false } },
          graphs: [{ id: OPENING_GRAPH, title: 'Opening Graph', edges: [] }],
        },
        {
          id: OTHER_MAP,
          title: 'Other',
          kind: 'positioned',
          positions: { [RESOURCE]: { x: 40, y: 40, open: false } },
          graphs: [
            { id: STORED_GRAPH, title: 'Stored Graph', edges: [] },
            { id: SHOWN_GRAPH, title: 'Shown Graph', edges: [] },
          ],
          activeGraph: STORED_GRAPH,
        },
      ],
    },
    resources: [{ id: RESOURCE, document: { title: 'Resource', kind: 'markdown', body: '' } }],
  };
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const spaceSession = openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded);
  const app = composeApp({ spaceSession, images: unusedImageSources, newId });
  return { app, spaceSession };
}

const mapOf = (snapshot: SpaceSnapshot, mapId: string) =>
  snapshot.document.maps?.find((candidate) => candidate.id === mapId);

describe('the canvas surface', () => {
  it('makes the Map it edits the opening one, so a reload opens where the author was', () => {
    const { app, spaceSession } = composition();
    app.navigation.selectMap(OTHER_MAP);

    expect(
      app.surface.authoring.complete({ kind: 'opened-resource', resourceId: RESOURCE }),
    ).toMatchObject({ kind: 'completed' });

    expect(spaceSession.getState().working.document.defaultMap).toBe(OTHER_MAP);
  });

  it('continues Navigation on the Graph its Edit made active', () => {
    const { app } = composition(mintingIds(MINTED_GRAPH));

    expect(app.surface.authoring.complete({ kind: 'added-graph' })).toMatchObject({
      kind: 'completed',
      createdGraphId: MINTED_GRAPH,
    });

    expect(app.navigation.getState().activeGraphId).toBe(MINTED_GRAPH);
  });
});

describe('a drawn surface', () => {
  it('keeps the Map’s stored Active Graph when it edits on the Graph it shows', () => {
    const { app, spaceSession } = composition();
    const drawing = createMapSurface(app, () => ({
      kind: 'drawn',
      mapId: OTHER_MAP,
      graphId: SHOWN_GRAPH,
      policy: 'authoring',
      occurrence: 'drawing',
    }));
    drawing.observe();

    expect(
      drawing.authoring.complete({ kind: 'opened-resource', resourceId: RESOURCE }),
    ).toMatchObject({ kind: 'completed' });

    const working = spaceSession.getState().working;
    expect(mapOf(working, OTHER_MAP)?.activeGraph).toBe(STORED_GRAPH);
    expect(mapOf(working, OTHER_MAP)?.positions[RESOURCE]?.open).toBe(true);
    expect(working.document.defaultMap).toBe(OPENING_MAP);
    expect(app.navigation.getState()).toMatchObject({
      selectedMapId: OPENING_MAP,
      activeGraphId: OPENING_GRAPH,
    });
    drawing.dispose();
  });
});

describe('the one door', () => {
  it('takes a Map lifecycle Edit from the canvas alone', () => {
    const { app } = composition();
    const drawn = { kind: 'drawn', mapId: OTHER_MAP, graphId: null } as const;
    const lifecycle = () =>
      // @ts-expect-error Creating a Map chooses where the canvas continues, which a drawn Map cannot.
      app.authoring.complete(drawn, { kind: 'created-map' });
    expect(lifecycle).toBeTypeOf('function');
  });
});

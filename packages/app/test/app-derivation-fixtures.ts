import { newUuid, uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { loadSpaceSnapshot, type Space } from '@project/graph';
import { MemorySpaceBackend } from '@project/persistence';
import { composeApp } from '../src/compose-app';
import type { ImageSources } from '../src/image-creation';
import type { OpenSpace } from '../src/open-spaces';
import { openTestSpace } from './opened-space';
import { unusedImageSources } from './image-sources';

/**
 * One Space for the derivations `App` composes: two Resources placed on its one
 * Map and joined by an Edge, and a third the Map leaves out.
 */
export const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
export const PLACED_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
export const PLACED_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
export const OUTSIDE = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
export const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
export const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
export const OTHER_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
export const EMPTY_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');

export const derivationSnapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    maps: [
      {
        id: MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [PLACED_A]: { x: 10, y: 20, open: false, shape: 'rectangle' },
          [PLACED_B]: {
            x: 400,
            y: 20,
            open: true,
            openSize: { width: 600, height: 400 },
            shape: 'rectangle',
          },
        },
        graphs: [{ id: GRAPH_ID, title: 'Main', edges: [{ from: PLACED_A, to: PLACED_B }] }],
      },
      {
        id: OTHER_MAP_ID,
        title: 'Map 2',
        kind: 'positioned',
        positions: { [OUTSIDE]: { x: 0, y: 0, open: false, shape: 'rectangle' } },
        graphs: [{ id: EMPTY_GRAPH_ID, title: 'Empty', edges: [] }],
      },
    ],
    defaultMap: MAP_ID,
  },
  resources: [
    { id: PLACED_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: PLACED_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
    { id: OUTSIDE, document: { title: 'Outside', kind: 'markdown', body: 'C' } },
  ],
};

export const derivationSpace = (snapshot: SpaceSnapshot = derivationSnapshot): Space => {
  const loaded = loadSpaceSnapshot(snapshot);
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join('\n'));
  return loaded.space;
};

/**
 * `derivationSnapshot` with `PLACED_A` an Ur Resource, the one kind a Map may
 * draw in a Shape other than the rectangle (ADR 0117).
 */
export const urDerivationSnapshot: SpaceSnapshot = {
  ...derivationSnapshot,
  resources: derivationSnapshot.resources.map((resource) =>
    resource.id === PLACED_A ? { id: PLACED_A, document: { title: 'A', kind: 'ur' } } : resource,
  ),
};

/** The fixture Space opened and composed the way Open Spaces opens one. */
export const openDerivationSpace = (
  newId: () => UUID = newUuid,
  images: ImageSources = unusedImageSources,
  snapshot: SpaceSnapshot = derivationSnapshot,
): OpenSpace => {
  const stored = { snapshot, revision: 0n, exportedRevision: null };
  const { spaceSession, spaceResources } = openTestSpace(
    new MemorySpaceBackend(SPACE_ID, [stored]),
    stored,
    newId,
  );
  return {
    id: SPACE_ID,
    session: spaceSession,
    app: composeApp({ images, spaceSession, spaceResources, newId }),
    spaceResources,
  };
};

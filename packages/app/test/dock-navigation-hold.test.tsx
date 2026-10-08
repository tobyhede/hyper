import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend } from '@project/persistence';
import { createOpenSpaces } from '../src/open-spaces';
import { OpenSpacesApplication } from '../src/components/OpenSpacesApplication';
import { unavailable } from './command-dock';
import { recordingHistory } from './browser-history';
import { heldImageSources } from './image-sources';
import { refusingFullscreen } from './fullscreen';
import { mintingIds } from './minting';
import { stubResizeObserver } from './resize-observer';

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const META_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const META_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const META_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const META_SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const OTHER_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const OTHER_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const OTHER_IMAGE_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');
const UNMINTED_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000b');
const HELD_REPLACEMENT = { kind: 'url', url: 'https://example.com/replacement.png' } as const;

const meta: SpaceSnapshot = {
  id: META_ID,
  document: {
    version: 1,
    title: 'Meta',
    defaultMap: META_MAP_ID,
    maps: [
      {
        id: META_MAP_ID,
        title: 'Map',
        kind: 'positioned',
        positions: {
          [META_RESOURCE_ID]: { x: 0, y: 0, open: false },
          [META_SPACE_RESOURCE_ID]: { x: 0, y: 40, open: false },
        },
        graphs: [
          {
            id: META_GRAPH_ID,
            title: 'One',
            edges: [{ from: META_RESOURCE_ID, to: META_SPACE_RESOURCE_ID }],
          },
        ],
        activeGraph: META_GRAPH_ID,
      },
    ],
  },
  resources: [
    { id: META_RESOURCE_ID, document: { title: 'Resource', kind: 'markdown', body: '' } },
    {
      id: META_SPACE_RESOURCE_ID,
      document: {
        title: 'Other',
        kind: 'space',
        spaceId: OTHER_ID,
        map: OTHER_MAP_ID,
        graph: OTHER_GRAPH_ID,
      },
    },
  ],
};

const other: SpaceSnapshot = {
  id: OTHER_ID,
  document: {
    version: 1,
    title: 'Other',
    defaultMap: OTHER_MAP_ID,
    maps: [
      {
        id: OTHER_MAP_ID,
        title: 'Other Map',
        kind: 'positioned',
        positions: { [OTHER_RESOURCE_ID]: { x: 0, y: 0, open: false } },
        graphs: [{ id: OTHER_GRAPH_ID, title: 'Other Graph', edges: [] }],
        activeGraph: OTHER_GRAPH_ID,
      },
    ],
  },
  resources: [
    { id: OTHER_RESOURCE_ID, document: { title: 'Resource', kind: 'markdown', body: '' } },
    {
      id: OTHER_IMAGE_ID,
      document: { title: 'Figure', kind: 'image', url: 'https://example.com/figure.png' },
    },
  ],
};

beforeAll(() => {
  stubResizeObserver();
});

afterAll(() => vi.unstubAllGlobals());

it('withdraws the Dock’s navigation and Present while an only-drawn Space replaces an image', async () => {
  const held = heldImageSources();
  const backend = new MemorySpaceBackend(
    META_ID,
    [meta, other].map((snapshot) => ({ snapshot, revision: 1n, exportedRevision: null })),
  );
  const spaces = createOpenSpaces({
    fullscreen: refusingFullscreen,
    images: held.images,
    backend,
    metaSpaceId: META_ID,
    metaSpaceTitle: 'Meta',
    newId: mintingIds(UNMINTED_ID),
    history: recordingHistory(),
  });
  const initial = await spaces.open(META_ID);
  const drawing = await spaces.hold(OTHER_ID);
  render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
  const openSpacesMenu = await screen.findByRole('button', { name: 'Spaces. 1 open.' });
  const heldControls = [
    screen.getByRole('button', { name: 'Map: Map' }),
    screen.getByRole('button', { name: 'Active Graph: One' }),
    screen.getByRole('button', { name: 'Present One' }),
  ];
  await waitFor(() => expect(unavailable(openSpacesMenu)).toBe(false));
  expect(heldControls.map(unavailable)).toEqual([false, false, false]);

  let replacement: Promise<unknown> = Promise.resolve();
  act(() => {
    replacement = drawing.entry.app.imageReplacement.replace(OTHER_IMAGE_ID, HELD_REPLACEMENT);
  });
  expect(spaces.getState().replacingImage).toBe(true);
  await waitFor(() => expect(unavailable(openSpacesMenu)).toBe(true));
  expect(heldControls.map(unavailable)).toEqual([true, true, true]);

  await act(async () => {
    held.release();
    await replacement;
  });
  await waitFor(() => expect(unavailable(openSpacesMenu)).toBe(false));
  expect(heldControls.map(unavailable)).toEqual([false, false, false]);
  await act(async () => {
    await drawing.release();
  });
});

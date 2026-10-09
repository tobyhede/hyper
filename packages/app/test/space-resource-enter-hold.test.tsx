import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend } from '@project/persistence';
import { createOpenSpaces } from '../src/open-spaces';
import { OpenSpacesApplication } from '../src/components/OpenSpacesApplication';
import { unavailable } from './command-dock';
import { recordingHistory } from './browser-history';
import { heldImageSources } from './image-sources';
import { refusingFullscreen } from './fullscreen';
import { selectResource } from './resource-selection';
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

/**
 * A replacement in any composed Space is the application's exclusive operation
 * (ADR 0126), so the canvas Space's rail is withdrawn with the rest of its
 * authoring: its Enter is not offered and then refused by `OpenSpaces.enter`.
 */
it('withdraws a Space Resource’s rail, Enter with it, while an only-drawn Space replaces an image', async () => {
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
  await screen.findByRole('article', { name: 'Other' });
  await selectResource('Other');
  fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource Other' }));
  expect(unavailable(await screen.findByRole('menuitem', { name: 'Enter' }))).toBe(false);

  let replacement: Promise<unknown> = Promise.resolve();
  act(() => {
    replacement = drawing.entry.app.imageReplacement.replace(OTHER_IMAGE_ID, HELD_REPLACEMENT);
  });
  expect(spaces.getState().replacingImage).toBe(true);
  await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Enter' })).toBeNull());
  expect(screen.queryByRole('button', { name: 'Actions for Resource Other' })).toBeNull();
  expect(spaces.getState().activeSpaceId).toBe(META_ID);

  await act(async () => {
    held.release();
    await replacement;
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource Other' }));
  expect(unavailable(await screen.findByRole('menuitem', { name: 'Enter' }))).toBe(false);
  await act(async () => {
    await drawing.release();
  });
});

import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend } from '@project/persistence';
import { Application } from '../src/components/Application';
import { createOpenSpaces } from '../src/open-spaces';
import type { Fullscreen } from '../src/presenting-fullscreen';
import { recordingHistory } from './browser-history';
import { unusedImageSources } from './image-sources';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const RESOURCE_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');

/** A Graph with an Edge, so the Dock's Present is available. */
const snapshot: SpaceSnapshot = spaceSnapshotSchema.parse({
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
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [{ from: RESOURCE_A, to: RESOURCE_B }] }],
      },
    ],
    defaultMap: MAP_ID,
  },
  resources: [
    { id: RESOURCE_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: RESOURCE_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
  ],
});

beforeAll(() => {
  vi.stubGlobal('scrollTo', () => undefined);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
});

afterAll(() => vi.unstubAllGlobals());

it('asks the fullscreen Open Spaces was composed with when the Dock presents', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const requests: string[] = [];
  const fullscreen: Fullscreen = {
    enter: () => {
      requests.push('enter');
      return Promise.resolve(false);
    },
    exit: () => undefined,
    active: () => false,
    subscribe: () => () => undefined,
  };
  const spaces = createOpenSpaces({
    images: unusedImageSources,
    backend: MemorySpaceBackend.asMeta({ snapshot, revision: 0n, exportedRevision: null }),
    metaSpaceId: SPACE_ID,
    metaSpaceTitle: snapshot.document.title,
    newId: () => {
      throw new Error('Opening a Space that has a Map mints nothing.');
    },
    history: recordingHistory(),
    fullscreen,
  });
  const opened = await spaces.open(SPACE_ID);

  try {
    await act(() => {
      root.render(
        <Application resolve={() => Promise.resolve({ kind: 'opened', opened, spaces })} />,
      );
      return Promise.resolve();
    });
    const present = await waitFor(() =>
      within(container).getByRole('button', { name: 'Present Graph' }),
    );
    act(() => {
      fireEvent.click(present);
    });

    expect(requests).toEqual(['enter']);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

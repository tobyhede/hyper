import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend } from '@project/persistence';
import { createOpenSpaces, type OpenSpace } from '../src/open-spaces';
import { OpenSpacesApplication } from '../src/components/OpenSpacesApplication';
import { unavailable } from './command-dock';
import { recordingHistory } from './browser-history';
import { heldImageSources } from './image-sources';
import { refusingFullscreen } from './fullscreen';
import { unlinkedPresentations } from './presentations';
import { selectResource } from './resource-selection';
import { mintingIds } from './minting';
import { stubResizeObserver } from './resize-observer';

/**
 * A mounted session is read-only (ADR 0130): it offers no Edit, and keeps
 * selecting, navigating, Entering and Present. Each case is answered against
 * the same Spaces unmounted as well, so a control the mounted session does not
 * draw is one the application does draw when it may.
 */

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const NOTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const META_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const META_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const OTHER_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const OTHER_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const UNMINTED_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000b');

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
          [NOTE_ID]: { x: 0, y: 0, open: false },
          [SPACE_RESOURCE_ID]: { x: 0, y: 40, open: false },
        },
        graphs: [
          {
            id: META_GRAPH_ID,
            title: 'Talk',
            edges: [{ from: NOTE_ID, to: SPACE_RESOURCE_ID }],
          },
        ],
        activeGraph: META_GRAPH_ID,
      },
    ],
  },
  resources: [
    {
      id: NOTE_ID,
      document: { title: 'Note', kind: 'markdown', content: { source: 'Body' } },
    },
    {
      id: SPACE_RESOURCE_ID,
      document: {
        title: 'Other',
        kind: 'space',
        content: { spaceId: OTHER_ID, map: OTHER_MAP_ID, graph: OTHER_GRAPH_ID },
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
    {
      id: OTHER_RESOURCE_ID,
      document: { title: 'Inside', kind: 'markdown', content: { source: '' } },
    },
  ],
};

beforeAll(() => {
  stubResizeObserver();
});

afterAll(() => vi.unstubAllGlobals());

/** {@link meta} with its Space Resource Open, embedding the Other Space's Map. */
const metaWithOpenSpaceResource: SpaceSnapshot = {
  ...meta,
  document: {
    ...meta.document,
    maps: meta.document.maps?.map((m) => ({
      ...m,
      positions: { ...m.positions, [SPACE_RESOURCE_ID]: { x: 0, y: 40, open: true } },
    })),
  },
};

/** The Meta Space opened in a session that is mounted or not, and drawn. */
async function openMeta(mounted: boolean, root: SpaceSnapshot = meta): Promise<OpenSpace> {
  const backend = new MemorySpaceBackend(
    META_ID,
    [root, other].map((snapshot) => ({ snapshot, revision: 1n, exportedRevision: null })),
  );
  const spaces = createOpenSpaces({
    fullscreen: refusingFullscreen,
    presentations: unlinkedPresentations,
    images: heldImageSources().images,
    backend,
    metaSpaceId: META_ID,
    metaSpaceTitle: 'Meta',
    newId: mintingIds(UNMINTED_ID),
    history: recordingHistory(),
    mounted,
  });
  const initial = await spaces.open(META_ID);
  render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
  await screen.findByRole('article', { name: 'Note' });
  return initial;
}

const dock = (): HTMLElement => screen.getByRole('toolbar', { name: 'Command Dock' });

const nodeOf = (name: string): HTMLElement => {
  const node = screen.getByRole('article', { name }).closest<HTMLElement>('.react-flow__node');
  if (node === null) throw new Error(`Resource ${name} is not drawn in a React Flow node`);
  return node;
};

describe('the Command Dock of a mounted session', () => {
  it('shows the read-only mark and no persistence status', async () => {
    await openMeta(true);

    expect(within(dock()).getByText('Read-only')).toBeInTheDocument();
    expect(screen.queryByTestId('persistence-status')).toBeNull();
    expect(screen.queryByText('Persisted')).toBeNull();
  });

  it('is not shown unmounted, where the persistence status is', async () => {
    await openMeta(false);

    expect(within(dock()).queryByText('Read-only')).toBeNull();
    expect(screen.getByTestId('persistence-status')).toHaveTextContent('Persisted');
  });

  it('keeps Present and offers no Create', async () => {
    await openMeta(true);

    expect(unavailable(within(dock()).getByRole('button', { name: /^Present/ }))).toBe(false);
    for (const create of within(dock()).getAllByRole('button', { name: /^Create / })) {
      expect(unavailable(create)).toBe(true);
    }
  });
});

describe('the canvas of a mounted session', () => {
  it.each([
    [false, true],
    [true, false],
  ])('mounted %s: offers Open, rename, drag and connect: %s', async (mounted, offered) => {
    await openMeta(mounted);
    await selectResource('Note');

    expect(screen.queryByRole('button', { name: 'Open Resource Note' }) !== null).toBe(offered);
    expect(screen.queryByRole('button', { name: 'Edit Title Note' }) !== null).toBe(offered);
    expect(nodeOf('Note').classList.contains('draggable')).toBe(offered);
    const handles = nodeOf('Note').querySelectorAll('.react-flow__handle');
    expect([...handles].some((handle) => handle.classList.contains('connectablestart'))).toBe(
      offered,
    );
  });

  it.each([
    [false, 3],
    [true, 2],
  ])('mounted %s: C on the canvas leaves %i Resources', async (mounted, count) => {
    const initial = await openMeta(mounted);

    act(() => {
      fireEvent.keyDown(nodeOf('Note'), { key: 'c' });
    });

    await waitFor(() => expect(initial.session.getState().working.resources).toHaveLength(count));
  });

  it('opens nothing from Enter on a Resource', async () => {
    const initial = await openMeta(true);
    const node = nodeOf('Note');

    act(() => {
      node.focus();
      fireEvent.keyDown(node, { key: 'Enter' });
    });

    const { maps } = initial.session.getState().working.document;
    expect(maps?.[0]?.positions[NOTE_ID]?.open).toBe(false);
  });

  it.each([
    [false, true],
    [true, false],
  ])('mounted %s: an Open Space Resource offers Edit: %s', async (mounted, offered) => {
    await openMeta(mounted, metaWithOpenSpaceResource);
    await selectResource('Other');

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Close Resource Other' }) !== null).toBe(offered),
    );
    expect(screen.queryByRole('button', { name: 'Edit Resource Other' }) !== null).toBe(offered);
  });

  it("keeps a Space Resource's Enter, and offers none of the rail's Edits", async () => {
    await openMeta(true);
    await selectResource('Other');

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource Other' }));

    expect(unavailable(await screen.findByRole('menuitem', { name: 'Enter' }))).toBe(false);
    for (const edit of [
      'Create Reference',
      'Connect to Resource',
      'Remove from Map',
      'Delete from Space',
    ]) {
      expect(screen.queryByRole('menuitem', { name: edit })).toBeNull();
    }
  });
});

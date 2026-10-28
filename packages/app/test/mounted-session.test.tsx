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
 * A mounted session authors as any session does (ADR 0131): its Edits are
 * committed to the page's memory and lost on reload, which a notice over the
 * canvas reports once the reader has made one.
 * Each case is answered against the same Spaces mounted and unmounted, so the
 * two cannot drift apart.
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

const BOTH = [false, true] as const;

const NOTICE = 'Edits kept in this page only';

/** Rename the Meta Space through its session, as any Edit commits. */
const edit = (initial: OpenSpace, title: string): void => {
  act(() => {
    initial.session.submit({ ...meta, document: { ...meta.document, title } });
  });
};

const notice = (): HTMLElement | null =>
  screen.queryAllByRole('status').find((region) => region.textContent.includes(NOTICE)) ?? null;

describe('the Command Dock of a mounted session', () => {
  it.each(BOTH)('mounted %s: draws no mark of where Edits go', async (mounted) => {
    await openMeta(mounted);

    expect(within(dock()).queryByText(/reload/i)).toBeNull();
    expect(notice()).toBeNull();
    expect(screen.getByTestId('persistence-status')).toHaveTextContent('Persisted');
  });

  it('commits an Edit, which the persistence status reports as any session’s', async () => {
    const initial = await openMeta(true);

    edit(initial, 'Renamed');

    await waitFor(() =>
      expect(screen.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2'),
    );
    expect(screen.getByTestId('persistence-status')).toHaveTextContent('Persisted');
    expect(initial.session.getState().working.document.title).toBe('Renamed');
  });
});

describe('the notice of a mounted session', () => {
  it('reports, once the reader has made an Edit, that it is kept in this page only', async () => {
    const initial = await openMeta(true);

    edit(initial, 'Renamed');

    await waitFor(() => expect(notice()).not.toBeNull());
    expect(notice()).toHaveTextContent('Nothing is written to GitHub');
    expect(within(dock()).queryByText(NOTICE)).toBeNull();
  });

  it('stays dismissed for the page, whatever is edited next', async () => {
    const initial = await openMeta(true);
    edit(initial, 'Renamed');
    await waitFor(() => expect(notice()).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: `Dismiss: ${NOTICE}` }));
    expect(notice()).toBeNull();

    edit(initial, 'Renamed again');
    await waitFor(() =>
      expect(screen.getByTestId('persistence-status')).toHaveAttribute('data-revision', '3'),
    );
    expect(notice()).toBeNull();
  });

  it('is not drawn unmounted, edited or not', async () => {
    const initial = await openMeta(false);

    edit(initial, 'Renamed');

    await waitFor(() =>
      expect(screen.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2'),
    );
    expect(notice()).toBeNull();
  });
});

describe('the Command Dock of either session', () => {
  it.each(BOTH)('mounted %s: keeps Present and offers Create', async (mounted) => {
    await openMeta(mounted);

    expect(unavailable(within(dock()).getByRole('button', { name: /^Present/ }))).toBe(false);
    for (const create of within(dock()).getAllByRole('button', { name: /^Create / })) {
      expect(unavailable(create)).toBe(false);
    }
  });
});

describe('the canvas of a mounted session', () => {
  it.each(BOTH)('mounted %s: offers Open, rename, drag and connect', async (mounted) => {
    await openMeta(mounted);
    await selectResource('Note');

    expect(screen.getByRole('button', { name: 'Open Resource Note' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Title Note' })).toBeInTheDocument();
    expect(nodeOf('Note').classList.contains('draggable')).toBe(true);
    const handles = nodeOf('Note').querySelectorAll('.react-flow__handle');
    expect([...handles].some((handle) => handle.classList.contains('connectablestart'))).toBe(true);
  });

  it.each(BOTH)('mounted %s: C on the canvas creates a Resource', async (mounted) => {
    const initial = await openMeta(mounted);

    act(() => {
      fireEvent.keyDown(nodeOf('Note'), { key: 'c' });
    });

    await waitFor(() => expect(initial.session.getState().working.resources).toHaveLength(3));
  });

  it.each(BOTH)('mounted %s: Enter on a Resource opens it', async (mounted) => {
    const initial = await openMeta(mounted);
    const node = nodeOf('Note');

    act(() => {
      node.focus();
      fireEvent.keyDown(node, { key: 'Enter' });
    });

    await waitFor(() => {
      const { maps } = initial.session.getState().working.document;
      expect(maps?.[0]?.positions[NOTE_ID]?.open).toBe(true);
    });
  });

  it.each(BOTH)('mounted %s: an Open Space Resource offers Edit', async (mounted) => {
    await openMeta(mounted, metaWithOpenSpaceResource);
    await selectResource('Other');

    expect(await screen.findByRole('button', { name: 'Close Resource Other' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Resource Other' })).toBeInTheDocument();
  });

  it.each(BOTH)(
    "mounted %s: offers a Space Resource's Enter and the rail's Edits",
    async (mounted) => {
      await openMeta(mounted);
      await selectResource('Other');

      fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource Other' }));

      expect(unavailable(await screen.findByRole('menuitem', { name: 'Enter' }))).toBe(false);
      for (const edit of [
        'Create Reference',
        'Connect to Resource',
        'Remove from Map',
        'Delete from Space',
      ]) {
        expect(screen.getByRole('menuitem', { name: edit })).toBeInTheDocument();
      }
    },
  );
});

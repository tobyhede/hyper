import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { newUuid, spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend } from '@project/persistence';
import { createOpenSpaces } from '../src/open-spaces';
import { OpenSpacesApplication } from '../src/components/OpenSpacesApplication';
import { recordingHistory } from './browser-history';
import { createThing, unavailable } from './command-dock';

/**
 * The Spaces the Things list offers, across every open Space.
 *
 * The set is a repository read rather than a derivation of the Space drawing
 * it, so the one Edit that changes it — the coordinated Space Thing lifecycle
 * (ADR 0074, ADR 0076) — is registry-wide while the surfaces reading it are one
 * per open Space. A reader who creates a Space in one Space and crosses back to
 * another has to find it offered there: every open Space stays mounted
 * (`OpenSpacesApplication`), so nothing re-reads the set on a crossing.
 */

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const META_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const META_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const META_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const META_TO_HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const META_TO_OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');

const HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const HOME_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const HOME_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000012');
const HOME_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000013');

const OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000020');
const OTHER_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const OTHER_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');

/** Meta references both ordinary Spaces, which is what makes the aggregate valid. */
const meta: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: META_ID,
  document: {
    version: 1,
    title: 'Meta',
    diagrams: [
      {
        id: META_DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: {
          [META_THING_ID]: { x: 0, y: 0, open: false },
          [META_TO_HOME_ID]: { x: 300, y: 0, open: false },
          [META_TO_OTHER_ID]: { x: 600, y: 0, open: false },
        },
        graphs: [{ id: META_GRAPH_ID, title: 'Graph 1', edges: [] }],
      },
    ],
    defaultDiagram: META_DIAGRAM_ID,
  },
  things: [
    { id: META_THING_ID, document: { title: 'Meta', kind: 'markdown', body: '' } },
    {
      id: META_TO_HOME_ID,
      document: {
        title: 'Home',
        kind: 'space',
        spaceId: HOME_ID,
        diagram: HOME_DIAGRAM_ID,
        graph: HOME_GRAPH_ID,
      },
    },
    {
      id: META_TO_OTHER_ID,
      document: {
        title: 'Other',
        kind: 'space',
        spaceId: OTHER_ID,
        diagram: OTHER_DIAGRAM_ID,
        graph: OTHER_GRAPH_ID,
      },
    },
  ],
});

const home: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: HOME_ID,
  document: {
    version: 1,
    title: 'Home',
    diagrams: [
      {
        id: HOME_DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: { [HOME_THING_ID]: { x: 10, y: 20, open: false } },
        graphs: [{ id: HOME_GRAPH_ID, title: 'Graph 1', edges: [] }],
      },
    ],
    defaultDiagram: HOME_DIAGRAM_ID,
  },
  things: [{ id: HOME_THING_ID, document: { title: 'Start here', kind: 'markdown', body: '' } }],
});

const other: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: OTHER_ID,
  document: {
    version: 1,
    title: 'Other',
    diagrams: [
      {
        id: OTHER_DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: { [OTHER_THING_ID]: { x: 10, y: 20, open: false } },
        graphs: [{ id: OTHER_GRAPH_ID, title: 'Graph 1', edges: [] }],
      },
    ],
    defaultDiagram: OTHER_DIAGRAM_ID,
  },
  things: [{ id: OTHER_THING_ID, document: { title: 'Thing 1', kind: 'markdown', body: '' } }],
});

beforeAll(() => {
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
  // Base UI's Select positioner measures, and jsdom ships neither pointer
  // capture nor `scrollIntoView`; both are reached before a list can open.
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

afterAll(() => vi.unstubAllGlobals());

/** Wait for the canvas to be authorable, which is what makes the Dock's commands available. */
async function readyToAuthor(): Promise<void> {
  const create = await screen.findByRole('button', { name: 'Create Markdown Thing' });
  await waitFor(() => expect(unavailable(create)).toBe(false));
}

/** Open the Things list of whichever Space is showing, and answer its popup. */
async function openThingsList(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: 'Things' }));
  return await screen.findByRole('dialog', { name: 'Things' });
}

const closeThingsList = async (popup: HTMLElement): Promise<void> => {
  fireEvent.keyDown(popup, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Things' })).toBeNull());
};

/** The count the Spaces switch announces, which is the size of the offered set. */
const offeredSpaces = (): HTMLElement =>
  screen.getByRole('button', { name: /^Spaces in this Meta Space, \d+$/ });

describe('the Spaces a Things list offers', () => {
  /**
   * Space A and Space B are both open; the Space is created in B; A has to see
   * it. Both applications stay mounted across the crossing, so A's Spaces read
   * happens once unless something tells it the set changed.
   */
  it('is re-read in every open Space when another open Space creates one', async () => {
    const backend = new MemorySpaceBackend(
      META_ID,
      [meta, home, other].map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
    );
    const spaces = createOpenSpaces({
      backend,
      metaSpaceId: META_ID,
      metaSpaceTitle: meta.document.title,
      newId: newUuid,
      history: recordingHistory(),
    });
    const initial = await spaces.open(HOME_ID);
    render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
    await act(async () => {
      await spaces.open(OTHER_ID);
      await spaces.switchTo(HOME_ID);
    });

    // Home offers Meta and Other: `referenceableSpaces` withholds only the
    // containing Space.
    await readyToAuthor();
    const before = await openThingsList();
    expect(offeredSpaces()).toHaveAccessibleName('Spaces in this Meta Space, 2');
    await closeThingsList(before);

    // Cross to Other and create a Space there — one press, which mints the Space
    // and the Thing that names it from one `Space N` (ADR 0089). Other holds
    // `Thing 1` and no `Space N`, so the new pair is called `Space 1`.
    await act(async () => {
      await spaces.switchTo(OTHER_ID);
    });
    await readyToAuthor();
    await act(async () => {
      createThing('Space Thing');
      await Promise.resolve();
    });
    await screen.findByRole('textbox', { name: 'Thing title' });

    // Back in Home, the list has to offer the Space that now exists.
    await act(async () => {
      await spaces.switchTo(HOME_ID);
    });
    await openThingsList();
    await waitFor(() =>
      expect(offeredSpaces()).toHaveAccessibleName('Spaces in this Meta Space, 3'),
    );
    expect(screen.getByRole('button', { name: 'Add Space 1 to Diagram' })).toBeInTheDocument();
  }, 15_000);
});

/** A backend whose Space list read always fails, as a dropped request would. */
class UnlistableBackend extends MemorySpaceBackend {
  override listSpaces(): Promise<never> {
    return Promise.reject(new Error('The Space list is unavailable.'));
  }
}

describe("Meta's row in the Open Spaces menu", () => {
  /**
   * Meta's row is not read from the Space list: a Space opened by its own
   * address, with Meta closed, still lists Meta first when that read fails.
   */
  it('lists a closed Meta by its title when the Space list read fails', async () => {
    const backend = new UnlistableBackend(
      META_ID,
      [meta, home, other].map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
    );
    const reported: unknown[] = [];
    const spaces = createOpenSpaces({
      backend,
      metaSpaceId: META_ID,
      metaSpaceTitle: meta.document.title,
      newId: newUuid,
      history: recordingHistory(),
      reportObserverError: (error) => reported.push(error),
    });
    const initial = await spaces.open(HOME_ID);
    render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
    await readyToAuthor();
    await waitFor(() =>
      expect(reported).toContainEqual(new Error('The Space list is unavailable.')),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Spaces. 1 open.' }));
    const rows = within(await screen.findByRole('menu')).getAllByRole('menuitemradio');
    expect(rows.map((row) => row.textContent)).toEqual(['Meta', 'Home']);
  });
});

/** A backend that cannot load the Meta Space, as a dropped request would. */
class MetaUnloadableBackend extends MemorySpaceBackend {
  override loadSpace(id: Parameters<MemorySpaceBackend['loadSpace']>[0]) {
    return id === META_ID
      ? Promise.reject(new Error('The Meta Space is unavailable.'))
      : super.loadSpace(id);
  }
}

describe('choosing a closed Meta from the Open Spaces menu', () => {
  /**
   * The row the reader chose is named by Meta's title, so a failure to open it
   * names Meta too rather than an anonymous Space.
   */
  it('names Meta by its title when it cannot be opened', async () => {
    const backend = new MetaUnloadableBackend(
      META_ID,
      [meta, home, other].map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
    );
    const reported: unknown[] = [];
    const spaces = createOpenSpaces({
      backend,
      metaSpaceId: META_ID,
      metaSpaceTitle: meta.document.title,
      newId: newUuid,
      history: recordingHistory(),
      reportObserverError: (error) => reported.push(error),
    });
    const initial = await spaces.open(HOME_ID);
    render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
    await readyToAuthor();

    fireEvent.click(screen.getByRole('button', { name: 'Spaces. 1 open.' }));
    fireEvent.click(
      within(await screen.findByRole('menu')).getByRole('menuitemradio', { name: 'Meta' }),
    );

    expect(await screen.findByText('Meta could not be opened.')).toBeInTheDocument();
    expect(screen.queryByText('That Space could not be opened.')).not.toBeInTheDocument();
  });
});

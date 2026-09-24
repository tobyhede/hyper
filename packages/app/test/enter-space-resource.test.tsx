import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { newUuid, spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend } from '@project/persistence';
import { createOpenSpaces, type OpenSpaces } from '../src/open-spaces';
import { OpenSpacesApplication } from '../src/components/OpenSpacesApplication';
import { recordingHistory } from './browser-history';
import { beginRename, dock, exitSpaceItem } from './command-dock';
import { expectMenuGroups } from './menu-assertions';
import { selectResource } from './resource-selection';

/**
 * Entering a Space Resource from its rail (ADR 0068, ADR 0073).
 *
 * This file mounts `OpenSpacesApplication`, selects the Resource — its commands
 * float in React Flow's `NodeToolbar`, drawn while it is the selected Resource —
 * and presses its Enter command. It holds the canvas swap, the selection the Resource seeds — including
 * after Open has already embedded the target — an already-open Space keeping
 * its live selection, a failed Enter reported on the Space being left, Escape
 * not exiting, and Exit then Enter seeding from the Resource again.
 */

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const META_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const META_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const META_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const META_TO_HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const META_TO_TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');

const HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const HOME_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const HOME_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000012');
const HOME_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000013');
const SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000014');

const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000020');
const SELECTED_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const SELECTED_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const OTHER_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000024');
const DRAWN_A = uuidSchema.parse('00000000-0000-4000-8000-000000000025');
const DRAWN_B = uuidSchema.parse('00000000-0000-4000-8000-000000000026');
const UNPLACED = uuidSchema.parse('00000000-0000-4000-8000-000000000027');

const target: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: TARGET_ID,
  document: {
    version: 1,
    title: 'Architecture',
    maps: [
      {
        id: SELECTED_MAP_ID,
        title: 'Collection 1',
        kind: 'positioned',
        positions: {
          [DRAWN_A]: { x: 0, y: 0, open: false },
          [DRAWN_B]: { x: 264, y: 0, open: false },
        },
        graphs: [
          { id: SELECTED_GRAPH_ID, title: 'Overview', edges: [{ from: DRAWN_A, to: DRAWN_B }] },
        ],
      },
      {
        id: OTHER_MAP_ID,
        title: 'Collection 2',
        kind: 'positioned',
        positions: { [UNPLACED]: { x: 0, y: 0, open: false } },
        graphs: [{ id: OTHER_GRAPH_ID, title: 'Second pass', edges: [] }],
      },
    ],
    defaultMap: OTHER_MAP_ID,
  },
  resources: [
    { id: DRAWN_A, document: { title: 'Intake', kind: 'markdown', body: '' } },
    { id: DRAWN_B, document: { title: 'Storage', kind: 'markdown', body: '' } },
    { id: UNPLACED, document: { title: 'Elsewhere entirely', kind: 'markdown', body: '' } },
  ],
});

const home: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: HOME_ID,
  document: {
    version: 1,
    title: 'Home',
    maps: [
      {
        id: HOME_MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [HOME_RESOURCE_ID]: { x: 10, y: 20, open: false },
          [SPACE_RESOURCE_ID]: { x: 600, y: 20, open: false },
        },
        graphs: [{ id: HOME_GRAPH_ID, title: 'Graph 1', edges: [] }],
      },
    ],
    defaultMap: HOME_MAP_ID,
  },
  resources: [
    { id: HOME_RESOURCE_ID, document: { title: 'Start here', kind: 'markdown', body: '' } },
    {
      id: SPACE_RESOURCE_ID,
      document: {
        title: 'Architecture',
        kind: 'space',
        spaceId: TARGET_ID,
        map: SELECTED_MAP_ID,
        graph: SELECTED_GRAPH_ID,
      },
    },
  ],
});

const meta: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: META_ID,
  document: {
    version: 1,
    title: 'Meta',
    maps: [
      {
        id: META_MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [META_RESOURCE_ID]: { x: 0, y: 0, open: false },
          [META_TO_HOME_ID]: { x: 300, y: 0, open: false },
          [META_TO_TARGET_ID]: { x: 600, y: 0, open: false },
        },
        graphs: [{ id: META_GRAPH_ID, title: 'Graph 1', edges: [] }],
      },
    ],
    defaultMap: META_MAP_ID,
  },
  resources: [
    { id: META_RESOURCE_ID, document: { title: 'Meta', kind: 'markdown', body: '' } },
    {
      id: META_TO_HOME_ID,
      document: {
        title: 'Home',
        kind: 'space',
        spaceId: HOME_ID,
        map: HOME_MAP_ID,
        graph: HOME_GRAPH_ID,
      },
    },
    {
      id: META_TO_TARGET_ID,
      document: {
        title: 'Architecture',
        kind: 'space',
        spaceId: TARGET_ID,
        map: OTHER_MAP_ID,
        graph: OTHER_GRAPH_ID,
      },
    },
  ],
});

const showingSpace = (): HTMLElement => within(dock()).getByTestId('space-title');

const spaceResourceDocument = (spaces: OpenSpaces) =>
  spaces
    .entry(HOME_ID)
    ?.session.getState()
    .working.resources.find((resource) => resource.id === SPACE_RESOURCE_ID)?.document;

async function mount(): Promise<OpenSpaces> {
  const backend = new MemorySpaceBackend(
    META_ID,
    [meta, home, target].map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
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
  await screen.findByRole('article', { name: 'Architecture' });
  return spaces;
}

async function openArchitectureActions(): Promise<void> {
  await selectResource('Architecture');
  fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource Architecture' }));
}

async function enterArchitecture(): Promise<void> {
  await openArchitectureActions();
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Enter' }));
  await waitFor(() => expect(showingSpace()).toHaveTextContent('Architecture'));
}

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
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

afterAll(() => vi.unstubAllGlobals());

describe('entering a Space Resource', { timeout: 15_000 }, () => {
  it('names the ordinary Space commands without a competing glyph label or tooltip', async () => {
    await mount();

    const trigger = within(dock()).getByRole('button', { name: 'Space: Home' });
    expect(trigger).toHaveAttribute('title', 'Space commands');
    expect(within(trigger).queryByRole('img')).not.toBeInTheDocument();
    expect(within(trigger).queryByTitle('Space Resource')).not.toBeInTheDocument();

    await beginRename('space-title');
    expect(screen.getByRole('textbox', { name: 'Space name' })).toHaveValue('Home');
  });

  /**
   * Rename is absent. Unlike `resource-rail-actions.test.tsx`'s isolated
   * single-Space mount, this file's `OpenSpacesApplication` composition is what
   * makes Enter reachable at all.
   */
  it('groups Create Reference, Connect, Enter and Open in New Tab, the copy links, then Remove and Delete', async () => {
    await mount();

    await openArchitectureActions();
    const menu = await screen.findByRole('menu');

    expectMenuGroups(menu, [
      ['Create Reference'],
      ['Connect to Resource'],
      ['Enter', 'Open in New Tab'],
      ['Copy link to Resource in Map', 'Copy link to Resource', 'Copy link to Space'],
      ['Remove from Map', 'Delete from Space'],
    ]);
  });

  it('adds the target to Open Spaces, shows it, and seeds the Resource’s Map and Graph', async () => {
    const spaces = await mount();

    await enterArchitecture();

    const opened = spaces.entry(TARGET_ID);
    expect(opened).toBeDefined();
    expect(spaces.getState().activeSpaceId).toBe(TARGET_ID);
    expect(opened?.app.navigation.getState()).toMatchObject({
      selectedMapId: SELECTED_MAP_ID,
      activeGraphId: SELECTED_GRAPH_ID,
    });
    expect(opened?.session.getState().working.document.defaultMap).toBe(OTHER_MAP_ID);
    // Two Spaces open and one crossing: the bar names the Space one step up
    // rather than disclosing the set (ADR 0068, ADR 0082).
    expect(within(dock()).getByRole('button', { name: 'Go to Home' })).toBeVisible();
  });

  it('seeds from the Resource after Open, because embed is not a prior Enter', async () => {
    const spaces = await mount();
    await selectResource('Architecture');
    fireEvent.click(screen.getByRole('button', { name: 'Open Resource Architecture' }));
    await waitFor(() => expect(spaces.entry(TARGET_ID)).toBeDefined());
    expect(spaces.getState().activeSpaceId).toBe(HOME_ID);

    await enterArchitecture();

    expect(spaces.entry(TARGET_ID)?.app.navigation.getState()).toMatchObject({
      selectedMapId: SELECTED_MAP_ID,
      activeGraphId: SELECTED_GRAPH_ID,
    });
  });

  it('focuses an already-open Space and keeps the live selection', async () => {
    const spaces = await mount();
    await enterArchitecture();

    const opened = spaces.entry(TARGET_ID);
    opened?.app.navigation.selectMap(OTHER_MAP_ID);
    expect(opened?.app.navigation.getState()).toMatchObject({
      selectedMapId: OTHER_MAP_ID,
      activeGraphId: OTHER_GRAPH_ID,
    });
    expect(spaceResourceDocument(spaces)).toMatchObject({
      kind: 'space',
      map: SELECTED_MAP_ID,
      graph: SELECTED_GRAPH_ID,
    });
    expect(opened?.session.getState().working.document.defaultMap).toBe(OTHER_MAP_ID);

    await spaces.switchTo(HOME_ID);
    await waitFor(() => expect(showingSpace()).toHaveTextContent('Home'));
    await screen.findByRole('article', { name: 'Architecture' });

    await enterArchitecture();

    expect(spaces.entry(TARGET_ID)).toBe(opened);
    expect(opened?.app.navigation.getState()).toMatchObject({
      selectedMapId: OTHER_MAP_ID,
      activeGraphId: OTHER_GRAPH_ID,
    });
  });

  /**
   * Drawn from command outcomes' `space-command` channel on the Space being
   * left, and put away through it.
   */
  it('reports a failed Enter on the Space being left', async () => {
    const spaces = await mount();
    vi.spyOn(spaces, 'enter').mockRejectedValueOnce(
      new Error(`The backend could not load space ${TARGET_ID}`),
    );

    await openArchitectureActions();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Enter' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Space command failed');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Architecture could not be entered.');
    expect(showingSpace()).toHaveTextContent('Home');
    expect(spaces.getState().activeSpaceId).toBe(HOME_ID);
    expect(spaces.entry(TARGET_ID)).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss: Space command failed' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('does not exit on Escape', async () => {
    await mount();
    await enterArchitecture();

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(showingSpace()).toHaveTextContent('Architecture');
  });

  it('seeds from the Resource again after Exit, because Exit destroyed the entry', async () => {
    const spaces = await mount();
    await enterArchitecture();
    spaces.entry(TARGET_ID)?.app.navigation.selectMap(OTHER_MAP_ID);

    fireEvent.click(exitSpaceItem('Architecture'));
    await waitFor(() => expect(showingSpace()).toHaveTextContent('Home'));
    expect(spaces.entry(TARGET_ID)).toBeUndefined();
    await screen.findByRole('article', { name: 'Architecture' });

    await enterArchitecture();

    expect(spaces.entry(TARGET_ID)?.app.navigation.getState()).toMatchObject({
      selectedMapId: SELECTED_MAP_ID,
      activeGraphId: SELECTED_GRAPH_ID,
    });
  });
});

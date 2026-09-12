import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { newUuid, spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend } from '@project/persistence';
import { createOpenSpaces, type OpenSpaces } from '../src/open-spaces';
import { OpenSpacesApplication } from '../src/components/OpenSpacesApplication';
import { recordingHistory } from './browser-history';
import { dock, exitSpaceItem } from './command-dock';

/**
 * Entering a Space Thing from its rail (ADR 0068, ADR 0073).
 *
 * `OpenSpaces.enter` is composed and tested; this file is the production
 * caller that ticket 11 owns — the kind command on the Thing, the canvas
 * swap, and the selection the Card seeds.
 */

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const META_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const META_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const META_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const META_TO_HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const META_TO_TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');

const HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const HOME_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const HOME_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000012');
const HOME_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000013');
const SPACE_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000014');

const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000020');
const SELECTED_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const SELECTED_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const OTHER_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000024');
const DRAWN_A = uuidSchema.parse('00000000-0000-4000-8000-000000000025');
const DRAWN_B = uuidSchema.parse('00000000-0000-4000-8000-000000000026');
const UNPLACED = uuidSchema.parse('00000000-0000-4000-8000-000000000027');

const target: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: TARGET_ID,
  document: {
    version: 1,
    title: 'Architecture',
    diagrams: [
      {
        id: SELECTED_DIAGRAM_ID,
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
        id: OTHER_DIAGRAM_ID,
        title: 'Collection 2',
        kind: 'positioned',
        positions: { [UNPLACED]: { x: 0, y: 0, open: false } },
        graphs: [{ id: OTHER_GRAPH_ID, title: 'Second pass', edges: [] }],
      },
    ],
    defaultDiagram: OTHER_DIAGRAM_ID,
  },
  things: [
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
    diagrams: [
      {
        id: HOME_DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: {
          [HOME_THING_ID]: { x: 10, y: 20, open: false },
          [SPACE_THING_ID]: { x: 600, y: 20, open: false },
        },
        graphs: [{ id: HOME_GRAPH_ID, title: 'Graph 1', edges: [] }],
      },
    ],
    defaultDiagram: HOME_DIAGRAM_ID,
  },
  things: [
    { id: HOME_THING_ID, document: { title: 'Start here', kind: 'markdown', body: '' } },
    {
      id: SPACE_THING_ID,
      document: {
        title: 'Architecture',
        kind: 'space',
        spaceId: TARGET_ID,
        diagram: SELECTED_DIAGRAM_ID,
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
    diagrams: [
      {
        id: META_DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: {
          [META_THING_ID]: { x: 0, y: 0, open: false },
          [META_TO_HOME_ID]: { x: 300, y: 0, open: false },
          [META_TO_TARGET_ID]: { x: 600, y: 0, open: false },
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
      id: META_TO_TARGET_ID,
      document: {
        title: 'Architecture',
        kind: 'space',
        spaceId: TARGET_ID,
        diagram: OTHER_DIAGRAM_ID,
        graph: OTHER_GRAPH_ID,
      },
    },
  ],
});

const showingSpace = (): HTMLElement => within(dock()).getByTestId('space-title');

async function mount(): Promise<OpenSpaces> {
  const backend = new MemorySpaceBackend(
    META_ID,
    [meta, home, target].map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
  );
  const spaces = createOpenSpaces({
    backend,
    metaSpaceId: META_ID,
    newId: newUuid,
    history: recordingHistory(),
  });
  const initial = await spaces.open(HOME_ID);
  render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
  await screen.findByRole('button', { name: 'Enter Space Architecture' });
  return spaces;
}

async function enterArchitecture(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Enter Space Architecture' }));
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

describe('entering a Space Thing', { timeout: 15_000 }, () => {
  it('adds the target to Open Spaces, shows it, and seeds the Card’s Diagram and Graph', async () => {
    const spaces = await mount();

    await enterArchitecture();

    const opened = spaces.entry(TARGET_ID);
    expect(opened).toBeDefined();
    expect(spaces.getState().activeSpaceId).toBe(TARGET_ID);
    expect(opened?.app.navigation.getState()).toMatchObject({
      selectedDiagramId: SELECTED_DIAGRAM_ID,
      activeGraphId: SELECTED_GRAPH_ID,
    });
    expect(opened?.session.getState().working.document.defaultDiagram).toBe(OTHER_DIAGRAM_ID);
    // Two Spaces open and one crossing: the bar names the Space one step up
    // rather than disclosing the set (ADR 0068, ADR 0082).
    expect(within(dock()).getByRole('button', { name: 'Go to Home' })).toBeVisible();
  });

  it('focuses an already-open Space and keeps the live selection', async () => {
    const spaces = await mount();
    await enterArchitecture();

    const opened = spaces.entry(TARGET_ID);
    opened?.app.navigation.selectDiagram(OTHER_DIAGRAM_ID);
    expect(opened?.app.navigation.getState()).toMatchObject({
      selectedDiagramId: OTHER_DIAGRAM_ID,
      activeGraphId: OTHER_GRAPH_ID,
    });

    await spaces.switchTo(HOME_ID);
    await waitFor(() => expect(showingSpace()).toHaveTextContent('Home'));
    await screen.findByRole('button', { name: 'Enter Space Architecture' });

    await enterArchitecture();

    expect(spaces.entry(TARGET_ID)).toBe(opened);
    expect(opened?.app.navigation.getState()).toMatchObject({
      selectedDiagramId: OTHER_DIAGRAM_ID,
      activeGraphId: OTHER_GRAPH_ID,
    });
  });

  it('does not exit on Escape', async () => {
    await mount();
    await enterArchitecture();

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(showingSpace()).toHaveTextContent('Architecture');
  });

  it('seeds from the Card again after Exit, because Exit destroyed the entry', async () => {
    const spaces = await mount();
    await enterArchitecture();
    spaces.entry(TARGET_ID)?.app.navigation.selectDiagram(OTHER_DIAGRAM_ID);

    fireEvent.click(exitSpaceItem('Architecture'));
    await waitFor(() => expect(showingSpace()).toHaveTextContent('Home'));
    expect(spaces.entry(TARGET_ID)).toBeUndefined();
    await screen.findByRole('button', { name: 'Enter Space Architecture' });

    await enterArchitecture();

    expect(spaces.entry(TARGET_ID)?.app.navigation.getState()).toMatchObject({
      selectedDiagramId: SELECTED_DIAGRAM_ID,
      activeGraphId: SELECTED_GRAPH_ID,
    });
  });
});

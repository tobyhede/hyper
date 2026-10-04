import { describe, expect, it, vi } from 'vitest';
import { newUuid, uuidSchema, type SpaceSnapshot, type ResourceDocument } from '@project/core';
import { GRAPH_PALETTE } from '@project/graph';
import { MemorySpaceBackend, MemorySpaceBackendTestControl } from '@project/persistence';
import { createOpenSpaces } from '../src/open-spaces';
import { spaceResourceContextCommands } from '../src/space-resource-context-commands';
import { recordingHistory } from './browser-history';
import { unusedImageSources } from './image-sources';
import { CANVAS } from '../src/space-authoring';

const id = (suffix: string) =>
  uuidSchema.parse(`00000000-0000-4000-8000-${suffix.padStart(12, '0')}`);
const META = id('1');
const TARGET = id('2');
const RESOURCE = id('3');
const META_MAP = id('4');
const FIRST_MAP = id('5');
const SECOND_MAP = id('6');
const META_GRAPH = id('7');
const FIRST_GRAPH = id('8');
const SECOND_GRAPH = id('9');
const SURVIVOR_GRAPH = id('10');
const OTHER_META_MAP = id('11');
const OTHER_META_GRAPH = id('12');

const document: Extract<ResourceDocument, { kind: 'space' }> = {
  kind: 'space',
  title: 'Target',
  spaceId: TARGET,
  map: SECOND_MAP,
  graph: SECOND_GRAPH,
};
const meta: SpaceSnapshot = {
  id: META,
  document: {
    version: 1,
    title: 'Meta',
    defaultMap: META_MAP,
    maps: [
      {
        id: META_MAP,
        title: 'Meta Map',
        kind: 'positioned',
        positions: { [RESOURCE]: { x: 0, y: 0, open: false } },
        graphs: [{ id: META_GRAPH, title: 'Meta Graph', edges: [] }],
      },
      {
        id: OTHER_META_MAP,
        title: 'Other Meta Map',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: OTHER_META_GRAPH, title: 'Other Meta Graph', edges: [] }],
      },
    ],
  },
  resources: [{ id: RESOURCE, document }],
};
const target: SpaceSnapshot = {
  id: TARGET,
  document: {
    version: 1,
    title: 'Target',
    defaultMap: FIRST_MAP,
    maps: [
      {
        id: FIRST_MAP,
        title: 'First',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: FIRST_GRAPH, title: 'First Graph', edges: [] }],
      },
      {
        id: SECOND_MAP,
        title: 'Second',
        kind: 'positioned',
        positions: {},
        activeGraph: SECOND_GRAPH,
        graphs: [
          { id: SECOND_GRAPH, title: 'Delete me', edges: [] },
          { id: SURVIVOR_GRAPH, title: 'Keep me', edges: [] },
        ],
      },
    ],
  },
  resources: [],
};

async function setup(available = true) {
  const control = new MemorySpaceBackendTestControl();
  const backend = new MemorySpaceBackend(
    META,
    [meta, target].map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
    control,
  );
  const spaces = createOpenSpaces({
    images: unusedImageSources,
    backend,
    metaSpaceId: META,
    metaSpaceTitle: meta.document.title,
    newId: newUuid,
    history: recordingHistory(),
  });
  const source = await spaces.open(META);
  const { entry } = await spaces.hold(TARGET);
  const commands = spaceResourceContextCommands(
    {
      entry,
      continuation: source.app.continuation,
      spaces,
      containingSpaceId: META,
      deleteConfirmation: source.app.deleteConfirmation,
    },
    document,
    (m, graph) => {
      const result = source.app.authoring.complete(CANVAS, {
        kind: 'edited-resource',
        resourceId: RESOURCE,
        document: { ...document, map: m.id, graph },
      });
      return result.kind === 'refused' ? result.refusal.code : null;
    },
    () => available,
  );
  return { backend, spaces, commands, source, control, entry };
}

/** A press the rail offers, which the test needs to be offered. */
const offeredPress = <Press>(press: Press | null): Press => {
  if (press === null) throw new Error('The rail offered no such command.');
  return press;
};

/**
 * Each Map command is one field — its press, or `null` — built from the Map
 * authoring capability that answers it, so the rail cannot draw a command
 * available that invoking would answer unavailable.
 */
describe('the rail’s Map commands', () => {
  it('offers each Map command its capability answers available', async () => {
    const { commands } = await setup();

    expect(commands.mapCommands.onRename).not.toBeNull();
    expect(commands.mapCommands.onCreate).not.toBeNull();
    expect(commands.mapCommands.onDelete).not.toBeNull();
  });

  it('offers none of them while the rail is withdrawn', async () => {
    const { commands } = await setup(false);

    expect(commands.mapCommands.onRename).toBeNull();
    expect(commands.mapCommands.onCreate).toBeNull();
    expect(commands.mapCommands.onDelete).toBeNull();
  });
});

/**
 * The Graph commands are built the same way, from Graph authoring's
 * capabilities; what the rail adds is the colour its row line draws, and that
 * it never continues into a new Graph's name.
 */
describe('the rail’s Graph commands', () => {
  it('offers each Graph command its capability answers available', async () => {
    const { commands } = await setup();

    const graphCommands = commands.graphCommands;
    if (graphCommands === undefined) throw new Error('Commands missing');
    expect(graphCommands.onRename).not.toBeNull();
    expect(graphCommands.onRecolor).not.toBeNull();
    expect(graphCommands.onCreate).not.toBeNull();
    expect(graphCommands.onDelete).not.toBeNull();
  });

  it('offers none of them while the rail is withdrawn', async () => {
    const { commands } = await setup(false);

    expect(commands.graphCommands).toMatchObject({
      onRename: null,
      onRecolor: null,
      onCreate: null,
      onDelete: null,
    });
  });

  it('marks as current the colour the Graph’s row line draws, for a Graph that stores none', async () => {
    const { commands } = await setup();

    // SECOND_GRAPH stores no colour and is the target's second Graph, so the
    // Map draws it — and its row line resolves it — as the second slot.
    expect(commands.graphCommands?.color).toBe(GRAPH_PALETTE[1]);
  });

  it('leaves the caret where it was after a new Graph', async () => {
    const { commands, source } = await setup();
    const graphCommands = commands.graphCommands;
    if (graphCommands === undefined) throw new Error('Commands missing');

    expect(await offeredPress(graphCommands.onCreate)('test-rail')).toBe(false);
    expect(source.app.continuation.getState().pending).toBeNull();
  });
});

/**
 * The rail's Delete Map and Delete Graph ask first, through the containing
 * canvas's confirmation and in the Dock's words; Cancel runs nothing.
 */
describe('the rail’s deletions', () => {
  it('asks before deleting the Map it shows, and Cancel leaves it', async () => {
    const { commands, source, entry } = await setup();
    offeredPress(commands.mapCommands.onDelete)(() => null);

    expect(source.app.deleteConfirmation.getState().pending).toMatchObject({
      subject: { kind: 'map', name: 'Second' },
      from: 'Space',
    });
    source.app.deleteConfirmation.cancel();
    expect(source.app.deleteConfirmation.getState().pending).toBeNull();
    expect(entry.app.currentSpace().maps.map((m) => m.id)).toEqual([FIRST_MAP, SECOND_MAP]);
  });

  it('asks before deleting the Graph it shows, and Delete deletes it', async () => {
    const { commands, source, entry } = await setup();
    offeredPress(commands.graphCommands?.onDelete ?? null)(() => null);

    expect(source.app.deleteConfirmation.getState().pending).toMatchObject({
      subject: { kind: 'graph', name: 'Delete me' },
      from: 'Second',
    });
    expect(entry.app.currentSpace().lookup.map(SECOND_MAP)?.map.graphs).toHaveLength(2);
    source.app.deleteConfirmation.confirm();
    await vi.waitFor(() => expect(source.app.deleteConfirmation.getState().pending).toBeNull());
    expect(
      entry.app
        .currentSpace()
        .lookup.map(SECOND_MAP)
        ?.map.graphs.map((graph) => graph.id),
    ).toEqual([SURVIVOR_GRAPH]);
  });
});

describe('persisting a Space Resource context command', () => {
  it('persists Map deletion after moving the stored referring Resource', async () => {
    const { backend, spaces, commands, source } = await setup();
    offeredPress(commands.mapCommands.onDelete)(() => null);
    source.app.deleteConfirmation.confirm();
    await vi.waitFor(() => expect(source.app.deleteConfirmation.getState().pending).toBeNull());
    await spaces.waitForPersistence(META);
    await spaces.waitForPersistence(TARGET);
    const loaded = await backend.loadSpace(TARGET);
    expect(loaded?.snapshot.document.maps?.map((m) => m.id)).toEqual([FIRST_MAP]);
  });
});

it('persists a new Map before the Resource refers to it', async () => {
  const { backend, spaces, commands, source, control } = await setup();
  const release = control.deferNextCommit();
  const creating = offeredPress(commands.mapCommands.onCreate)('test-rail');
  try {
    await vi.waitFor(() => expect(control.requests).toHaveLength(1));
    expect(source.session.getState().working.resources[0]?.document).toEqual(document);
  } finally {
    release();
  }
  // The rail's New Map continues in the new Map's name.
  expect(await creating).toBe(true);
  expect(source.app.continuation.getState().pending).toMatchObject({
    target: { kind: 'control', name: 'map-name', scope: { id: 'test-rail' } },
    then: 'rename',
  });
  expect(spaces.entry(TARGET)?.app.continuation.getState().pending).toBeNull();
  expect(await spaces.waitForPersistence(META)).toBe(true);
  expect(await spaces.waitForPersistence(TARGET)).toBe(true);
  const stored = await backend.loadSpace(META);
  expect(stored?.snapshot.resources[0]?.document).not.toEqual(document);
});

/**
 * The rail's New Map authors in the target and never moves the containing
 * canvas, so its completion is held to the containing Map it was pressed on:
 * once the author has moved that canvas to another Map, the completion is
 * discarded and the caret is sent nowhere.
 */
it('discards a rail New Map that completes after the containing canvas moved Map', async () => {
  const { commands, source, control } = await setup();
  const release = control.deferNextCommit();
  const creating = offeredPress(commands.mapCommands.onCreate)('test-rail');
  try {
    await vi.waitFor(() => expect(control.requests).toHaveLength(1));
    source.app.navigation.selectMap(OTHER_META_MAP);
  } finally {
    release();
  }

  expect(await creating).toBe(false);
  expect(source.app.continuation.getState().pending).toBeNull();
});

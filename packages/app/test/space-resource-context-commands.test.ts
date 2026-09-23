import { describe, expect, it, vi } from 'vitest';
import { newUuid, uuidSchema, type SpaceSnapshot, type ResourceDocument } from '@project/core';
import { MemorySpaceBackend, MemorySpaceBackendTestControl } from '@project/persistence';
import { completeEmbeddedAuthoring } from '../src/embedded-authoring';
import { createOpenSpaces } from '../src/open-spaces';
import { spaceResourceContextCommands } from '../src/space-resource-context-commands';
import { recordingHistory } from './browser-history';

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
    backend,
    metaSpaceId: META,
    metaSpaceTitle: meta.document.title,
    newId: newUuid,
    history: recordingHistory(),
  });
  const source = await spaces.open(META);
  const entry = await spaces.embed(TARGET);
  const commands = spaceResourceContextCommands(
    {
      entry,
      spaces,
      containingSpaceId: META,
      commandOutcomes: source.app.commandOutcomes,
      complete: (completion) =>
        completeEmbeddedAuthoring(entry, document.map, completion, entry.app.reportObserverError),
    },
    document,
    (map, graph) => {
      const result = source.app.authoring.complete({
        kind: 'edited-resource',
        resourceId: RESOURCE,
        document: { ...document, map: map.id, graph },
      });
      return result.kind === 'refused' ? result.refusal.code : null;
    },
    () => available,
  );
  return { backend, spaces, commands, source, control };
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

describe('persisting a Space Resource context command', () => {
  it('persists Map deletion after moving the stored referring Resource', async () => {
    const { backend, spaces, commands } = await setup();
    await offeredPress(commands.mapCommands.onDelete)();
    await spaces.waitForPersistence(META);
    await spaces.waitForPersistence(TARGET);
    const loaded = await backend.loadSpace(TARGET);
    expect(loaded?.snapshot.document.maps?.map((map) => map.id)).toEqual([FIRST_MAP]);
  });

  it('persists Graph deletion after moving the stored referring Resource', async () => {
    const { backend, spaces, commands } = await setup();
    expect(commands.graphCommands).toBeDefined();
    expect(await commands.graphCommands?.onDelete()).toBeNull();
    await spaces.waitForPersistence(META);
    await spaces.waitForPersistence(TARGET);
    const loaded = await backend.loadSpace(TARGET);
    expect(
      loaded?.snapshot.document.maps
        ?.find((map) => map.id === SECOND_MAP)
        ?.graphs.map((graph) => graph.id),
    ).toEqual([SURVIVOR_GRAPH]);
  });
});

it.each(['map', 'graph'] as const)(
  'persists a new %s before the Resource refers to it',
  async (kind) => {
    const { backend, spaces, commands, source, control } = await setup();
    const release = control.deferNextCommit();
    const graphCommands = commands.graphCommands;
    if (graphCommands === undefined) throw new Error('Commands missing');
    // A Map creation answers whether the caret continues in its name; a
    // Graph creation answers the sentence the rail reports.
    const creating =
      kind === 'map'
        ? offeredPress(commands.mapCommands.onCreate)('test-rail')
        : graphCommands.onCreate('test-rail');
    try {
      await vi.waitFor(() => expect(control.requests).toHaveLength(1));
      expect(source.session.getState().working.resources[0]?.document).toEqual(document);
    } finally {
      release();
    }
    expect(await creating).toBe(kind === 'map' ? true : null);
    expect(await spaces.waitForPersistence(META)).toBe(true);
    expect(await spaces.waitForPersistence(TARGET)).toBe(true);
    const stored = await backend.loadSpace(META);
    expect(stored?.snapshot.resources[0]?.document).not.toEqual(document);
  },
);

import { describe, expect, it } from 'vitest';
import {
  newUuid,
  uuidSchema,
  type MapId,
  type ResourceDocument,
  type SpaceSnapshot,
} from '@project/core';
import { MemorySpaceBackend } from '@project/persistence';
import type { CommandOutcomes } from '../src/command-outcomes';
import {
  embeddedMapAuthoringCommands,
  renameDraftAnswer,
  topLevelMapAuthoringCommands,
  type MapAuthoringCommands,
} from '../src/map-authoring-commands';
import { createOpenSpaces, type OpenSpace } from '../src/open-spaces';
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
        graphs: [{ id: SECOND_GRAPH, title: 'Second Graph', edges: [] }],
      },
    ],
  },
  resources: [],
};

const openSpaces = () =>
  createOpenSpaces({
    backend: new MemorySpaceBackend(
      META,
      [meta, target].map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
    ),
    metaSpaceId: META,
    metaSpaceTitle: meta.document.title,
    newId: newUuid,
    history: recordingHistory(),
  });

/** One context, as far as the contract needs to drive it. */
interface ContractContext {
  /** The Space whose Map the context authors. */
  readonly authored: OpenSpace;
  /** Where the surface drawing this context reports. */
  readonly outcomes: CommandOutcomes;
  /** The Map the surface addresses. */
  readonly mapId: MapId;
  readonly commands: MapAuthoringCommands;
  readonly withdraw: () => void;
}

const titleOf = (space: OpenSpace, mapId: MapId): string | undefined =>
  space.app.currentSpace().lookup.map(mapId)?.map.title;

const publicationsOf = (space: OpenSpace) => {
  let count = 0;
  space.app.authoring.subscribe(() => {
    count += 1;
  });
  return { count: () => count };
};

const contexts: readonly {
  readonly name: string;
  readonly setup: () => Promise<ContractContext>;
}[] = [
  {
    name: 'the top-level Space',
    setup: async () => {
      const spaces = openSpaces();
      const authored = await spaces.open(TARGET);
      let available = true;
      return {
        authored,
        outcomes: authored.app.commandOutcomes,
        mapId: FIRST_MAP,
        commands: topLevelMapAuthoringCommands(authored.app, () => available),
        withdraw: () => {
          available = false;
        },
      };
    },
  },
  {
    name: 'an embedded Space Resource',
    setup: async () => {
      const spaces = openSpaces();
      const source = await spaces.open(META);
      const authored = await spaces.embed(TARGET);
      let available = true;
      return {
        authored,
        outcomes: source.app.commandOutcomes,
        mapId: document.map,
        commands: embeddedMapAuthoringCommands(authored, spaces, () => available),
        withdraw: () => {
          available = false;
        },
      };
    },
  },
];

describe.each(contexts)('Map rename through $name', ({ setup }) => {
  it('completes the rename', async () => {
    const { authored, mapId, commands } = await setup();
    const rename = commands.map(mapId).rename;
    expect(rename.available).toBe(true);
    expect(rename.invoke('Renamed')).toEqual({ kind: 'completed' });
    expect(titleOf(authored, mapId)).toBe('Renamed');
  });

  it('answers a rename to the stored title as unchanged', async () => {
    const { authored, mapId, commands } = await setup();
    const stored = titleOf(authored, mapId) ?? '';
    expect(commands.map(mapId).rename.invoke(stored)).toEqual({ kind: 'unchanged' });
  });

  it('answers a refusal with the complete Map report', async () => {
    const { authored, mapId, commands } = await setup();
    const before = titleOf(authored, mapId);
    expect(commands.map(mapId).rename.invoke('  ')).toEqual({
      kind: 'refused',
      report: { title: 'Map unchanged', message: 'A Map title is required.' },
    });
    expect(titleOf(authored, mapId)).toBe(before);
  });

  it('answers a stale invocation as unavailable without authoring anything', async () => {
    const { authored, mapId, commands, withdraw } = await setup();
    const rename = commands.map(mapId).rename;
    const working = authored.session.getState().working;
    const publications = publicationsOf(authored);
    withdraw();
    expect(rename.invoke('Renamed')).toEqual({ kind: 'unavailable' });
    expect(publications.count()).toBe(0);
    expect(authored.session.getState().working).toBe(working);
    expect(commands.map(mapId).rename.available).toBe(false);
  });

  it('answers a rename of a Map that has gone as unavailable', async () => {
    const { authored, mapId, commands } = await setup();
    const rename = commands.map(mapId).rename;
    expect(authored.app.authoring.complete({ kind: 'deleted-map', mapId }).kind).toBe('completed');
    const publications = publicationsOf(authored);
    expect(rename.invoke('Renamed')).toEqual({ kind: 'unavailable' });
    expect(publications.count()).toBe(0);
    expect(commands.map(mapId).rename.available).toBe(false);
  });

  it('leaves the refused report for command outcomes to hold, and nothing for unavailable', async () => {
    const { mapId, commands, outcomes, withdraw } = await setup();
    const refused = outcomes.run('map-manage', () => commands.map(mapId).rename.invoke(''));
    expect(renameDraftAnswer(refused)).toBe('A Map title is required.');
    expect(outcomes.getState().notices.get('map-manage')).toEqual({
      title: 'Map unchanged',
      message: 'A Map title is required.',
    });
    outcomes.dismiss('map-manage');
    expect(outcomes.getState().notices.has('map-manage')).toBe(false);

    withdraw();
    const stale = outcomes.run('map-manage', () => commands.map(mapId).rename.invoke(''));
    expect(stale).toEqual({ kind: 'unavailable' });
    expect(renameDraftAnswer(stale)).toBeNull();
    expect(outcomes.getState().notices.has('map-manage')).toBe(false);
  });
});

describe('what each context addresses', () => {
  it('does not rename a Map the top-level canvas has moved off', async () => {
    const spaces = openSpaces();
    const authored = await spaces.open(TARGET);
    const commands = topLevelMapAuthoringCommands(authored.app, () => true);
    expect(commands.map(SECOND_MAP).rename.available).toBe(false);
    expect(commands.map(SECOND_MAP).rename.invoke('Renamed')).toEqual({ kind: 'unavailable' });
    expect(titleOf(authored, SECOND_MAP)).toBe('Second');
  });

  it('renames any Map of an embedded target without moving its canvas', async () => {
    const spaces = openSpaces();
    await spaces.open(META);
    const authored = await spaces.embed(TARGET);
    const commands = embeddedMapAuthoringCommands(authored, spaces, () => true);
    expect(commands.map(SECOND_MAP).rename.invoke('Renamed')).toEqual({ kind: 'completed' });
    expect(titleOf(authored, SECOND_MAP)).toBe('Renamed');
    expect(authored.app.navigation.getState().selectedMapId).toBe(FIRST_MAP);
  });

  it('does not rename through an embedded target that has been exited', async () => {
    const spaces = openSpaces();
    await spaces.open(META);
    const authored = await spaces.embed(TARGET);
    const commands = embeddedMapAuthoringCommands(authored, spaces, () => true);
    const rename = commands.map(SECOND_MAP).rename;
    await spaces.exit(TARGET);
    expect(spaces.entry(TARGET)).toBeUndefined();
    expect(rename.invoke('Renamed')).toEqual({ kind: 'unavailable' });
  });
});

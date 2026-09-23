import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  newUuid,
  uuidSchema,
  type GraphId,
  type MapId,
  type ResourceDocument,
  type SpaceSnapshot,
} from '@project/core';
import { MemorySpaceBackend, MemorySpaceBackendTestControl } from '@project/persistence';
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

const openSpaces = (control?: MemorySpaceBackendTestControl) =>
  createOpenSpaces({
    backend: new MemorySpaceBackend(
      META,
      [meta, target].map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
      control,
    ),
    metaSpaceId: META,
    metaSpaceTitle: meta.document.title,
    newId: newUuid,
    history: recordingHistory(),
  });

const PERSISTENCE_UNSETTLED = 'The change could not be saved. Check the Space persistence status.';

/**
 * The Space Resource selection write an embedded rail makes: an Edit on the
 * containing Space naming the Map and Graph the Resource now shows.
 */
const selectOn =
  (source: OpenSpace) =>
  (mapId: MapId, graphId: GraphId): string | null => {
    const result = source.app.authoring.complete({
      kind: 'edited-resource',
      resourceId: RESOURCE,
      document: { ...document, map: mapId, graph: graphId },
    });
    return result.kind === 'refused' ? result.refusal.code : null;
  };

const storedSelection = (source: OpenSpace) => {
  const stored = source.session.getState().working.resources[0]?.document;
  return stored?.kind === 'space' ? { map: stored.map, graph: stored.graph } : undefined;
};

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
        commands: topLevelMapAuthoringCommands(authored.app, {
          rename: () => available,
          create: () => available,
        }),
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
        commands: embeddedMapAuthoringCommands({
          target: authored,
          spaces,
          containingSpaceId: META,
          select: selectOn(source),
          available: () => available,
        }),
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
    const commands = topLevelMapAuthoringCommands(authored.app, {
      rename: () => true,
      create: () => true,
    });
    expect(commands.map(SECOND_MAP).rename.available).toBe(false);
    expect(commands.map(SECOND_MAP).rename.invoke('Renamed')).toEqual({ kind: 'unavailable' });
    expect(titleOf(authored, SECOND_MAP)).toBe('Second');
  });

  it('renames any Map of an embedded target without moving its canvas', async () => {
    const spaces = openSpaces();
    const source = await spaces.open(META);
    const authored = await spaces.embed(TARGET);
    const commands = embeddedMapAuthoringCommands({
      target: authored,
      spaces,
      containingSpaceId: META,
      select: selectOn(source),
      available: () => true,
    });
    expect(commands.map(SECOND_MAP).rename.invoke('Renamed')).toEqual({ kind: 'completed' });
    expect(titleOf(authored, SECOND_MAP)).toBe('Renamed');
    expect(authored.app.navigation.getState().selectedMapId).toBe(FIRST_MAP);
  });

  it('does not rename through an embedded target that has been exited', async () => {
    const spaces = openSpaces();
    const source = await spaces.open(META);
    const authored = await spaces.embed(TARGET);
    const commands = embeddedMapAuthoringCommands({
      target: authored,
      spaces,
      containingSpaceId: META,
      select: selectOn(source),
      available: () => true,
    });
    const rename = commands.map(SECOND_MAP).rename;
    await spaces.exit(TARGET);
    expect(spaces.entry(TARGET)).toBeUndefined();
    expect(rename.invoke('Renamed')).toEqual({ kind: 'unavailable' });
  });
});

const mapsOf = (space: OpenSpace): readonly MapId[] =>
  space.app.currentSpace().maps.map((map) => map.id);

describe.each(contexts)('Map creation through $name', ({ setup }) => {
  it('creates one empty Map and answers its Map and Active Graph', async () => {
    const { authored, commands } = await setup();
    const before = mapsOf(authored);
    expect(commands.create.available).toBe(true);
    const outcome = await commands.create.invoke();
    if (outcome.kind !== 'completed') throw new Error(`Map creation answered ${outcome.kind}`);
    expect(mapsOf(authored)).toEqual([...before, outcome.mapId]);
    const created = authored.app.currentSpace().lookup.map(outcome.mapId)?.map;
    expect(created?.positions).toEqual({});
    expect(created?.graphs.map((graph) => graph.id)).toEqual([outcome.graphId]);
    expect(created?.activeGraph).toBe(outcome.graphId);
  });

  it('answers a stale invocation as unavailable without authoring anything', async () => {
    const { authored, commands, outcomes, withdraw } = await setup();
    const create = commands.create;
    const working = authored.session.getState().working;
    const publications = publicationsOf(authored);
    withdraw();
    expect(await outcomes.run('map-create', () => create.invoke())).toEqual({
      kind: 'unavailable',
    });
    expect(publications.count()).toBe(0);
    expect(authored.session.getState().working).toBe(working);
    expect(commands.create.available).toBe(false);
    expect(outcomes.getState().notices.has('map-create')).toBe(false);
  });

  it('answers a refused creation with the complete Map report, which command outcomes holds', async () => {
    const { authored, commands, outcomes } = await setup();
    const before = mapsOf(authored);
    vi.spyOn(authored.app.authoring, 'complete').mockReturnValueOnce({
      kind: 'refused',
      refusal: { code: 'map-not-found' },
    });
    const report = {
      title: 'Map not created',
      message: 'This Map is no longer part of the Space.',
    };
    expect(await outcomes.run('map-create', () => commands.create.invoke())).toEqual({
      kind: 'refused',
      report,
    });
    expect(mapsOf(authored)).toEqual(before);
    expect(outcomes.getState().notices.get('map-create')).toEqual(report);
    outcomes.dismiss('map-create');
    expect(outcomes.getState().notices.has('map-create')).toBe(false);
  });

  it('answers an unchanged creation as unchanged', async () => {
    const { authored, commands } = await setup();
    vi.spyOn(authored.app.authoring, 'complete').mockReturnValueOnce({ kind: 'unchanged' });
    expect(await commands.create.invoke()).toEqual({ kind: 'unchanged' });
  });

  it('breaks rather than answering when a queued creation leaves no identities to recover', async () => {
    const { authored, commands } = await setup();
    vi.spyOn(authored.app.authoring, 'complete').mockReturnValueOnce({ kind: 'queued' });
    await expect(commands.create.invoke()).rejects.toThrow(/queued/);
  });
});

describe('what each context creates in', () => {
  it('selects the created Map on the top-level canvas', async () => {
    const spaces = openSpaces();
    const authored = await spaces.open(TARGET);
    const commands = topLevelMapAuthoringCommands(authored.app, {
      rename: () => true,
      create: () => true,
    });
    const outcome = await commands.create.invoke();
    if (outcome.kind !== 'completed') throw new Error(`Map creation answered ${outcome.kind}`);
    expect(authored.app.navigation.getState()).toMatchObject({
      selectedMapId: outcome.mapId,
      activeGraphId: outcome.graphId,
    });
  });

  it('creates nothing when only rename is available at the top level', async () => {
    const spaces = openSpaces();
    const authored = await spaces.open(TARGET);
    const commands = topLevelMapAuthoringCommands(authored.app, {
      rename: () => true,
      create: () => false,
    });
    expect(commands.create.available).toBe(false);
    expect(commands.map(FIRST_MAP).rename.available).toBe(true);
    expect(await commands.create.invoke()).toEqual({ kind: 'unavailable' });
    expect(mapsOf(authored)).toEqual([FIRST_MAP, SECOND_MAP]);
  });

  it('points the embedding Space Resource at the created Map once both Spaces have saved', async () => {
    const control = new MemorySpaceBackendTestControl();
    const spaces = openSpaces(control);
    const source = await spaces.open(META);
    const authored = await spaces.embed(TARGET);
    const commands = embeddedMapAuthoringCommands({
      target: authored,
      spaces,
      containingSpaceId: META,
      select: selectOn(source),
      available: () => true,
    });
    const release = control.deferNextCommit();
    const creating = commands.create.invoke();
    try {
      // The target's commit is held: the Resource must not name a Map that
      // has not been stored.
      await vi.waitFor(() => expect(control.requests).toHaveLength(1));
      expect(storedSelection(source)).toEqual({ map: SECOND_MAP, graph: SECOND_GRAPH });
    } finally {
      release();
    }
    const outcome = await creating;
    if (outcome.kind !== 'completed') throw new Error(`Map creation answered ${outcome.kind}`);
    expect(storedSelection(source)).toEqual({ map: outcome.mapId, graph: outcome.graphId });
    expect(await spaces.waitForPersistence(META)).toBe(true);
    // The containing canvas stays on its own Map.
    expect(source.app.navigation.getState().selectedMapId).toBe(META_MAP);
  });

  it('creates nothing while the containing Space has not saved, and reports a Map not created', async () => {
    const control = new MemorySpaceBackendTestControl();
    const spaces = openSpaces(control);
    const source = await spaces.open(META);
    const authored = await spaces.embed(TARGET);
    const commands = embeddedMapAuthoringCommands({
      target: authored,
      spaces,
      containingSpaceId: META,
      select: selectOn(source),
      available: () => true,
    });
    control.throwNext(new Error('offline'));
    expect(
      source.app.authoring.complete({ kind: 'renamed-map', mapId: META_MAP, title: 'Renamed' })
        .kind,
    ).toBe('completed');
    const before = mapsOf(authored);
    expect(await commands.create.invoke()).toEqual({
      kind: 'refused',
      report: { title: 'Map not created', message: PERSISTENCE_UNSETTLED },
    });
    expect(mapsOf(authored)).toEqual(before);
  });

  it('reports a target that did not save as a Map not saved, and leaves the Resource alone', async () => {
    const control = new MemorySpaceBackendTestControl();
    const spaces = openSpaces(control);
    const source = await spaces.open(META);
    const authored = await spaces.embed(TARGET);
    const commands = embeddedMapAuthoringCommands({
      target: authored,
      spaces,
      containingSpaceId: META,
      select: selectOn(source),
      available: () => true,
    });
    control.throwNext(new Error('offline'));
    expect(await commands.create.invoke()).toEqual({
      kind: 'refused',
      report: { title: 'Map not saved', message: PERSISTENCE_UNSETTLED },
    });
    expect(storedSelection(source)).toEqual({ map: SECOND_MAP, graph: SECOND_GRAPH });
  });

  it('reports a refused selection write as a Map created but not selected', async () => {
    const spaces = openSpaces();
    await spaces.open(META);
    const authored = await spaces.embed(TARGET);
    const commands = embeddedMapAuthoringCommands({
      target: authored,
      spaces,
      containingSpaceId: META,
      select: () => 'The selection is invalid.',
      available: () => true,
    });
    const before = mapsOf(authored);
    expect(await commands.create.invoke()).toEqual({
      kind: 'refused',
      report: { title: 'Map not selected', message: 'The selection is invalid.' },
    });
    expect(mapsOf(authored)).toHaveLength(before.length + 1);
  });

  it('creates nothing in an embedded target exited while its Spaces were saving', async () => {
    const spaces = openSpaces();
    const source = await spaces.open(META);
    const authored = await spaces.embed(TARGET);
    const commands = embeddedMapAuthoringCommands({
      target: authored,
      spaces,
      containingSpaceId: META,
      select: selectOn(source),
      available: () => true,
    });
    const before = authored.session.getState().working;
    const creating = commands.create.invoke();
    await spaces.exit(TARGET);
    expect(await creating).toEqual({ kind: 'unavailable' });
    expect(authored.session.getState().working).toBe(before);
  });
});

describe('the Map authoring module', () => {
  it('imports no continuation, React or DOM: where the caret goes is the surface’s', () => {
    const source = readFileSync(new URL('../src/map-authoring-commands.ts', import.meta.url), {
      encoding: 'utf8',
    });
    expect(source).not.toMatch(/from ['"]\.\/continuation['"]/);
    expect(source).not.toMatch(/from ['"]react(-dom)?(\/[^'"]*)?['"]/);
    expect(source).not.toMatch(/\b(document|window)\./);
  });
});

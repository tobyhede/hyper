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
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  type ObserverErrorReporter,
} from '@project/persistence';
import { renameDraftAnswer } from '../src/authoring-commands';
import type { CommandOutcomes } from '../src/command-outcomes';
import {
  embeddedGraphAuthoringCommands,
  topLevelGraphAuthoringCommands,
  type GraphAuthoringCommands,
} from '../src/graph-authoring-commands';
import { createOpenSpaces, type OpenSpace } from '../src/open-spaces';
import type { AuthoringResult } from '../src/space-authoring';
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
const OTHER_GRAPH = id('10');

const SECOND_COLOR = '#aa0000';
const OTHER_COLOR = '#00aa00';

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
        activeGraph: FIRST_GRAPH,
        graphs: [
          { id: FIRST_GRAPH, title: 'First Graph', color: SECOND_COLOR, edges: [] },
          { id: OTHER_GRAPH, title: 'Other Graph', edges: [] },
        ],
      },
      {
        id: SECOND_MAP,
        title: 'Second',
        kind: 'positioned',
        positions: {},
        activeGraph: SECOND_GRAPH,
        graphs: [{ id: SECOND_GRAPH, title: 'Second Graph', color: SECOND_COLOR, edges: [] }],
      },
    ],
  },
  resources: [],
};

const PERSISTENCE_UNSETTLED = 'The change could not be saved. Check the Space persistence status.';

const openSpaces = (
  control = new MemorySpaceBackendTestControl(),
  reportObserverError: ObserverErrorReporter = () => undefined,
) =>
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
    reportObserverError,
  });

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

const graphsOf = (space: OpenSpace, mapId: MapId): readonly GraphId[] =>
  space.app
    .currentSpace()
    .lookup.map(mapId)
    ?.map.graphs.map((graph) => graph.id) ?? [];

const graphOf = (space: OpenSpace, mapId: MapId, graphId: GraphId) =>
  space.app
    .currentSpace()
    .lookup.map(mapId)
    ?.map.graphs.find((graph) => graph.id === graphId);

const publicationsOf = (space: OpenSpace) => {
  let count = 0;
  space.app.authoring.subscribe(() => {
    count += 1;
  });
  return { count: () => count };
};

/** One context, as far as the contract needs to drive it. */
interface ContractContext {
  /** The Space whose Graph the context authors. */
  readonly authored: OpenSpace;
  /** Where the surface drawing this context reports. */
  readonly outcomes: CommandOutcomes;
  /** The Map and Graph the surface addresses. */
  readonly mapId: MapId;
  readonly graphId: GraphId;
  readonly commands: GraphAuthoringCommands;
  readonly withdraw: () => void;
  /** Answer the context's next Edit with `answer` in place of Space Authoring. */
  readonly answerNext: (answer: () => AuthoringResult) => void;
  /** What reached the reporter. */
  readonly reported: readonly unknown[];
}

const contexts: readonly {
  readonly name: string;
  readonly setup: () => Promise<ContractContext>;
}[] = [
  {
    name: 'the top-level Space',
    setup: async () => {
      const reported: unknown[] = [];
      const spaces = openSpaces(undefined, (error) => reported.push(error));
      const authored = await spaces.open(TARGET);
      let available = true;
      return {
        authored,
        outcomes: authored.app.commandOutcomes,
        mapId: FIRST_MAP,
        graphId: FIRST_GRAPH,
        commands: topLevelGraphAuthoringCommands(authored, {
          rename: () => available,
          recolor: () => available,
          create: () => available,
        }),
        withdraw: () => {
          available = false;
        },
        answerNext: (answer) => {
          vi.spyOn(authored.app.authoring, 'complete').mockImplementationOnce(answer);
        },
        reported,
      };
    },
  },
  {
    name: 'an embedded Space Resource',
    setup: async () => {
      const reported: unknown[] = [];
      const spaces = openSpaces(undefined, (error) => reported.push(error));
      const source = await spaces.open(META);
      const authored = await spaces.embed(TARGET);
      let available = true;
      return {
        authored,
        outcomes: source.app.commandOutcomes,
        mapId: document.map,
        graphId: document.graph,
        commands: embeddedGraphAuthoringCommands({
          target: authored,
          spaces,
          containingSpaceId: META,
          select: selectOn(source),
          available: () => available,
        }),
        withdraw: () => {
          available = false;
        },
        answerNext: (answer) => {
          vi.spyOn(authored.app.authoring, 'completeInMap').mockImplementationOnce(answer);
        },
        reported,
      };
    },
  },
];

describe.each(contexts)('Graph rename through $name', ({ setup }) => {
  it('completes the rename', async () => {
    const { authored, mapId, graphId, commands } = await setup();
    const rename = commands.map(mapId).graph(graphId).rename;
    expect(rename.available).toBe(true);
    expect(rename.invoke('Renamed')).toEqual({ kind: 'completed' });
    expect(graphOf(authored, mapId, graphId)?.title).toBe('Renamed');
  });

  it('answers a rename to the stored title as unchanged', async () => {
    const { authored, mapId, graphId, commands } = await setup();
    const stored = graphOf(authored, mapId, graphId)?.title ?? '';
    expect(commands.map(mapId).graph(graphId).rename.invoke(stored)).toEqual({
      kind: 'unchanged',
    });
  });

  it('answers a refusal with the complete Graph report', async () => {
    const { authored, mapId, graphId, commands } = await setup();
    const before = graphOf(authored, mapId, graphId)?.title;
    expect(commands.map(mapId).graph(graphId).rename.invoke('  ')).toEqual({
      kind: 'refused',
      report: { title: 'Graph unchanged', message: 'A Graph title is required.' },
    });
    expect(graphOf(authored, mapId, graphId)?.title).toBe(before);
  });

  it('answers a stale invocation as unavailable without authoring anything', async () => {
    const { authored, mapId, graphId, commands, withdraw } = await setup();
    const rename = commands.map(mapId).graph(graphId).rename;
    const working = authored.session.getState().working;
    const publications = publicationsOf(authored);
    withdraw();
    expect(rename.invoke('Renamed')).toEqual({ kind: 'unavailable' });
    expect(publications.count()).toBe(0);
    expect(authored.session.getState().working).toBe(working);
    expect(commands.map(mapId).graph(graphId).rename.available).toBe(false);
  });

  it('answers a rename of a Map that has gone as unavailable', async () => {
    const { authored, mapId, graphId, commands } = await setup();
    const rename = commands.map(mapId).graph(graphId).rename;
    expect(authored.app.authoring.complete({ kind: 'deleted-map', mapId }).kind).toBe('completed');
    const publications = publicationsOf(authored);
    expect(rename.invoke('Renamed')).toEqual({ kind: 'unavailable' });
    expect(publications.count()).toBe(0);
    expect(commands.map(mapId).graph(graphId).rename.available).toBe(false);
  });

  it('leaves the refused report for command outcomes to hold, and nothing for unavailable', async () => {
    const { mapId, graphId, commands, outcomes, withdraw } = await setup();
    const rename = commands.map(mapId).graph(graphId).rename;
    const refused = outcomes.run('graph-edit', () => rename.invoke(''));
    expect(renameDraftAnswer(refused)).toBe('A Graph title is required.');
    expect(outcomes.getState().notices.get('graph-edit')).toEqual({
      title: 'Graph unchanged',
      message: 'A Graph title is required.',
    });
    outcomes.dismiss('graph-edit');
    expect(outcomes.getState().notices.has('graph-edit')).toBe(false);

    withdraw();
    const stale = outcomes.run('graph-edit', () => rename.invoke(''));
    expect(stale).toEqual({ kind: 'unavailable' });
    expect(renameDraftAnswer(stale)).toBeNull();
    expect(outcomes.getState().notices.has('graph-edit')).toBe(false);
  });
});

describe.each(contexts)('Graph recolour through $name', ({ setup }) => {
  it('completes the recolour', async () => {
    const { authored, mapId, graphId, commands } = await setup();
    const recolor = commands.map(mapId).graph(graphId).recolor;
    expect(recolor.available).toBe(true);
    expect(recolor.invoke(OTHER_COLOR)).toEqual({ kind: 'completed' });
    expect(graphOf(authored, mapId, graphId)?.color).toBe(OTHER_COLOR);
  });

  it('answers a recolour to the stored colour as unchanged', async () => {
    const { mapId, graphId, commands } = await setup();
    expect(commands.map(mapId).graph(graphId).recolor.invoke(SECOND_COLOR)).toEqual({
      kind: 'unchanged',
    });
  });

  it('answers a refusal with the complete Graph report, which command outcomes holds', async () => {
    const { authored, mapId, graphId, commands, outcomes, answerNext } = await setup();
    answerNext(() => ({ kind: 'refused', refusal: { code: 'graph-not-owned' } }));
    const report = { title: 'Graph unchanged', message: 'That Graph is not one this Map owns.' };
    const recolor = commands.map(mapId).graph(graphId).recolor;
    expect(outcomes.run('graph-edit', () => recolor.invoke(OTHER_COLOR))).toEqual({
      kind: 'refused',
      report,
    });
    expect(graphOf(authored, mapId, graphId)?.color).toBe(SECOND_COLOR);
    expect(outcomes.getState().notices.get('graph-edit')).toEqual(report);
    outcomes.dismiss('graph-edit');
    expect(outcomes.getState().notices.has('graph-edit')).toBe(false);
  });

  it('answers a stale invocation as unavailable without authoring anything', async () => {
    const { authored, mapId, graphId, commands, outcomes, withdraw } = await setup();
    const recolor = commands.map(mapId).graph(graphId).recolor;
    const working = authored.session.getState().working;
    const publications = publicationsOf(authored);
    withdraw();
    expect(outcomes.run('graph-edit', () => recolor.invoke(OTHER_COLOR))).toEqual({
      kind: 'unavailable',
    });
    expect(publications.count()).toBe(0);
    expect(authored.session.getState().working).toBe(working);
    expect(commands.map(mapId).graph(graphId).recolor.available).toBe(false);
    expect(outcomes.getState().notices.has('graph-edit')).toBe(false);
  });

  it('answers a recolour of a Map that has gone as unavailable', async () => {
    const { authored, mapId, graphId, commands } = await setup();
    const recolor = commands.map(mapId).graph(graphId).recolor;
    expect(authored.app.authoring.complete({ kind: 'deleted-map', mapId }).kind).toBe('completed');
    const publications = publicationsOf(authored);
    expect(recolor.invoke(OTHER_COLOR)).toEqual({ kind: 'unavailable' });
    expect(publications.count()).toBe(0);
    expect(commands.map(mapId).graph(graphId).recolor.available).toBe(false);
  });
});

describe.each(contexts)('Graph creation through $name', ({ setup }) => {
  it('creates one empty Graph in the addressed Map and answers its Map and Graph', async () => {
    const { authored, mapId, commands } = await setup();
    const before = graphsOf(authored, mapId);
    const create = commands.map(mapId).create;
    expect(create.available).toBe(true);
    const outcome = await create.invoke();
    if (outcome.kind !== 'completed') throw new Error(`Graph creation answered ${outcome.kind}`);
    expect(outcome.mapId).toBe(mapId);
    expect(graphsOf(authored, mapId)).toEqual([...before, outcome.graphId]);
    expect(graphOf(authored, mapId, outcome.graphId)?.edges).toEqual([]);
  });

  it('answers a stale invocation as unavailable without authoring anything', async () => {
    const { authored, mapId, commands, outcomes, withdraw } = await setup();
    const create = commands.map(mapId).create;
    const working = authored.session.getState().working;
    const publications = publicationsOf(authored);
    withdraw();
    expect(await outcomes.run('graph-create', () => create.invoke())).toEqual({
      kind: 'unavailable',
    });
    expect(publications.count()).toBe(0);
    expect(authored.session.getState().working).toBe(working);
    expect(commands.map(mapId).create.available).toBe(false);
    expect(outcomes.getState().notices.has('graph-create')).toBe(false);
  });

  it('answers a creation in a Map that has gone as unavailable', async () => {
    const { authored, mapId, commands } = await setup();
    const create = commands.map(mapId).create;
    expect(authored.app.authoring.complete({ kind: 'deleted-map', mapId }).kind).toBe('completed');
    const publications = publicationsOf(authored);
    expect(await create.invoke()).toEqual({ kind: 'unavailable' });
    expect(publications.count()).toBe(0);
    expect(commands.map(mapId).create.available).toBe(false);
  });

  it('answers a refused creation with the complete Graph report, which command outcomes holds', async () => {
    const { authored, mapId, commands, outcomes, answerNext } = await setup();
    const before = graphsOf(authored, mapId);
    answerNext(() => ({ kind: 'refused', refusal: { code: 'map-not-found' } }));
    const report = {
      title: 'Graph not created',
      message: 'This Map is no longer part of the Space.',
    };
    const create = commands.map(mapId).create;
    expect(await outcomes.run('graph-create', () => create.invoke())).toEqual({
      kind: 'refused',
      report,
    });
    expect(graphsOf(authored, mapId)).toEqual(before);
    expect(outcomes.getState().notices.get('graph-create')).toEqual(report);
    expect(outcomes.getState().notices.has('graph-edit')).toBe(false);
    outcomes.dismiss('graph-create');
    expect(outcomes.getState().notices.has('graph-create')).toBe(false);
  });

  it('answers an unchanged creation as unchanged', async () => {
    const { mapId, commands, answerNext } = await setup();
    answerNext(() => ({ kind: 'unchanged' }));
    expect(await commands.map(mapId).create.invoke()).toEqual({ kind: 'unchanged' });
  });

  it('breaks rather than answering when a queued creation leaves no Graph to answer', async () => {
    const { mapId, commands, answerNext } = await setup();
    answerNext(() => ({ kind: 'queued' }));
    await expect(commands.map(mapId).create.invoke()).rejects.toThrow(/queued/);
  });

  it('breaks rather than answering when a completed creation names no Graph', async () => {
    const { mapId, commands, answerNext } = await setup();
    answerNext(() => ({ kind: 'completed' }));
    await expect(commands.map(mapId).create.invoke()).rejects.toThrow(/no Graph/);
  });

  it('says a throw as a break, never as a refusal', async () => {
    const { mapId, commands, outcomes, answerNext, reported } = await setup();
    const failure = new Error('creation broke');
    answerNext(() => {
      throw failure;
    });
    const create = commands.map(mapId).create;
    expect(await outcomes.run('graph-create', () => create.invoke())).toEqual({ kind: 'broke' });
    expect(reported).toContain(failure);
    expect(outcomes.getState().notices.has('graph-create')).toBe(false);
  });
});

describe('what each context creates in', () => {
  const embedded = async (
    control = new MemorySpaceBackendTestControl(),
    select?: (mapId: MapId, graphId: GraphId) => string | null,
  ) => {
    const spaces = openSpaces(control);
    const source = await spaces.open(META);
    const authored = await spaces.embed(TARGET);
    const commands = embeddedGraphAuthoringCommands({
      target: authored,
      spaces,
      containingSpaceId: META,
      select: select ?? selectOn(source),
      available: () => true,
    });
    return { spaces, source, authored, commands, control };
  };

  it('activates the created Graph on the top-level canvas', async () => {
    const spaces = openSpaces();
    const authored = await spaces.open(TARGET);
    const commands = topLevelGraphAuthoringCommands(authored, {
      rename: () => true,
      recolor: () => true,
      create: () => true,
    });
    const outcome = await commands.map(FIRST_MAP).create.invoke();
    if (outcome.kind !== 'completed') throw new Error(`Graph creation answered ${outcome.kind}`);
    expect(authored.app.navigation.getState()).toMatchObject({
      selectedMapId: FIRST_MAP,
      activeGraphId: outcome.graphId,
    });
  });

  it('does not create in a Map the top-level canvas has moved off', async () => {
    const spaces = openSpaces();
    const authored = await spaces.open(TARGET);
    const create = topLevelGraphAuthoringCommands(authored, {
      rename: () => true,
      recolor: () => true,
      create: () => true,
    }).map(SECOND_MAP).create;
    expect(create.available).toBe(false);
    expect(await create.invoke()).toEqual({ kind: 'unavailable' });
    expect(graphsOf(authored, SECOND_MAP)).toEqual([SECOND_GRAPH]);
  });

  it('withholds creation alone when only creation is withdrawn at the top level', async () => {
    const spaces = openSpaces();
    const authored = await spaces.open(TARGET);
    const commands = topLevelGraphAuthoringCommands(authored, {
      rename: () => true,
      recolor: () => true,
      create: () => false,
    });
    expect(commands.map(FIRST_MAP).create.available).toBe(false);
    expect(commands.map(FIRST_MAP).graph(FIRST_GRAPH).rename.available).toBe(true);
    expect(await commands.map(FIRST_MAP).create.invoke()).toEqual({ kind: 'unavailable' });
    expect(graphsOf(authored, FIRST_MAP)).toEqual([FIRST_GRAPH, OTHER_GRAPH]);
  });

  it('persists a new Graph before the Resource refers to it, without moving either canvas', async () => {
    const { spaces, source, authored, commands, control } = await embedded();
    const release = control.deferNextCommit();
    const creating = commands.map(SECOND_MAP).create.invoke();
    try {
      // The target's commit is held: the Resource must not name a Graph that
      // has not been stored.
      await vi.waitFor(() => expect(control.requests).toHaveLength(1));
      expect(storedSelection(source)).toEqual({ map: SECOND_MAP, graph: SECOND_GRAPH });
    } finally {
      release();
    }
    const outcome = await creating;
    if (outcome.kind !== 'completed') throw new Error(`Graph creation answered ${outcome.kind}`);
    expect(storedSelection(source)).toEqual({ map: SECOND_MAP, graph: outcome.graphId });
    expect(await spaces.waitForPersistence(META)).toBe(true);
    expect(source.app.navigation.getState().selectedMapId).toBe(META_MAP);
    expect(authored.app.navigation.getState()).toMatchObject({
      selectedMapId: FIRST_MAP,
      activeGraphId: FIRST_GRAPH,
    });
  });

  it('creates nothing while the containing Space has not saved, and reports a Graph not created', async () => {
    const { source, authored, commands, control } = await embedded();
    control.throwNext(new Error('offline'));
    expect(
      source.app.authoring.complete({ kind: 'renamed-map', mapId: META_MAP, title: 'Renamed' })
        .kind,
    ).toBe('completed');
    expect(await commands.map(SECOND_MAP).create.invoke()).toEqual({
      kind: 'refused',
      report: { title: 'Graph not created', message: PERSISTENCE_UNSETTLED },
    });
    expect(graphsOf(authored, SECOND_MAP)).toEqual([SECOND_GRAPH]);
  });

  it('reports a target that did not save as a Graph not saved, and leaves the Resource alone', async () => {
    const { source, commands, control } = await embedded();
    control.throwNext(new Error('offline'));
    expect(await commands.map(SECOND_MAP).create.invoke()).toEqual({
      kind: 'refused',
      report: { title: 'Graph not saved', message: PERSISTENCE_UNSETTLED },
    });
    expect(storedSelection(source)).toEqual({ map: SECOND_MAP, graph: SECOND_GRAPH });
  });

  it('reports a refused selection write as a Graph created but not selected', async () => {
    const { authored, commands } = await embedded(undefined, () => 'The selection is invalid.');
    expect(await commands.map(SECOND_MAP).create.invoke()).toEqual({
      kind: 'refused',
      report: { title: 'Graph not selected', message: 'The selection is invalid.' },
    });
    expect(graphsOf(authored, SECOND_MAP)).toHaveLength(2);
  });

  it('creates nothing in an embedded target exited while its Spaces were saving', async () => {
    const { spaces, authored, commands } = await embedded();
    const before = authored.session.getState().working;
    const creating = commands.map(SECOND_MAP).create.invoke();
    await spaces.exit(TARGET);
    expect(await creating).toEqual({ kind: 'unavailable' });
    expect(authored.session.getState().working).toBe(before);
  });
});

describe('what each context addresses', () => {
  const topLevel = async () => {
    const spaces = openSpaces();
    const authored = await spaces.open(TARGET);
    const commands = topLevelGraphAuthoringCommands(authored, {
      rename: () => true,
      recolor: () => true,
      create: () => true,
    });
    return { authored, commands };
  };

  const embedded = async () => {
    const spaces = openSpaces();
    const source = await spaces.open(META);
    const authored = await spaces.embed(TARGET);
    const commands = embeddedGraphAuthoringCommands({
      target: authored,
      spaces,
      containingSpaceId: META,
      select: selectOn(source),
      available: () => true,
    });
    return { spaces, authored, commands };
  };

  it('does not author a Graph of the top-level Map that is not the Active Graph', async () => {
    const { authored, commands } = await topLevel();
    const other = commands.map(FIRST_MAP).graph(OTHER_GRAPH);
    expect(other.rename.available).toBe(false);
    expect(other.recolor.available).toBe(false);
    expect(other.rename.invoke('Renamed')).toEqual({ kind: 'unavailable' });
    expect(other.recolor.invoke(OTHER_COLOR)).toEqual({ kind: 'unavailable' });
    expect(graphOf(authored, FIRST_MAP, OTHER_GRAPH)).toMatchObject({ title: 'Other Graph' });
    expect(graphOf(authored, FIRST_MAP, OTHER_GRAPH)?.color).toBeUndefined();
  });

  it('does not author the Active Graph once the top-level canvas has activated another', async () => {
    const { authored, commands } = await topLevel();
    const rename = commands.map(FIRST_MAP).graph(FIRST_GRAPH).rename;
    authored.app.navigation.activateGraph(OTHER_GRAPH);
    expect(rename.invoke('Renamed')).toEqual({ kind: 'unavailable' });
    expect(graphOf(authored, FIRST_MAP, FIRST_GRAPH)?.title).toBe('First Graph');
  });

  it('does not author a Graph of a Map the top-level canvas has moved off', async () => {
    const { authored, commands } = await topLevel();
    const second = commands.map(SECOND_MAP).graph(SECOND_GRAPH);
    expect(second.rename.available).toBe(false);
    expect(second.rename.invoke('Renamed')).toEqual({ kind: 'unavailable' });
    expect(graphOf(authored, SECOND_MAP, SECOND_GRAPH)?.title).toBe('Second Graph');
  });

  it('withholds rename and recolour separately at the top level', async () => {
    const spaces = openSpaces();
    const authored = await spaces.open(TARGET);
    const renames = topLevelGraphAuthoringCommands(authored, {
      rename: () => true,
      recolor: () => false,
      create: () => true,
    })
      .map(FIRST_MAP)
      .graph(FIRST_GRAPH);
    expect(renames.rename.available).toBe(true);
    expect(renames.recolor.available).toBe(false);
    const recolors = topLevelGraphAuthoringCommands(authored, {
      rename: () => false,
      recolor: () => true,
      create: () => true,
    })
      .map(FIRST_MAP)
      .graph(FIRST_GRAPH);
    expect(recolors.rename.available).toBe(false);
    expect(recolors.recolor.available).toBe(true);
  });

  it('authors any Graph of any Map of an embedded target without moving its canvas', async () => {
    const { authored, commands } = await embedded();
    const other = commands.map(FIRST_MAP).graph(OTHER_GRAPH);
    expect(other.rename.invoke('Renamed')).toEqual({ kind: 'completed' });
    expect(other.recolor.invoke(OTHER_COLOR)).toEqual({ kind: 'completed' });
    expect(graphOf(authored, FIRST_MAP, OTHER_GRAPH)).toMatchObject({
      title: 'Renamed',
      color: OTHER_COLOR,
    });
    expect(authored.app.navigation.getState()).toMatchObject({
      selectedMapId: FIRST_MAP,
      activeGraphId: FIRST_GRAPH,
    });
  });

  it('does not author a Graph the embedded Map does not own', async () => {
    const { commands } = await embedded();
    const foreign = commands.map(SECOND_MAP).graph(FIRST_GRAPH);
    expect(foreign.rename.available).toBe(false);
    expect(foreign.rename.invoke('Renamed')).toEqual({ kind: 'unavailable' });
  });

  it('does not author through an embedded target that has been exited', async () => {
    const { spaces, commands } = await embedded();
    const graph = commands.map(SECOND_MAP).graph(SECOND_GRAPH);
    await spaces.exit(TARGET);
    expect(spaces.entry(TARGET)).toBeUndefined();
    expect(graph.rename.invoke('Renamed')).toEqual({ kind: 'unavailable' });
    expect(graph.recolor.invoke(OTHER_COLOR)).toEqual({ kind: 'unavailable' });
  });
});

describe('the Graph authoring module', () => {
  it('imports no continuation, React or DOM', () => {
    const source = readFileSync(
      new URL('../src/graph-authoring-commands.ts', import.meta.url),
      'utf8',
    );
    const specifiers = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
    expect(specifiers).not.toContain('./continuation');
    expect(specifiers.filter((specifier) => /^react(-dom)?(\/|$)/.test(specifier ?? ''))).toEqual(
      [],
    );
    expect(source).not.toMatch(/\b(document|window)\./);
  });
});

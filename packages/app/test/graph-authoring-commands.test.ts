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
import { MemorySpaceBackend } from '@project/persistence';
import { renameDraftAnswer } from '../src/authoring-commands';
import type { CommandOutcomes } from '../src/command-outcomes';
import {
  embeddedGraphAuthoringCommands,
  topLevelGraphAuthoringCommands,
  type GraphAuthoringCommands,
} from '../src/graph-authoring-commands';
import { createOpenSpaces, type OpenSpace } from '../src/open-spaces';
import type { AuthoringRefusal } from '../src/space-authoring';
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
  /** Refuse the context's next Edit, as Space Authoring would. */
  readonly refuseNext: (refusal: AuthoringRefusal) => void;
}

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
        graphId: FIRST_GRAPH,
        commands: topLevelGraphAuthoringCommands(authored, {
          rename: () => available,
          recolor: () => available,
        }),
        withdraw: () => {
          available = false;
        },
        refuseNext: (refusal) => {
          vi.spyOn(authored.app.authoring, 'complete').mockReturnValueOnce({
            kind: 'refused',
            refusal,
          });
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
        refuseNext: (refusal) => {
          vi.spyOn(authored.app.authoring, 'completeInMap').mockReturnValueOnce({
            kind: 'refused',
            refusal,
          });
        },
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
    const { authored, mapId, graphId, commands, outcomes, refuseNext } = await setup();
    refuseNext({ code: 'graph-not-owned' });
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

describe('what each context addresses', () => {
  const topLevel = async () => {
    const spaces = openSpaces();
    const authored = await spaces.open(TARGET);
    const commands = topLevelGraphAuthoringCommands(authored, {
      rename: () => true,
      recolor: () => true,
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
    })
      .map(FIRST_MAP)
      .graph(FIRST_GRAPH);
    expect(renames.rename.available).toBe(true);
    expect(renames.recolor.available).toBe(false);
    const recolors = topLevelGraphAuthoringCommands(authored, {
      rename: () => false,
      recolor: () => true,
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

import { describe, expect, it, vi } from 'vitest';
import { newUuid, uuidSchema, type SpaceSnapshot, type ThingDocument } from '@project/core';
import { Placement } from '@project/graph';
import { MemorySpaceBackend, MemorySpaceBackendTestControl } from '@project/persistence';
import { completeEmbeddedAuthoring } from '../src/embedded-authoring';
import { createOpenSpaces } from '../src/open-spaces';
import { spaceThingContextCommands } from '../src/space-thing-context-commands';
import { recordingHistory } from './browser-history';

const id = (suffix: string) =>
  uuidSchema.parse(`00000000-0000-4000-8000-${suffix.padStart(12, '0')}`);
const META = id('1');
const TARGET = id('2');
const THING = id('3');
const META_DIAGRAM = id('4');
const FIRST_DIAGRAM = id('5');
const SECOND_DIAGRAM = id('6');
const META_GRAPH = id('7');
const FIRST_GRAPH = id('8');
const SECOND_GRAPH = id('9');
const SURVIVOR_GRAPH = id('10');

const document: Extract<ThingDocument, { kind: 'space' }> = {
  kind: 'space',
  title: 'Target',
  spaceId: TARGET,
  diagram: SECOND_DIAGRAM,
  graph: SECOND_GRAPH,
};
const meta: SpaceSnapshot = {
  id: META,
  document: {
    version: 1,
    title: 'Meta',
    defaultDiagram: META_DIAGRAM,
    diagrams: [
      {
        id: META_DIAGRAM,
        title: 'Meta Diagram',
        kind: 'positioned',
        positions: { [THING]: { x: 0, y: 0, open: false } },
        graphs: [{ id: META_GRAPH, title: 'Meta Graph', edges: [] }],
      },
    ],
  },
  things: [{ id: THING, document }],
};
const target: SpaceSnapshot = {
  id: TARGET,
  document: {
    version: 1,
    title: 'Target',
    defaultDiagram: FIRST_DIAGRAM,
    diagrams: [
      {
        id: FIRST_DIAGRAM,
        title: 'First',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: FIRST_GRAPH, title: 'First Graph', edges: [] }],
      },
      {
        id: SECOND_DIAGRAM,
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
  things: [],
};

async function setup() {
  const control = new MemorySpaceBackendTestControl();
  const backend = new MemorySpaceBackend(
    META,
    [meta, target].map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
    control,
  );
  const spaces = createOpenSpaces({
    backend,
    metaSpaceId: META,
    newId: newUuid,
    history: recordingHistory(),
  });
  const source = await spaces.open(META);
  const entry = await spaces.embed(TARGET);
  const sourceDiagram = source.app.currentSpace().diagrams[0];
  if (sourceDiagram === undefined) throw new Error('Source Diagram missing');
  source.app.authoring.replacePlacement(Placement.fromDiagram(sourceDiagram));
  const commands = spaceThingContextCommands(
    entry,
    spaces,
    META,
    document,
    (diagram, graph) => {
      const result = source.app.authoring.complete({
        kind: 'edited-thing',
        thingId: THING,
        document: { ...document, diagram: diagram.id, graph },
      });
      return result.kind === 'refused' ? result.refusal.code : null;
    },
    source.app.continuation,
    (completion) =>
      completeEmbeddedAuthoring(entry, document.diagram, completion, entry.app.reportObserverError),
  );
  return { backend, spaces, commands, source, control };
}

describe('persisting a Space Thing context command', () => {
  it('persists Diagram deletion after moving the stored referring Thing', async () => {
    const { backend, spaces, commands } = await setup();
    expect(await commands.diagramCommands.onDelete()).toBeNull();
    await spaces.waitForPersistence(META);
    await spaces.waitForPersistence(TARGET);
    const loaded = await backend.loadSpace(TARGET);
    expect(loaded?.snapshot.document.diagrams?.map((diagram) => diagram.id)).toEqual([
      FIRST_DIAGRAM,
    ]);
  });

  it('persists Graph deletion after moving the stored referring Thing', async () => {
    const { backend, spaces, commands } = await setup();
    expect(commands.graphCommands).toBeDefined();
    expect(await commands.graphCommands?.onDelete()).toBeNull();
    await spaces.waitForPersistence(META);
    await spaces.waitForPersistence(TARGET);
    const loaded = await backend.loadSpace(TARGET);
    expect(
      loaded?.snapshot.document.diagrams
        ?.find((diagram) => diagram.id === SECOND_DIAGRAM)
        ?.graphs.map((graph) => graph.id),
    ).toEqual([SURVIVOR_GRAPH]);
  });
});

it.each(['diagram', 'graph'] as const)(
  'persists a new %s before the Thing refers to it',
  async (kind) => {
    const { backend, spaces, commands, source, control } = await setup();
    const release = control.deferNextCommit();
    const action = kind === 'diagram' ? commands.diagramCommands : commands.graphCommands;
    if (action === undefined) throw new Error('Commands missing');
    const creating = action.onCreate('test-rail');
    try {
      await vi.waitFor(() => expect(control.requests).toHaveLength(1));
      expect(source.session.getState().working.things[0]?.document).toEqual(document);
    } finally {
      release();
    }
    expect(await creating).toBeNull();
    expect(await spaces.waitForPersistence(META)).toBe(true);
    expect(await spaces.waitForPersistence(TARGET)).toBe(true);
    const stored = await backend.loadSpace(META);
    expect(stored?.snapshot.things[0]?.document).not.toEqual(document);
  },
);

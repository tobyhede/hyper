import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type Thing, type Graph, type Diagram } from '@project/core';
import type { ProductDestination } from '@project/http';
import type { EntityActionGroup } from '@project/ui';
import {
  DELETE_DIAGRAM_ACTION_ID,
  spaceEntityActions,
  type SpaceEntity,
} from '../src/entity-actions';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const PLACED_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OUTSIDE_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');

const GRAPH: Graph = { id: GRAPH_ID, title: 'Long', edges: [] };
const DIAGRAM: Diagram = {
  id: DIAGRAM_ID,
  title: 'Collection 1',
  kind: 'positioned',
  positions: { [PLACED_THING_ID]: { x: 0, y: 0, open: false } },
  graphs: [GRAPH],
};
const thing = (id: typeof PLACED_THING_ID, title: string): Thing => ({
  id,
  title,
  kind: 'markdown',
  body: '',
});

const build = (
  overrides: Partial<Parameters<typeof spaceEntityActions>[0]> = {},
): ((entity: SpaceEntity) => readonly EntityActionGroup[]) =>
  spaceEntityActions({
    spaceId: SPACE_ID,
    spaceTitle: 'Fixture Space',
    onCopy: vi.fn(),
    onRename: vi.fn(),
    onDeleteDiagram: vi.fn(),
    ...overrides,
  });

/** Every command a menu holds, flattened past the grouping. */
const commands = (groups: readonly EntityActionGroup[]) => groups.flat();
const labels = (groups: readonly EntityActionGroup[]) =>
  commands(groups).map((action) => action.label);

/** The destination one command would copy, taken from the callback it fires. */
const copied = (
  entity: SpaceEntity,
  label: string,
): ProductDestination | 'no such command' | 'copied nothing' => {
  const captured: ProductDestination[] = [];
  const actions = build({
    onCopy: (chosen) => {
      captured.push(chosen);
      return true;
    },
  })(entity);
  const action = commands(actions).find((candidate) => candidate.label === label);
  if (action === undefined) return 'no such command';
  // The command is awaited nowhere here: what is being read is which
  // destination it hands `onCopy`, and that happens on the call. What it
  // answers afterwards is `EntityActionsMenu`'s business and is proved there.
  void action.onSelect();
  return captured[0] ?? 'copied nothing';
};

describe('spaceEntityActions', () => {
  /**
   * The one naming rule the product copy has (`.scratch/link-ux/issues/01`,
   * Terminology): neither word reaches a reader. They are fine in a prop name
   * and in this repository's prose; they are domain vocabulary, and the menu is
   * read by someone who does not have it.
   */
  it.each([
    { name: 'a Space', entity: { kind: 'space' } as const },
    { name: 'a Diagram', entity: { kind: 'diagram', diagram: DIAGRAM } as const },
    { name: 'a Graph', entity: { kind: 'graph', graph: GRAPH, diagram: DIAGRAM } as const },
    {
      name: 'a Thing',
      entity: { kind: 'thing', thing: thing(PLACED_THING_ID, 'A'), diagram: DIAGRAM } as const,
    },
  ])('never says canonical or contextual in $name’s menu', ({ entity }) => {
    const written = commands(build()(entity))
      .flatMap((action) => [action.label, action.description ?? '', action.report?.done ?? ''])
      .join(' ')
      .toLowerCase();

    expect(written).not.toContain('canonical');
    expect(written).not.toContain('contextual');
  });

  it('offers a Space one address and no rename', () => {
    const groups = build()({ kind: 'space' });

    expect(labels(groups)).toEqual(['Copy link']);
    expect(copied({ kind: 'space' }, 'Copy link')).toEqual({ kind: 'space', spaceId: SPACE_ID });
  });

  it('offers a Diagram its rename, its address and a destructive delete', () => {
    const entity: SpaceEntity = { kind: 'diagram', diagram: DIAGRAM };
    const groups = build()(entity);

    expect(labels(groups)).toEqual(['Rename', 'Copy link', 'Delete Diagram']);
    expect(commands(groups).find((action) => action.id === DELETE_DIAGRAM_ACTION_ID)?.variant).toBe(
      'destructive',
    );
    expect(copied(entity, 'Copy link')).toEqual({
      kind: 'diagram',
      spaceId: SPACE_ID,
      diagramId: DIAGRAM_ID,
    });
  });

  /**
   * A withheld command is absent, never present and disabled — the rule the
   * Sidebar's link buttons already followed, applied to the Edits as well.
   */
  it('withholds the Diagram Edits rather than offering them refused', () => {
    const groups = build({ onRename: null, onDeleteDiagram: null })({
      kind: 'diagram',
      diagram: DIAGRAM,
    });

    expect(labels(groups)).toEqual(['Copy link']);
  });

  /**
   * What the Delete answers, which is not a nicety: the Sidebar dismisses its
   * mobile Sheet on a command that did what its label said, and the refusal a
   * refused deletion produces renders *on that Sheet*. An item that answered
   * `done` either way took the surface its own refusal was about to be printed
   * on away with it, and the reader was told nothing.
   */
  it.each([
    { outcome: 'done', deleted: true, name: 'the Diagram was deleted' },
    { outcome: 'failed', deleted: false, name: 'the Edit was refused' },
  ])('answers $outcome when $name', async ({ outcome, deleted }) => {
    const groups = build({ onDeleteDiagram: () => deleted })({ kind: 'diagram', diagram: DIAGRAM });
    const action = commands(groups).find((candidate) => candidate.id === DELETE_DIAGRAM_ACTION_ID);

    expect(await action?.onSelect()).toBe(outcome);
  });

  /**
   * A Diagram owns its Graphs (ADR 0040), so a Graph row always has both forms:
   * the address within the Diagram drawing it, and the address that opens it
   * wherever it is drawn.
   */
  it('offers a Graph both link forms, the Diagram one first', () => {
    const entity: SpaceEntity = { kind: 'graph', graph: GRAPH, diagram: DIAGRAM };

    expect(labels(build()(entity))).toEqual(['Rename', 'Copy link', 'Copy permanent link']);
    expect(copied(entity, 'Copy link')).toEqual({
      kind: 'diagram-graph',
      spaceId: SPACE_ID,
      diagramId: DIAGRAM_ID,
      graphId: GRAPH_ID,
    });
    expect(copied(entity, 'Copy permanent link')).toEqual({
      kind: 'graph',
      spaceId: SPACE_ID,
      graphId: GRAPH_ID,
    });
  });

  it('offers a placed Thing both link forms and no rename', () => {
    const entity: SpaceEntity = {
      kind: 'thing',
      thing: thing(PLACED_THING_ID, 'A'),
      diagram: DIAGRAM,
    };

    expect(labels(build()(entity))).toEqual(['Copy link', 'Copy permanent link']);
    expect(copied(entity, 'Copy link')).toEqual({
      kind: 'diagram-thing',
      spaceId: SPACE_ID,
      diagramId: DIAGRAM_ID,
      thingId: PLACED_THING_ID,
    });
  });

  /**
   * A menu row refers to a Thing, so its sentence names the Thing's **name**
   * (ADR 0083). The description is one line of prose beneath a label, and a
   * Title's later lines reaching it would break the sentence in half.
   */
  it('describes a Thing’s addresses by the Thing’s name', () => {
    const entity: SpaceEntity = {
      kind: 'thing',
      thing: thing(PLACED_THING_ID, 'Auth\nHow a session begins'),
      diagram: DIAGRAM,
    };

    const written = commands(build()(entity))
      .map((action) => action.description ?? '')
      .join(' ');

    expect(written).toContain('Opens Auth inside');
    expect(written).not.toContain('How a session begins');
  });

  /**
   * A Thing the Things drawer reveals but this Diagram does not place has one
   * address, so there is nothing for a second to differ from. Offering it
   * anyway would copy a `diagram-thing` path the host answers 404 for.
   */
  it('withholds the permanent link from a Thing this Diagram does not place', () => {
    const entity: SpaceEntity = {
      kind: 'thing',
      thing: thing(OUTSIDE_THING_ID, 'Outside'),
      diagram: DIAGRAM,
    };

    expect(labels(build()(entity))).toEqual(['Copy link']);
    expect(copied(entity, 'Copy link')).toEqual({
      kind: 'thing',
      spaceId: SPACE_ID,
      thingId: OUTSIDE_THING_ID,
    });
  });

  /** Every address command confirms in place, which is what holds the menu open. */
  it('confirms every copy and describes where it lands', () => {
    const copies = commands(build()({ kind: 'graph', graph: GRAPH, diagram: DIAGRAM })).filter(
      (action) => action.label.startsWith('Copy'),
    );

    expect(copies).toHaveLength(2);
    for (const action of copies) {
      expect(action.report?.done).toBe('Copied');
      expect(action.description).toBeTypeOf('string');
      expect(action.icon).toBeDefined();
    }
  });

  it('begins a rename against the entity the row is about', () => {
    const onRename = vi.fn();

    commands(build({ onRename })({ kind: 'graph', graph: GRAPH, diagram: DIAGRAM }))
      .filter((action) => action.id === 'rename')
      .forEach((action) => {
        void action.onSelect();
      });

    expect(onRename).toHaveBeenCalledOnce();
    expect(onRename.mock.calls[0]?.[0]).toEqual({ kind: 'graph', id: GRAPH_ID });
    expect(onRename.mock.calls[0]?.[1]).toBe('Long');
  });
});

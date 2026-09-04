import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type Card, type Graph, type Layout } from '@project/core';
import type { ProductDestination } from '@project/http';
import type { EntityActionGroup } from '@project/ui';
import { spaceEntityActions } from '../src/entity-actions';
import { DELETE_LAYOUT_ACTION_ID, type SpaceEntity } from '../src/components/SpaceSidebar';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const PLACED_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OUTSIDE_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');

const GRAPH: Graph = { id: GRAPH_ID, title: 'Long', edges: [] };
const LAYOUT: Layout = {
  id: LAYOUT_ID,
  title: 'Collection 1',
  kind: 'positioned',
  positions: { [PLACED_CARD_ID]: { x: 0, y: 0, open: false } },
  graphs: [GRAPH],
};
const card = (id: typeof PLACED_CARD_ID, title: string): Card => ({
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
    onDeleteLayout: vi.fn(),
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
    { name: 'a Layout', entity: { kind: 'layout', layout: LAYOUT } as const },
    { name: 'a Graph', entity: { kind: 'graph', graph: GRAPH, layout: LAYOUT } as const },
    {
      name: 'a Card',
      entity: { kind: 'card', card: card(PLACED_CARD_ID, 'A'), layout: LAYOUT } as const,
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

  it('offers a Layout its rename, its address and a destructive delete', () => {
    const entity: SpaceEntity = { kind: 'layout', layout: LAYOUT };
    const groups = build()(entity);

    expect(labels(groups)).toEqual(['Rename', 'Copy link', 'Delete Layout']);
    expect(commands(groups).find((action) => action.id === DELETE_LAYOUT_ACTION_ID)?.variant).toBe(
      'destructive',
    );
    expect(copied(entity, 'Copy link')).toEqual({
      kind: 'layout',
      spaceId: SPACE_ID,
      layoutId: LAYOUT_ID,
    });
  });

  /**
   * A withheld command is absent, never present and disabled — the rule the
   * Sidebar's link buttons already followed, applied to the Edits as well.
   */
  it('withholds the Layout Edits rather than offering them refused', () => {
    const groups = build({ onRename: null, onDeleteLayout: null })({
      kind: 'layout',
      layout: LAYOUT,
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
    { outcome: 'done', deleted: true, name: 'the Layout was deleted' },
    { outcome: 'failed', deleted: false, name: 'the Edit was refused' },
  ])('answers $outcome when $name', async ({ outcome, deleted }) => {
    const groups = build({ onDeleteLayout: () => deleted })({ kind: 'layout', layout: LAYOUT });
    const action = commands(groups).find((candidate) => candidate.id === DELETE_LAYOUT_ACTION_ID);

    expect(await action?.onSelect()).toBe(outcome);
  });

  /**
   * A Layout owns its Graphs (ADR 0040), so a Graph row always has both forms:
   * the address within the Layout drawing it, and the address that opens it
   * wherever it is drawn.
   */
  it('offers a Graph both link forms, the Layout one first', () => {
    const entity: SpaceEntity = { kind: 'graph', graph: GRAPH, layout: LAYOUT };

    expect(labels(build()(entity))).toEqual(['Rename', 'Copy link', 'Copy permanent link']);
    expect(copied(entity, 'Copy link')).toEqual({
      kind: 'layout-graph',
      spaceId: SPACE_ID,
      layoutId: LAYOUT_ID,
      graphId: GRAPH_ID,
    });
    expect(copied(entity, 'Copy permanent link')).toEqual({
      kind: 'graph',
      spaceId: SPACE_ID,
      graphId: GRAPH_ID,
    });
  });

  it('offers a placed Card both link forms and no rename', () => {
    const entity: SpaceEntity = {
      kind: 'card',
      card: card(PLACED_CARD_ID, 'A'),
      layout: LAYOUT,
    };

    expect(labels(build()(entity))).toEqual(['Copy link', 'Copy permanent link']);
    expect(copied(entity, 'Copy link')).toEqual({
      kind: 'layout-card',
      spaceId: SPACE_ID,
      layoutId: LAYOUT_ID,
      cardId: PLACED_CARD_ID,
    });
  });

  /**
   * A Card the Cards drawer reveals but this Layout does not place has one
   * address, so there is nothing for a second to differ from. Offering it
   * anyway would copy a `layout-card` path the host answers 404 for.
   */
  it('withholds the permanent link from a Card this Layout does not place', () => {
    const entity: SpaceEntity = {
      kind: 'card',
      card: card(OUTSIDE_CARD_ID, 'Outside'),
      layout: LAYOUT,
    };

    expect(labels(build()(entity))).toEqual(['Copy link']);
    expect(copied(entity, 'Copy link')).toEqual({
      kind: 'card',
      spaceId: SPACE_ID,
      cardId: OUTSIDE_CARD_ID,
    });
  });

  /** Every address command confirms in place, which is what holds the menu open. */
  it('confirms every copy and describes where it lands', () => {
    const copies = commands(build()({ kind: 'graph', graph: GRAPH, layout: LAYOUT })).filter(
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

    commands(build({ onRename })({ kind: 'graph', graph: GRAPH, layout: LAYOUT }))
      .filter((action) => action.id === 'rename')
      .forEach((action) => {
        void action.onSelect();
      });

    expect(onRename).toHaveBeenCalledOnce();
    expect(onRename.mock.calls[0]?.[0]).toEqual({ kind: 'graph', id: GRAPH_ID });
    expect(onRename.mock.calls[0]?.[1]).toBe('Long');
  });
});

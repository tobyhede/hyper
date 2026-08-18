import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { loadSpace, type Space } from '@project/graph';
import { canvasChoice } from '../src/canvas-choice';
import { RendererInvariantError, type RendererSelection } from '../src/renderer';
import { cardFile } from './card-files';

const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const FIRST_LAYOUT = uuidSchema.parse('00000000-0000-4000-8000-000000000020');
const SECOND_LAYOUT = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const ABSENT_LAYOUT = uuidSchema.parse('00000000-0000-4000-8000-0000000000aa');

const layout = (id: string, title: string, graphId: string) => ({
  id,
  title,
  kind: 'positioned' as const,
  positions: { [CARD_A]: { x: 0, y: 0 }, [CARD_B]: { x: 420, y: 0 } },
  graphs: [{ id: graphId, title: `${title} graph`, edges: [{ from: CARD_A, to: CARD_B }] }],
});

/** A Space with two Layouts, declared in the order the authored group must draw them. */
const space = (layouts: readonly ReturnType<typeof layout>[] = []): Space => {
  const result = loadSpace(
    {
      version: 1,
      id: uuidSchema.parse('00000000-0000-4000-8000-000000000040'),
      title: 'Choices',
      ...(layouts.length === 0 ? {} : { layouts }),
    },
    [cardFile(CARD_A), cardFile(CARD_B)],
  );
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.space;
};

const AUTHORED = space([
  layout(FIRST_LAYOUT, 'Collection 1', '00000000-0000-4000-8000-000000000030'),
  layout(SECOND_LAYOUT, 'Collection 2', '00000000-0000-4000-8000-000000000031'),
]);

const FLOW: RendererSelection = { kind: 'view', view: 'flow' };
const GRID: RendererSelection = { kind: 'view', view: 'grid' };

describe('canvasChoice', () => {
  it('offers every built-in View and every authored Layout, in the order each is declared', () => {
    const choice = canvasChoice(AUTHORED, FLOW);

    expect(choice.computed.map((renderer) => renderer.title)).toEqual(['Flow', 'Grid']);
    expect(choice.computed.map((renderer) => renderer.selection)).toEqual([FLOW, GRID]);
    expect(choice.authored).toEqual([
      { selection: { kind: 'layout', layoutId: FIRST_LAYOUT }, title: 'Collection 1' },
      { selection: { kind: 'layout', layoutId: SECOND_LAYOUT }, title: 'Collection 2' },
    ]);
  });

  /** A Space authors its first Layout by editing a View (ADR 0025), so this is how one opens. */
  it('offers the computed group before a Space owns any Layout', () => {
    const choice = canvasChoice(space(), FLOW);

    expect(choice.computed).toHaveLength(2);
    expect(choice.authored).toEqual([]);
    expect(choice.selected.title).toBe('Flow');
  });

  /**
   * The reference identity is the interface, not an implementation detail: it is
   * how the sidebar decides which row is pressed, so a `selected` that merely
   * *equals* a row would leave the list with nothing pressed in it.
   */
  it('answers with the very row it offered, for a View and for a Layout alike', () => {
    const onView = canvasChoice(AUTHORED, GRID);
    expect(onView.selected).toBe(onView.computed[1]);

    const onLayout = canvasChoice(AUTHORED, { kind: 'layout', layoutId: SECOND_LAYOUT });
    expect(onLayout.selected).toBe(onLayout.authored[1]);
  });

  /**
   * The computed group reads nothing from the Space, so two calls answering with
   * two arrays would be per-call work nothing asked for — and a fresh identity
   * every render for a value that never changes.
   */
  it('builds the computed group once, whatever Space it is asked about', () => {
    expect(canvasChoice(AUTHORED, FLOW).computed).toBe(canvasChoice(space(), GRID).computed);
  });

  /**
   * The same answer `resolveRenderer` gives to the same condition. A selection
   * naming a Layout that is gone is a caller that failed to check, which is a
   * defect rather than an author's mistake — so it throws rather than falling
   * back to a View and quietly drawing something else.
   */
  it('refuses a selection naming a Layout the Space does not hold', () => {
    const selection: RendererSelection = { kind: 'layout', layoutId: ABSENT_LAYOUT };

    expect(() => canvasChoice(AUTHORED, selection)).toThrow(RendererInvariantError);
    try {
      canvasChoice(AUTHORED, selection);
      expect.unreachable('a missing Layout must not resolve');
    } catch (error) {
      expect(error).toBeInstanceOf(RendererInvariantError);
      expect((error as RendererInvariantError).reason).toBe('renderer-not-found');
    }
  });
});

import { describe, expect, it } from 'vitest';
import { BUILT_IN_VIEW_IDS, uuidSchema } from '@project/core';
import { loadSpace, type Space } from '@project/graph';
import { canvasRenderers, currentRenderer } from '../src/canvas-renderers';
import {
  createRendererResolver,
  RendererInvariantError,
  type CanvasRendererId,
} from '../src/renderer';
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

const FLOW: CanvasRendererId = { kind: 'view', view: 'flow' };
const GRID: CanvasRendererId = { kind: 'view', view: 'grid' };

describe('canvasRenderers', () => {
  it('offers every built-in View and every authored Layout, in the order each is declared', () => {
    const renderers = canvasRenderers(AUTHORED);

    expect(renderers.computed.map((renderer) => renderer.title)).toEqual(['Flow', 'Grid']);
    expect(renderers.computed.map((renderer) => renderer.selection)).toEqual([FLOW, GRID]);
    expect(renderers.authored).toEqual([
      { selection: { kind: 'layout', layoutId: FIRST_LAYOUT }, title: 'Collection 1' },
      { selection: { kind: 'layout', layoutId: SECOND_LAYOUT }, title: 'Collection 2' },
    ]);
  });

  /** A Space authors its first Layout by editing a View (ADR 0025), so this is how one opens. */
  it('offers the computed group before a Space owns any Layout', () => {
    const renderers = canvasRenderers(space());

    expect(renderers.computed).toHaveLength(2);
    expect(renderers.authored).toEqual([]);
  });

  /**
   * The current row is the list's own row, not an equal one built beside it.
   *
   * Reference identity is no longer what the sidebar presses on — it matches by
   * `canvasRendererKey`, so that it does not have to. It is still the interface:
   * an operation that reconstructed the row would be a second derivation of a
   * title the list already carries, and the canvas header reads that title.
   */
  it('answers with the very row it offered, for a View and for a Layout alike', () => {
    const renderers = canvasRenderers(AUTHORED);
    expect(currentRenderer(renderers, GRID)).toBe(renderers.computed[1]);

    expect(currentRenderer(renderers, { kind: 'layout', layoutId: SECOND_LAYOUT })).toBe(
      renderers.authored[1],
    );
  });

  /**
   * The computed group reads nothing from the Space, so two calls answering with
   * two arrays would be per-call work nothing asked for — and a fresh identity
   * every render for a value that never changes.
   */
  it('builds the computed group once, whatever Space it is asked about', () => {
    expect(canvasRenderers(AUTHORED).computed).toBe(canvasRenderers(space()).computed);
  });

  /**
   * The same answer `resolveRenderer` gives to the same condition. A selection
   * naming a Layout that is gone is a caller that failed to check, which is a
   * defect rather than an author's mistake — so it throws rather than falling
   * back to a View and quietly drawing something else.
   */
  it('refuses a selection naming a Layout the Space does not hold', () => {
    const selection: CanvasRendererId = { kind: 'layout', layoutId: ABSENT_LAYOUT };
    const renderers = canvasRenderers(AUTHORED);

    expect(renderers.authored.map((renderer) => renderer.title)).toEqual([
      'Collection 1',
      'Collection 2',
    ]);
    expect(() => currentRenderer(renderers, selection)).toThrow(RendererInvariantError);
    try {
      currentRenderer(renderers, selection);
      expect.unreachable('a missing Layout must not resolve');
    } catch (error) {
      expect(error).toBeInstanceOf(RendererInvariantError);
      expect((error as RendererInvariantError).reason).toBe('renderer-not-found');
    }
  });

  /**
   * The refusal is the *same* refusal, not a matching one.
   *
   * "Two modules answering one condition two ways is the disagreement this
   * ticket removes" — and a copied message is two answers that happen to agree
   * today. This pins reason and wording together, so reworded in one place and
   * not the other, it fails here rather than in whichever surface reads it.
   */
  it('refuses in the same words the resolver does', () => {
    const selection: CanvasRendererId = { kind: 'layout', layoutId: ABSENT_LAYOUT };
    const resolveRenderer = createRendererResolver({
      newGraphId: () => uuidSchema.parse('00000000-0000-4000-8000-0000000000ff'),
    });

    const fromCanvasRenderers = attempt(() =>
      currentRenderer(canvasRenderers(AUTHORED), selection),
    );
    const fromResolver = attempt(() => resolveRenderer(AUTHORED, selection));

    expect(fromCanvasRenderers.reason).toBe('renderer-not-found');
    expect(fromCanvasRenderers.reason).toBe(fromResolver.reason);
    expect(fromCanvasRenderers.message).toBe(fromResolver.message);
  });

  /**
   * Every built-in View resolves, and to the very row the computed group holds.
   *
   * `BuiltInViewId` is a closed union and `BY_VIEW` has a row for each member,
   * so this is the whole of the View case rather than a sample of it. Reference
   * identity is the assertion because it is what the canvas header draws and
   * what the sidebar's list is asked about.
   */
  it('answers every built-in View with the row the computed group holds', () => {
    const renderers = canvasRenderers(AUTHORED);

    BUILT_IN_VIEW_IDS.forEach((view, index) => {
      expect(currentRenderer(renderers, { kind: 'view', view })).toBe(renderers.computed[index]);
    });
  });

  /**
   * A View is answered by lookup and not by searching the group it was handed.
   *
   * `BY_VIEW` is total over `BuiltInViewId`: there is no "no such View" case to
   * write and none to leave untested. Searching the supplied group put one back
   * — a refusal reachable only by handing in a list `canvasRenderers` would
   * never build, so no test could reach it without a cast. This pins the lookup
   * by asking with the group emptied: the answer never depended on it.
   */
  it('answers a View without consulting the supplied computed group', () => {
    const renderers = canvasRenderers(AUTHORED);

    expect(currentRenderer({ computed: [], authored: renderers.authored }, FLOW)).toBe(
      renderers.computed[0],
    );
  });

  /**
   * Two calls build two authored lists, and equal rows in them are two objects.
   *
   * Stated here because the sidebar is handed a list and a current row and
   * nothing in the type says they came from one call. Under an object-identity
   * pressed test that pairing drew a Layout list with nothing pressed, silently.
   * `WorkspaceSidebar.test.tsx` pins the other half of it.
   */
  it('builds a fresh authored row on each call', () => {
    const selection: CanvasRendererId = { kind: 'layout', layoutId: FIRST_LAYOUT };

    const fromFirstCall = currentRenderer(canvasRenderers(AUTHORED), selection);
    const fromSecondCall = currentRenderer(canvasRenderers(AUTHORED), selection);

    expect(fromSecondCall).toEqual(fromFirstCall);
    expect(fromSecondCall).not.toBe(fromFirstCall);
  });
});

/** The `RendererInvariantError` a call threw, or a failure naming what it did instead. */
function attempt(call: () => unknown): { reason: string; message: string } {
  try {
    call();
  } catch (error) {
    if (error instanceof RendererInvariantError) {
      return { reason: error.reason, message: error.message };
    }
    throw error;
  }
  return expect.unreachable('a missing Layout must not resolve');
}

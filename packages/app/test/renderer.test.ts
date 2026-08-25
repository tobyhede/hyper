import { describe, expect, it } from 'vitest';
import { uuidSchema, type GraphId } from '@project/core';
import { buildLayoutStrategyGraph, loadSpace, Placement, type Space } from '@project/graph';
import { CARD_SIZE } from '../src/card';
import { GRAPH_PALETTE } from '../src/colors';
import {
  createRendererResolver,
  RendererInvariantError,
  type ResolvedViewRenderer,
  type ResolveRenderer,
} from '../src/renderer';
import { cardFile } from './card-files';

/**
 * Every case here goes through a **composed** resolver, because that is the only
 * way the app has one: identity is injected at composition (ADR 0045's fresh
 * identity obligation is the shared module's to enforce, not a View's to keep),
 * so a test that wants to know which Graph id a conversion produced supplies a
 * deterministic source rather than mocking a global.
 */

const CARDS = [
  cardFile('00000000-0000-4000-8000-000000000002'),
  cardFile('00000000-0000-4000-8000-000000000003'),
];
const A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');

const MAIN = {
  id: '00000000-0000-4000-8000-000000000004',
  title: 'Main',
  edges: [{ from: A, to: B }],
};

/** A second Graph, so "every Graph" is more than one. */
const ASIDE = {
  id: '00000000-0000-4000-8000-000000000020',
  title: 'Aside',
  edges: [{ from: B, to: A }],
};

const POSITIONS = {
  [A]: { x: 40, y: 10 },
  [B]: { x: 400, y: 250 },
};

/** The Layout under test, owning one Graph unless a case says otherwise. */
const WORKING = {
  id: '00000000-0000-4000-8000-000000000022',
  title: 'Working',
  kind: 'positioned',
  positions: POSITIONS,
  graphs: [MAIN],
};

/** The same Layout owning both Graphs. */
const WORKING_TWO = { ...WORKING, graphs: [MAIN, ASIDE] };

/** A second Layout over the same Cards, owning the other Graph. */
const SECOND = {
  id: '00000000-0000-4000-8000-000000000023',
  title: 'Second',
  kind: 'positioned',
  positions: {
    [A]: { x: 0, y: 600 },
    [B]: { x: 320, y: 600 },
  },
  graphs: [ASIDE],
};

const LAYOUT_SELECTION = {
  kind: 'layout' as const,
  layoutId: uuidSchema.parse('00000000-0000-4000-8000-000000000022'),
};

function spaceWith(extra: Record<string, unknown> = {}): Space {
  const result = loadSpace(
    {
      version: 1,
      id: '00000000-0000-4000-8000-000000000001',
      title: 'T',
      layouts: [WORKING],
      ...extra,
    },
    CARDS,
  );
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(', '));
  return result.space;
}

/** A `deterministicResolver`'s resolver, and the sequence of ids it minted. */
interface DeterministicResolver {
  readonly resolve: ResolveRenderer;
  readonly minted: GraphId[];
}

/**
 * A resolver whose minted identities are a known sequence, so a conversion's
 * output can be named rather than merely counted.
 */
function deterministicResolver(start = 0x900): DeterministicResolver {
  const minted: GraphId[] = [];
  let next = start;
  const resolve = createRendererResolver({
    newGraphId: () => {
      next += 1;
      const id = uuidSchema.parse(`00000000-0000-4000-8000-${next.toString(16).padStart(12, '0')}`);
      minted.push(id);
      return id;
    },
  });
  return { resolve, minted };
}

const resolver = () => deterministicResolver().resolve;

/** The resolved View variant, or a failure saying it was not one. */
function asView(space: Space, selection?: Parameters<ResolveRenderer>[1]): ResolvedViewRenderer {
  const renderer = resolver()(space, selection);
  if (renderer.kind !== 'view') throw new Error('expected a View renderer');
  return renderer;
}

/**
 * Call something that must refuse, and answer the refusal it made.
 *
 * One call, not two: a `toThrow` followed by a `try`/`catch` that reads the
 * reason runs the subject twice, and the second run is where the reading
 * happens — so a refusal that stopped being reproducible, or a `catch` that was
 * never entered, would take the reason assertion with it silently. Failing here
 * when nothing throws is the whole point.
 */
function refusal(act: () => void): RendererInvariantError {
  try {
    act();
  } catch (error) {
    expect(error).toBeInstanceOf(RendererInvariantError);
    // SAFETY: the assertion above just proved `error` is a
    // RendererInvariantError at runtime; `toBeInstanceOf` has no
    // type-narrowing effect, so this recovers what was just checked.
    return error as RendererInvariantError;
  }
  throw new Error('expected a RendererInvariantError, and nothing was thrown');
}

/** Run a resolved renderer's strategy over its space, so we test what it *does*. */
async function arrange(space: Space) {
  const renderer = resolver()(space);
  const graph = buildLayoutStrategyGraph(
    space.cards.map((c) => c.id),
    new Map(),
    [],
    () => CARD_SIZE,
  );
  const laid = await renderer.strategy(graph);
  return Object.fromEntries(laid.cards.map((c) => [c.id, { x: c.x, y: c.y }]));
}

describe('resolving a renderer', () => {
  it('resolves an explicitly selected View without changing the Space default', async () => {
    const space = spaceWith({ defaultRenderer: '00000000-0000-4000-8000-000000000022' });

    const renderer = resolver()(space, { kind: 'view', view: 'grid' });

    expect(renderer.kind).toBe('view');
    expect(renderer.kind === 'view' && renderer.id).toBe('grid');
    expect(renderer.kind === 'view' && renderer.title).toBe('Grid');
    expect(space.defaultRenderer).toBe('00000000-0000-4000-8000-000000000022');
    const graph = buildLayoutStrategyGraph(
      space.cards.map((card) => card.id),
      new Map(),
      [],
      () => CARD_SIZE,
    );
    const laid = await renderer.strategy(graph);
    expect(laid.cards[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('resolves an explicitly selected Layout without changing the Space default', async () => {
    const space = spaceWith({ defaultRenderer: 'grid' });

    const renderer = resolver()(space, LAYOUT_SELECTION);

    expect(renderer.kind).toBe('layout');
    if (renderer.kind !== 'layout') return;
    expect(renderer.resolvedLayout.layout.title).toBe('Working');
    expect(space.defaultRenderer).toBe('grid');
    const graph = buildLayoutStrategyGraph(
      space.cards.map((card) => card.id),
      new Map(),
      [],
      () => CARD_SIZE,
    );
    const laid = await renderer.strategy(graph);
    expect(laid.cards.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 40, y: 10 },
      { x: 400, y: 250 },
    ]);
  });

  it('reuses the Space’s own canonical ResolvedLayout', () => {
    // Not merely an equal value: the Layout and the Graph it opens active on are
    // resolved once, at intake, and every reader gets that one answer.
    const space = spaceWith();
    const renderer = resolver()(space, LAYOUT_SELECTION);
    expect(renderer.kind === 'layout' && renderer.resolvedLayout).toBe(
      space.lookup.layout(LAYOUT_SELECTION.layoutId),
    );
  });

  it('refuses a selected Layout that the Space does not own', () => {
    const refused = refusal(() =>
      resolver()(spaceWith(), {
        kind: 'layout',
        layoutId: uuidSchema.parse('00000000-0000-4000-8000-000000000099'),
      }),
    );

    expect(refused.reason).toBe('renderer-not-found');
    expect(refused.message).toContain(
      'The selected Layout 00000000-0000-4000-8000-000000000099 does not',
    );
  });

  it('falls back to the graph-driven Flow View when a Space names no View', () => {
    expect(asView(spaceWith()).id).toBe('flow');
  });

  it('resolves a declared Layout and carries its authored placement', () => {
    const renderer = resolver()(spaceWith({ defaultRenderer: WORKING.id }));
    expect(renderer.kind === 'layout' && renderer.resolvedLayout.layout.positions).toEqual(
      POSITIONS,
    );
  });

  it('places cards where a resolved Layout says', async () => {
    expect(await arrange(spaceWith({ defaultRenderer: WORKING.id }))).toEqual({
      [A]: { x: 40, y: 10 },
      [B]: { x: 400, y: 250 },
    });
  });

  it('resolves the built-in grid, which computes placement and carries no Layout', async () => {
    const space = spaceWith({ defaultRenderer: 'grid' });
    expect(resolver()(space).kind).toBe('view');
    // The grid's own arithmetic, not ELK's: first card at the origin.
    expect((await arrange(space))[A]).toEqual({ x: 0, y: 0 });
  });

  it('ignores a declared Layout the space does not open in', () => {
    // `spaceWith()` declares `WORKING`. Naming no `defaultRenderer` is what opens the
    // Space in a View regardless, so the Layout is there to be resolved and is
    // not what resolution answers.
    const space = spaceWith();
    expect(space.layouts.map((layout) => layout.id)).toEqual([WORKING.id]);
    expect(resolver()(space).kind).toBe('view');
  });
});

describe('the subject a renderer names', () => {
  it('gives a View every Card the Space holds, and the flatten across every Layout', () => {
    // Its subject is the Space's Cards (ADR 0045), which is also why it draws the
    // flatten: every Edge endpoint of every Graph is one of them.
    const view = asView(spaceWith({ layouts: [WORKING, SECOND] }));
    expect(view.subject.cards.map((card) => card.id)).toEqual([A, B]);
    expect(view.subject.graphs.map((graph) => graph.id)).toEqual([MAIN.id, ASIDE.id]);
  });

  it('gives a selected Layout its own members, which are its position keys', () => {
    const space = spaceWith({
      layouts: [
        {
          ...WORKING,
          positions: { [A]: { x: 40, y: 10 } },
          graphs: [{ ...MAIN, edges: [{ from: A, to: A }] }],
        },
      ],
      defaultRenderer: WORKING.id,
    });

    const renderer = resolver()(space);
    expect(renderer.subject.cards.map((card) => card.id)).toEqual([A]);
  });

  it('gives a selected Layout the Graphs it owns, not the Space flatten', () => {
    // Ownership is what a Layout's answer now means. `Aside` belongs to a second
    // Layout and is in `space.graphs`, so a resolution still reading the flatten
    // would draw it here — over Cards this Layout may not even hold.
    const space = spaceWith({ layouts: [WORKING, SECOND], defaultRenderer: WORKING.id });
    expect(resolver()(space).subject.graphs.map((graph) => graph.id)).toEqual([MAIN.id]);
  });

  it('selects the Space’s own values rather than copies of them', () => {
    const space = spaceWith({ layouts: [WORKING_TWO] });
    const view = asView(space);
    expect(view.subject.cards[0]).toBe(space.lookup.card(A));
    expect(view.subject.graphs[0]).toBe(space.lookup.graph(uuidSchema.parse(MAIN.id))?.graph);
  });

  it('lists a Layout’s members in the Space’s stable Card order', () => {
    const space = spaceWith({ layouts: [WORKING_TWO], defaultRenderer: WORKING.id });
    const renderer = resolver()(space);
    expect(renderer.subject.cards).toEqual(
      space.cards.filter((card) => card.id === A || card.id === B),
    );
  });
});

describe('the Graph a renderer opens on', () => {
  it('answers a View with the first Graph it draws', () => {
    const view = asView(spaceWith({ layouts: [WORKING_TWO] }));
    expect(view.defaultActiveGraph?.id).toBe(MAIN.id);
  });

  it('answers a View with nothing in a Space that has no Graphs (ADR 0015)', () => {
    // A Layout owns at least one Graph (ADR 0040), so "no Graphs" and "no
    // Layouts" are the same state — and it is where editing starts.
    const view = asView(spaceWith({ layouts: [] }));
    expect(view.subject.graphs).toEqual([]);
    expect(view.defaultActiveGraph).toBeNull();
  });

  it('answers a Layout through its own resolved Active Graph', () => {
    const space = spaceWith({
      layouts: [{ ...WORKING_TWO, activeGraph: ASIDE.id }],
      defaultRenderer: WORKING.id,
    });
    const renderer = resolver()(space);
    expect(renderer.kind === 'layout' && renderer.resolvedLayout.activeGraph.id).toBe(ASIDE.id);
  });

  it('opens a selected Layout on its own first Graph, not the Space’s', () => {
    const space = spaceWith({ layouts: [SECOND, WORKING], defaultRenderer: WORKING.id });
    const renderer = resolver()(space);
    expect(renderer.kind === 'layout' && renderer.resolvedLayout.activeGraph.id).toBe(MAIN.id);
  });
});

describe('converting a View into a Layout’s Graphs', () => {
  const onScreen = Placement.fromEntries([
    [A, { x: 40, y: 10 }],
    [B, { x: 400, y: 250 }],
  ]);

  it('answers a fresh empty Graph, numbered above the Graphs it was showing', () => {
    // Flow's choice among legal outputs, not the boundary's rule (ADR 0045): a
    // copy of the emphasised Graph would satisfy every obligation and is how two
    // Graphs carrying one title start diverging in silence.
    const { resolve, minted } = deterministicResolver();
    const renderer = resolve(spaceWith({ layouts: [WORKING, SECOND] }));
    if (renderer.kind !== 'view') throw new Error('expected a View renderer');

    const converted = renderer.convert(onScreen);

    expect(converted.graphs).toHaveLength(1);
    expect(converted.graphs[0].edges).toEqual([]);
    expect(converted.graphs[0].title).toBe('Graph 1');
    expect(converted.graphs[0].id).toBe(minted[0]);
    expect(renderer.subject.graphs.map((graph) => graph.id)).not.toContain(converted.graphs[0].id);
  });

  it('starts the converted Layout palette at its first position', () => {
    // A conversion creates the Layout, so its initial Graph occupies the first
    // Layout-order position whatever the View was drawing.
    expect(
      asView(spaceWith({ layouts: [WORKING, SECOND] })).convert(onScreen).graphs[0].color,
    ).toBe(GRAPH_PALETTE[0]);
  });

  it('numbers the minted Graph above the highest already taken', () => {
    const space = spaceWith({ layouts: [{ ...WORKING, graphs: [{ ...MAIN, title: 'Graph 4' }] }] });
    expect(asView(space).convert(onScreen).graphs[0].title).toBe('Graph 5');
  });

  it('mints a fresh identity on every conversion', () => {
    const view = asView(spaceWith());
    expect(view.convert(onScreen).graphs[0].id).not.toBe(view.convert(onScreen).graphs[0].id);
  });

  it('converts a Space with no Layouts at all, where there is no Graph to carry over', () => {
    // Zero Graphs in, one or more out (ADR 0045). This is the state a new Space
    // starts in, and the first Card an author moves has to leave it.
    const converted = asView(spaceWith({ layouts: [] })).convert(onScreen);
    expect(converted.graphs).toHaveLength(1);
    expect(converted.graphs[0].title).toBe('Graph 1');
  });

  it('has nothing to convert once a Layout is selected', () => {
    // A Layout is not converted — it is updated in place, and its Graphs keep the
    // identities it already owns. The discriminant is what says so: there is no
    // `convert` on that variant to call.
    const renderer = resolver()(spaceWith({ defaultRenderer: WORKING.id }));
    expect(renderer.kind).toBe('layout');
    expect(renderer).not.toHaveProperty('convert');
  });

  it('refuses a Placement that is not exactly the subject’s Cards', () => {
    const view = asView(spaceWith());
    const short = Placement.fromEntries([[A, { x: 0, y: 0 }]]);

    const refused = refusal(() => view.convert(short));

    expect(refused.reason).toBe('placement-does-not-match-subject');
    expect(refused.message).toContain('not its subject');
  });

  it('refuses a Placement of the right size naming a different Card', () => {
    const view = asView(spaceWith());
    const wrong = Placement.fromEntries([
      [A, { x: 0, y: 0 }],
      [uuidSchema.parse('00000000-0000-4000-8000-000000000099'), { x: 1, y: 1 }],
    ]);

    expect(refusal(() => view.convert(wrong)).reason).toBe('placement-does-not-match-subject');
  });

  it('reports a colliding identity source rather than drawing again', () => {
    // A source that repeats is a fault, and a silent retry would hide it. The
    // collision is with a Graph the Space already holds.
    const resolve = createRendererResolver({
      newGraphId: () => uuidSchema.parse(MAIN.id),
    });
    const renderer = resolve(spaceWith());
    if (renderer.kind !== 'view') throw new Error('expected a View renderer');

    expect(refusal(() => renderer.convert(onScreen)).reason).toBe('graph-id-not-fresh');
  });

  it('is unaffected by which Graph the author was emphasising', () => {
    // Emphasis is not an input to conversion: the Graph a View was emphasising
    // belongs to another Layout and does not come across (ADR 0040).
    const space = spaceWith({ layouts: [WORKING_TWO] });
    const first = deterministicResolver(0x900);
    const second = deterministicResolver(0x900);
    const one = first.resolve(space);
    const two = second.resolve(space);
    if (one.kind !== 'view' || two.kind !== 'view') throw new Error('expected View renderers');

    expect(one.convert(onScreen)).toEqual(two.convert(onScreen));
  });
});

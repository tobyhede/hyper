import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { buildLayoutStrategyGraph, loadSpace, Placement, type Space } from '@project/graph';
import { CARD_SIZE } from '../src/card';
import { convertView, resolveRenderer, type ViewSubject } from '../src/renderer';
import { cardFile } from './card-files';

const CARDS = [
  cardFile('00000000-0000-4000-8000-000000000002'),
  cardFile('00000000-0000-4000-8000-000000000003'),
];
const MAIN = {
  id: '00000000-0000-4000-8000-000000000004',
  title: 'Main',
  edges: [
    { from: '00000000-0000-4000-8000-000000000002', to: '00000000-0000-4000-8000-000000000003' },
  ],
};

/** A second Graph, so "every Graph" is more than one. */
const ASIDE = {
  id: '00000000-0000-4000-8000-000000000020',
  title: 'Aside',
  edges: [
    { from: '00000000-0000-4000-8000-000000000003', to: '00000000-0000-4000-8000-000000000002' },
  ],
};

const POSITIONS = {
  '00000000-0000-4000-8000-000000000002': { x: 40, y: 10 },
  '00000000-0000-4000-8000-000000000003': { x: 400, y: 250 },
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
    '00000000-0000-4000-8000-000000000002': { x: 0, y: 600 },
    '00000000-0000-4000-8000-000000000003': { x: 320, y: 600 },
  },
  graphs: [ASIDE],
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

/** Run a resolved view's strategy over its space, so we test what it *does*. */
async function arrange(space: Space) {
  const view = resolveRenderer(space);
  const graph = buildLayoutStrategyGraph(
    space.cards.map((c) => c.id),
    new Map(),
    [],
    CARD_SIZE,
  );
  const laid = await view.strategy(graph);
  return Object.fromEntries(laid.cards.map((c) => [c.id, { x: c.x, y: c.y }]));
}

describe('resolveRenderer', () => {
  it('resolves an explicitly selected Algorithmic View without changing the Space default', async () => {
    const space = spaceWith({ defaultView: '00000000-0000-4000-8000-000000000022' });

    const view = resolveRenderer(space, { kind: 'view', view: 'grid' });

    expect(view.id).toBe('grid');
    expect(view.layout).toBeNull();
    expect(view).not.toHaveProperty('automatic');
    expect(space.defaultView).toBe('00000000-0000-4000-8000-000000000022');
    const graph = buildLayoutStrategyGraph(
      space.cards.map((card) => card.id),
      new Map(),
      [],
      CARD_SIZE,
    );
    const laid = await view.strategy(graph);
    expect(laid.cards[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('resolves an explicitly selected Positioned Layout without changing the Space default', async () => {
    const space = spaceWith({ defaultView: 'grid' });

    const view = resolveRenderer(space, {
      kind: 'layout',
      layoutId: uuidSchema.parse('00000000-0000-4000-8000-000000000022'),
    });

    expect(view.id).toBe('00000000-0000-4000-8000-000000000022');
    expect(view.layout?.title).toBe('Working');
    expect(space.defaultView).toBe('grid');
    const graph = buildLayoutStrategyGraph(
      space.cards.map((card) => card.id),
      new Map(),
      [],
      CARD_SIZE,
    );
    const laid = await view.strategy(graph);
    expect(laid.cards.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 40, y: 10 },
      { x: 400, y: 250 },
    ]);
  });

  it('rejects a selected Layout that the Space does not own', () => {
    expect(() =>
      resolveRenderer(spaceWith(), {
        kind: 'layout',
        layoutId: uuidSchema.parse('00000000-0000-4000-8000-000000000099'),
      }),
    ).toThrow('The selected Layout 00000000-0000-4000-8000-000000000099 does not exist.');
  });

  it('falls back to the graph-driven Flow View when a Space names no View', () => {
    const view = resolveRenderer(spaceWith());
    expect(view.id).toBe('flow');
    expect(view.layout).toBeNull();
  });

  it('resolves a declared Layout and carries its authored placement', () => {
    const view = resolveRenderer(
      spaceWith({ defaultView: '00000000-0000-4000-8000-000000000022' }),
    );
    expect(view.id).toBe('00000000-0000-4000-8000-000000000022');
    expect(view.layout?.positions).toEqual(POSITIONS);
  });

  it('places cards where a resolved Layout says', async () => {
    expect(
      await arrange(spaceWith({ defaultView: '00000000-0000-4000-8000-000000000022' })),
    ).toEqual({
      '00000000-0000-4000-8000-000000000002': { x: 40, y: 10 },
      '00000000-0000-4000-8000-000000000003': { x: 400, y: 250 },
    });
  });

  it('resolves the built-in grid, which is automatic and so carries no Layout', async () => {
    const space = spaceWith({ defaultView: 'grid' });
    expect(resolveRenderer(space).layout).toBeNull();
    // The grid's own arithmetic, not ELK's: first card at the origin.
    expect((await arrange(space))['00000000-0000-4000-8000-000000000002']).toEqual({ x: 0, y: 0 });
  });

  it('ignores a declared Layout the space does not open in', () => {
    const view = resolveRenderer(spaceWith());
    expect(view.id).toBe('flow');
    expect(view.layout).toBeNull();
  });

  it('shows every graph and opens on the first under an Algorithmic View', () => {
    const space = spaceWith({ layouts: [WORKING_TWO] });
    const view = resolveRenderer(space);
    expect(view.visibleGraphIds).toEqual([
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000020',
    ]);
    expect(view.activeGraphId).toBe('00000000-0000-4000-8000-000000000004');
  });

  it('shows both graphs under a selected Layout that owns both', () => {
    // The two answers coincide here because this Layout owns every Graph the
    // Space holds — not because a Layout draws them all. The case below, where a
    // second Layout owns `Aside`, is what separates them.
    const space = spaceWith({
      layouts: [WORKING_TWO],
      defaultView: '00000000-0000-4000-8000-000000000022',
    });
    const view = resolveRenderer(space);
    expect(view.layout?.id).toBe('00000000-0000-4000-8000-000000000022');
    expect(view.visibleGraphIds).toEqual([
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000020',
    ]);
    expect(view.activeGraphId).toBe('00000000-0000-4000-8000-000000000004');
  });

  it('honours a Layout’s named activeGraph over the first', () => {
    const space = spaceWith({
      layouts: [{ ...WORKING_TWO, activeGraph: '00000000-0000-4000-8000-000000000020' }],
      defaultView: '00000000-0000-4000-8000-000000000022',
    });
    const view = resolveRenderer(space);
    expect(view.visibleGraphIds).toEqual([
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000020',
    ]);
    expect(view.activeGraphId).toBe('00000000-0000-4000-8000-000000000020');
  });

  it('has no active graph in a space with no Layouts (ADR 0015)', () => {
    // A Layout owns at least one Graph (ADR 0040), so "no graphs" and "no
    // Layouts" are now the same state — and it is where editing starts.
    const view = resolveRenderer(spaceWith({ layouts: [] }));
    expect(view.visibleGraphIds).toEqual([]);
    expect(view.activeGraphId).toBeNull();
  });

  it('opens the smallest Layout an author can draw — one Card, one self-Edge', async () => {
    const space = spaceWith({
      layouts: [
        {
          id: '00000000-0000-4000-8000-000000000035',
          title: 'W',
          kind: 'positioned',
          positions: { '00000000-0000-4000-8000-000000000002': { x: 7, y: 9 } },
          graphs: [
            {
              id: '00000000-0000-4000-8000-000000000036',
              title: 'Graph 1',
              edges: [
                {
                  from: '00000000-0000-4000-8000-000000000002',
                  to: '00000000-0000-4000-8000-000000000002',
                },
              ],
            },
          ],
        },
      ],
      defaultView: '00000000-0000-4000-8000-000000000035',
    });
    expect(resolveRenderer(space).layout?.id).toBe('00000000-0000-4000-8000-000000000035');
    expect((await arrange(space))['00000000-0000-4000-8000-000000000002']).toEqual({ x: 7, y: 9 });
  });

  it('answers a selected Layout with the Graphs it owns, not the Space flatten', () => {
    // Ownership is what a Layout's answer now means. `Aside` belongs to a
    // second Layout and is in `space.graphs`, so a resolution still reading the
    // flatten would draw it here — over Cards this Layout may not even hold.
    const space = spaceWith({
      layouts: [WORKING, SECOND],
      defaultView: '00000000-0000-4000-8000-000000000022',
    });
    const view = resolveRenderer(space);

    expect(view.layout?.id).toBe('00000000-0000-4000-8000-000000000022');
    expect(view.visibleGraphIds).toEqual(['00000000-0000-4000-8000-000000000004']);
    expect(view.activeGraphId).toBe('00000000-0000-4000-8000-000000000004');
  });

  it('answers an Algorithmic View with the flatten across every Layout', () => {
    // Its subject is the Space's Cards, so it draws every Graph in the Space
    // flattened across the Layouts that own them (ADR 0045) — derived, never
    // stored, and closed for free because every endpoint is a Space Card.
    const space = spaceWith({ layouts: [WORKING, SECOND] });
    const view = resolveRenderer(space);

    expect(view.id).toBe('flow');
    expect(view.visibleGraphIds).toEqual([
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000020',
    ]);
    expect(view.activeGraphId).toBe('00000000-0000-4000-8000-000000000004');
  });

  it('opens a selected Layout on its own first Graph, not the Space’s', () => {
    // The fallback runs over what the view draws, or a Layout would open active
    // on a Graph it does not own.
    const space = spaceWith({
      layouts: [SECOND, WORKING],
      defaultView: '00000000-0000-4000-8000-000000000022',
    });

    expect(resolveRenderer(space).activeGraphId).toBe('00000000-0000-4000-8000-000000000004');
  });
});

describe('the Card subject a View names', () => {
  it('gives an Algorithmic View every Card the Space holds', () => {
    // Its subject is the Space's Cards (ADR 0045), which is also why it draws
    // the flatten: every Edge endpoint of every Graph is one of them.
    expect(resolveRenderer(spaceWith({ layouts: [WORKING, SECOND] })).cardIds).toEqual([
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
    ]);
  });

  it('gives a selected Layout its own members, which are its position keys', () => {
    const space = spaceWith({
      layouts: [
        {
          ...WORKING,
          positions: { '00000000-0000-4000-8000-000000000002': { x: 40, y: 10 } },
          graphs: [
            {
              ...MAIN,
              edges: [
                {
                  from: '00000000-0000-4000-8000-000000000002',
                  to: '00000000-0000-4000-8000-000000000002',
                },
              ],
            },
          ],
        },
      ],
      defaultView: '00000000-0000-4000-8000-000000000022',
    });

    expect(resolveRenderer(space).cardIds).toEqual(['00000000-0000-4000-8000-000000000002']);
  });
});

describe('converting a View into a Layout', () => {
  const A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
  const B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
  const MINTED_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-0000000000aa');
  /** The one id Flow's conversion mints, supplied rather than mocked (ADR 0016). */
  const mintGraph = () => MINTED_GRAPH;
  const onScreen = Placement.fromEntries([
    [A, { x: 40, y: 10 }],
    [B, { x: 400, y: 250 }],
  ]);

  it('answers a fresh empty Graph, numbered above the Graphs it was showing', () => {
    // Flow's choice among legal outputs, not the boundary's rule (ADR 0045): a
    // copy of the emphasised Graph would satisfy both obligations and is how two
    // Graphs carrying one title start diverging in silence.
    const view = resolveRenderer(spaceWith({ layouts: [WORKING, SECOND] }));
    expect(view.convert).not.toBeNull();

    const converted = view.convert?.(onScreen, mintGraph);

    expect(converted?.graphs).toHaveLength(1);
    expect(converted?.graphs[0]?.edges).toEqual([]);
    expect(converted?.graphs[0]?.title).toBe('Graph 1');
    expect(converted?.graphs[0]?.id).toBe(MINTED_GRAPH);
    expect(view.visibleGraphIds).not.toContain(converted?.graphs[0]?.id);
    expect(Placement.toPositions(converted?.positions ?? Placement.empty())).toEqual({
      [A]: { x: 40, y: 10 },
      [B]: { x: 400, y: 250 },
    });
  });

  it('numbers the minted Graph above the highest already taken', () => {
    const space = spaceWith({
      layouts: [{ ...WORKING, graphs: [{ ...MAIN, title: 'Graph 4' }] }],
    });
    expect(resolveRenderer(space).convert?.(onScreen, mintGraph).graphs[0]?.title).toBe('Graph 5');
  });

  it('has nothing to convert once a Layout is selected', () => {
    // A Layout is not converted — it is updated in place, and its Graphs keep
    // the identities it already owns. `layout` and `convert` are the two sides
    // of one answer.
    const view = resolveRenderer(
      spaceWith({ defaultView: '00000000-0000-4000-8000-000000000022' }),
    );
    expect(view.layout).not.toBeNull();
    expect(view.convert).toBeNull();
  });

  it('converts a Space with no Layouts at all, where there is no Graph to carry over', () => {
    // Zero Graphs in, one or more out (ADR 0045). This is the state a new Space
    // starts in, and the first Card an author moves has to leave it.
    const converted = resolveRenderer(spaceWith({ layouts: [] })).convert?.(onScreen, mintGraph);
    expect(converted?.graphs).toHaveLength(1);
    expect(converted?.graphs[0]?.title).toBe('Graph 1');
  });
});

/**
 * The two obligations of ADR 0045, which sit at this boundary and nowhere else.
 * They are checked against a View written to break them, because a boundary
 * proved only by the Views that already satisfy it is not proved at all.
 */
describe('the conversion boundary', () => {
  const A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
  const B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
  const ABSENT = uuidSchema.parse('00000000-0000-4000-8000-000000000099');
  const SOURCE_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
  const subject: ViewSubject = {
    cardIds: [A, B],
    graphs: [{ id: SOURCE_GRAPH, title: 'Main', edges: [{ from: A, to: B }] }],
  };
  const onScreen = Placement.fromEntries([
    [A, { x: 0, y: 0 }],
    [B, { x: 1, y: 1 }],
  ]);
  /**
   * Every View below writes its returned identities down rather than minting
   * them, so this is only here to satisfy the boundary's signature. Refusing to
   * call it is itself part of what each one is testing: a View that reuses a
   * source identity reached for one it was never given.
   */
  const mintUnused = () => {
    throw new Error('This View mints nothing.');
  };

  it('refuses a View that returns a source Graph’s identity', () => {
    expect(() =>
      convertView(
        (source) => ({
          positions: onScreen,
          graphs: [
            { id: SOURCE_GRAPH, title: 'Copied', edges: [...(source.graphs[0]?.edges ?? [])] },
          ],
        }),
        subject,
        onScreen,
        mintUnused,
      ),
    ).toThrow(/fresh identity/i);
  });

  it('refuses a View whose returned Edge names a Card it did not return', () => {
    expect(() =>
      convertView(
        () => ({
          positions: onScreen,
          graphs: [
            {
              id: uuidSchema.parse('00000000-0000-4000-8000-000000000077'),
              title: 'Pruned',
              edges: [{ from: A, to: ABSENT }],
            },
          ],
        }),
        subject,
        onScreen,
        mintUnused,
      ),
    ).toThrow(/closed/i);
  });

  it('refuses a View that hands two of its Graphs one identity', () => {
    const repeated = uuidSchema.parse('00000000-0000-4000-8000-000000000078');
    expect(() =>
      convertView(
        () => ({
          positions: onScreen,
          graphs: [
            { id: repeated, title: 'One', edges: [] },
            { id: repeated, title: 'Two', edges: [] },
          ],
        }),
        subject,
        onScreen,
        mintUnused,
      ),
    ).toThrow(/fresh identity/i);
  });

  it('passes a View that prunes its subject and keeps its Edges closed', () => {
    // A View may return fewer Cards than it was showing. What it may not do is
    // keep an Edge whose endpoint it dropped — the defect ADR 0045 records from
    // the review of PR #39.
    const pruned = Placement.fromEntries([[A, { x: 0, y: 0 }]]);
    const converted = convertView(
      () => ({
        positions: pruned,
        graphs: [
          {
            id: uuidSchema.parse('00000000-0000-4000-8000-000000000079'),
            title: 'Pruned',
            edges: [{ from: A, to: A }],
          },
        ],
      }),
      subject,
      onScreen,
      mintUnused,
    );

    expect(Placement.toPositions(converted.positions)).toEqual({ [A]: { x: 0, y: 0 } });
  });
});

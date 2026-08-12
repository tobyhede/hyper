import { describe, expect, it } from 'vitest';
import type { BuiltInViewId, Card, Layout, LayoutPosition, Graph, UUID } from '@project/core';
// The whole module is internal: `loadSpace` is the one intake that runs it.
import { validateReferences } from '../src/validate';
import { alias, card, uuid } from './card-files';

const A = uuid('00000000-0000-4000-8000-000000000002');
const B = uuid('00000000-0000-4000-8000-000000000003');
const WORKING = uuid('00000000-0000-4000-8000-000000000022');
const MAIN = uuid('00000000-0000-4000-8000-000000000004');

/**
 * A mutable space-file shape: these tests deliberately construct broken layouts
 * (which `loadSpace` would reject on shape) and hand them straight to
 * `validateReferences`. There is no space-level `graphs` — a graph is reached
 * through the layout that owns it (ADR 0040).
 */
function baseSpaceFile(): {
  title: string;
  cards: Card[];
  layouts: Layout[];
  defaultView?: BuiltInViewId | UUID;
} {
  return {
    title: 'Test',
    cards: [card(A), card(B)],
    layouts: [
      layout(WORKING, { [A]: { x: 0, y: 0 }, [B]: { x: 320, y: 0 } }, [
        { id: MAIN, title: 'Main', edges: [{ from: A, to: B }] },
      ]),
    ],
  };
}

function layout(
  id: UUID,
  positions: Partial<Record<UUID, LayoutPosition>>,
  graphs: Graph[] = [{ id: uuid('00000000-0000-4000-8000-0000000000f0'), title: id, edges: [] }],
): Layout {
  return { id, title: id, kind: 'positioned', positions, graphs };
}

/** The one layout `baseSpaceFile` declares. */
const working = (space: ReturnType<typeof baseSpaceFile>): Layout => space.layouts[0]!;

/** The graph that layout owns. */
const main = (space: ReturnType<typeof baseSpaceFile>): Graph => working(space).graphs[0]!;

describe('validateReferences', () => {
  it('reports no errors for a consistent space', () => {
    expect(validateReferences(baseSpaceFile())).toEqual([]);
  });

  it('accepts a valid single-hop alias to a markdown card', () => {
    const m = baseSpaceFile();
    m.cards.push(alias(uuid('00000000-0000-4000-8000-000000000007'), 'A, again', A));
    expect(validateReferences(m)).toEqual([]);
  });

  it('accepts a graph that closes a cycle (ADR 0032)', () => {
    const m = baseSpaceFile();
    // A → B → A: presenting decides how to traverse the authored loop.
    main(m).edges.push({ from: B, to: A });
    expect(validateReferences(m)).toEqual([]);
  });

  it('rejects an exact duplicate Edge within one Graph', () => {
    const m = baseSpaceFile();
    main(m).edges.push({ ...main(m).edges[0]! });

    expect(validateReferences(m)).toContainEqual({
      kind: 'duplicate-graph-edge',
      ref: '00000000-0000-4000-8000-000000000002 → 00000000-0000-4000-8000-000000000003',
      message:
        'Graph "00000000-0000-4000-8000-000000000004" repeats edge 00000000-0000-4000-8000-000000000002 → 00000000-0000-4000-8000-000000000003 at index 1 (first at index 0)',
    });
  });

  it('accepts a self-edge', () => {
    const m = baseSpaceFile();
    main(m).edges.push({ from: B, to: B });
    expect(validateReferences(m)).toEqual([]);
  });

  it('accepts a cycle in a disconnected component', () => {
    const m = baseSpaceFile();
    const c = uuid('00000000-0000-4000-8000-000000000005');
    const d = uuid('00000000-0000-4000-8000-000000000006');
    m.cards.push(card(c), card(d));
    working(m).positions[c] = { x: 0, y: 200 };
    working(m).positions[d] = { x: 320, y: 200 };
    main(m).edges.push({ from: c, to: d }, { from: d, to: c });
    expect(validateReferences(m)).toEqual([]);
  });

  it('accepts a fork and a merge', () => {
    const m = baseSpaceFile();
    const c = uuid('00000000-0000-4000-8000-000000000005');
    const d = uuid('00000000-0000-4000-8000-000000000006');
    m.cards.push(card(c), card(d));
    working(m).positions[c] = { x: 0, y: 200 };
    working(m).positions[d] = { x: 320, y: 200 };
    // A forks to B and C, which merge back into D. `D` is reachable two ways,
    // which is exactly what a merge is.
    main(m).edges = [
      { from: A, to: B },
      { from: A, to: c },
      { from: B, to: d },
      { from: c, to: d },
    ];
    expect(validateReferences(m)).toEqual([]);
  });

  it('allows the same Edge in two Graphs one layout owns', () => {
    const m = baseSpaceFile();
    working(m).graphs.push({
      id: uuid('00000000-0000-4000-8000-000000000030'),
      title: 'Alt',
      edges: [{ from: A, to: B }],
    });
    expect(validateReferences(m)).toEqual([]);
  });

  it('allows two graphs to disagree about order', () => {
    // Main goes A → B and Alt goes B → A. Their union has a cycle, which a
    // renderer must tolerate (ADR 0032).
    const m = baseSpaceFile();
    working(m).graphs.push({
      id: uuid('00000000-0000-4000-8000-000000000030'),
      title: 'Alt',
      edges: [{ from: B, to: A }],
    });
    expect(validateReferences(m)).toEqual([]);
  });

  it('detects duplicate card ids', () => {
    const m = baseSpaceFile();
    m.cards.push(card(A, 'A dup'));
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'duplicate-card-id' && e.ref === A)).toBe(true);
  });

  it('reports an alias whose target resolves to no card', () => {
    const m = baseSpaceFile();
    m.cards.push(
      alias(
        uuid('00000000-0000-4000-8000-000000000099'),
        'Ghost',
        uuid('00000000-0000-4000-8000-000000000098'),
      ),
    );
    const errors = validateReferences(m);
    expect(
      errors.some(
        (e) =>
          e.kind === 'unresolved-alias-target' &&
          e.ref === uuid('00000000-0000-4000-8000-000000000098'),
      ),
    ).toBe(true);
  });

  it('reports an alias that points at itself', () => {
    const m = baseSpaceFile();
    m.cards.push(
      alias('00000000-0000-4000-8000-000000000010', 'Loop', '00000000-0000-4000-8000-000000000010'),
    );
    const errors = validateReferences(m);
    expect(
      errors.some(
        (e) =>
          e.kind === 'alias-self-reference' &&
          e.ref === uuid('00000000-0000-4000-8000-000000000010'),
      ),
    ).toBe(true);
  });

  it('reports an alias whose target is itself an alias (chains are single-hop)', () => {
    const m = baseSpaceFile();
    m.cards.push(alias('00000000-0000-4000-8000-000000000010', 'First', A));
    m.cards.push(
      alias(
        '00000000-0000-4000-8000-000000000011',
        'Second',
        '00000000-0000-4000-8000-000000000010',
      ),
    );
    const errors = validateReferences(m);
    expect(
      errors.some(
        (e) =>
          e.kind === 'alias-targets-alias' &&
          e.ref === uuid('00000000-0000-4000-8000-000000000010'),
      ),
    ).toBe(true);
  });
});

describe('validateReferences: an Edge is closed over its own Layout (ADR 0040)', () => {
  it('reports an endpoint naming a card the space does not hold, naming which end', () => {
    const m = baseSpaceFile();
    main(m).edges[0]!.to = uuid('00000000-0000-4000-8000-000000000098');
    const errors = validateReferences(m);
    const error = errors.find((e) => e.kind === 'unresolved-graph-edge');
    expect(error?.ref).toBe(uuid('00000000-0000-4000-8000-000000000098'));
    expect(error?.message).toContain('as its to');
  });

  it('reports an endpoint naming a real card the owning layout omits', () => {
    // The failure the space-wide check could not see: `C` is a perfectly good
    // Space card, but this layout does not position it, so it is not a member
    // and an edge here cannot reach it. One rule, no conditions.
    const m = baseSpaceFile();
    const c = uuid('00000000-0000-4000-8000-000000000005');
    m.cards.push(card(c));
    main(m).edges.push({ from: B, to: c });

    const errors = validateReferences(m);
    const error = errors.find((e) => e.kind === 'unresolved-graph-edge');
    expect(error?.ref).toBe(c);
    expect(error?.message).toContain(WORKING);
  });

  it('reports an endpoint naming a card only a second layout holds', () => {
    const m = baseSpaceFile();
    const c = uuid('00000000-0000-4000-8000-000000000005');
    m.cards.push(card(c));
    m.layouts.push(
      layout(uuid('00000000-0000-4000-8000-000000000023'), { [c]: { x: 0, y: 0 } }, [
        { id: uuid('00000000-0000-4000-8000-000000000031'), title: 'Aside', edges: [] },
      ]),
    );
    main(m).edges.push({ from: A, to: c });

    expect(validateReferences(m).some((e) => e.kind === 'unresolved-graph-edge')).toBe(true);
  });
});

describe('validateReferences: a Graph id is unique across the Space (ADR 0045)', () => {
  it('reports one id held by two layouts, naming both owners', () => {
    // Ownership is layout-scoped; the *id* is not. The flatten keys colour,
    // `<graphId>::out`/`::in` handles and activation on the id alone, and
    // `graphsById` is a `new Map` that would drop one of the pair in silence.
    const m = baseSpaceFile();
    const second = uuid('00000000-0000-4000-8000-000000000023');
    m.layouts.push(
      layout(second, { [A]: { x: 0, y: 200 } }, [{ id: MAIN, title: 'Main again', edges: [] }]),
    );

    const errors = validateReferences(m);
    const error = errors.find((e) => e.kind === 'duplicate-graph-id');
    expect(error?.ref).toBe(MAIN);
    expect(error?.message).toContain(WORKING);
    expect(error?.message).toContain(second);
  });

  it('reports one id repeated inside a single layout', () => {
    const m = baseSpaceFile();
    working(m).graphs.push({ id: MAIN, title: 'Main again', edges: [] });

    expect(validateReferences(m).some((e) => e.kind === 'duplicate-graph-id')).toBe(true);
  });

  it('accepts two layouts owning distinct graphs over the same cards', () => {
    const m = baseSpaceFile();
    m.layouts.push(
      layout(
        uuid('00000000-0000-4000-8000-000000000023'),
        { [A]: { x: 0, y: 200 }, [B]: { x: 320, y: 200 } },
        [
          {
            id: uuid('00000000-0000-4000-8000-000000000031'),
            title: 'Aside',
            edges: [{ from: B, to: A }],
          },
        ],
      ),
    );

    expect(validateReferences(m)).toEqual([]);
  });
});

describe('validateReferences: layouts (ADR 0025)', () => {
  it('accepts a space that declares no layouts at all', () => {
    expect(validateReferences({ cards: [card(A)] })).toEqual([]);
  });

  it('accepts a layout that positions every card', () => {
    expect(validateReferences(baseSpaceFile())).toEqual([]);
  });

  it('accepts a layout that omits cards — a card it leaves out is not in it', () => {
    const m = baseSpaceFile();
    m.cards.push(card(uuid('00000000-0000-4000-8000-000000000005')));
    expect(validateReferences(m)).toEqual([]);
  });

  it('reports a position naming a card that does not exist', () => {
    // The dangling position a deleted card leaves behind. Omitting a card is
    // fine; naming one that is gone is not — the asymmetry is the whole rule.
    const m = baseSpaceFile();
    working(m).positions[uuid('00000000-0000-4000-8000-000000000099')] = { x: 10, y: 10 };
    const errors = validateReferences(m);
    expect(
      errors.some(
        (e) =>
          e.kind === 'layout-position-unknown-card' &&
          e.ref === uuid('00000000-0000-4000-8000-000000000099'),
      ),
    ).toBe(true);
  });

  it('reports duplicate layout ids, which an index would silently collapse', () => {
    const m = baseSpaceFile();
    m.layouts.push(
      layout(WORKING, { [A]: { x: 1, y: 1 } }, [
        { id: uuid('00000000-0000-4000-8000-000000000031'), title: 'Other', edges: [] },
      ]),
    );
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'duplicate-layout-id' && e.ref === WORKING)).toBe(true);
  });

  it('accepts a defaultView naming a declared layout', () => {
    const m = baseSpaceFile();
    m.defaultView = WORKING;
    expect(validateReferences(m)).toEqual([]);
  });

  it('accepts a defaultView naming a built-in automatic view', () => {
    for (const view of ['flow', 'grid'] as const) {
      const m = baseSpaceFile();
      m.defaultView = view;
      expect(validateReferences(m)).toEqual([]);
    }
  });

  it('reports a defaultView naming neither a layout nor a built-in', () => {
    const m = baseSpaceFile();
    m.defaultView = uuid('00000000-0000-4000-8000-000000000099');
    const errors = validateReferences(m);
    expect(
      errors.some(
        (e) =>
          e.kind === 'unresolved-default-view' &&
          e.ref === uuid('00000000-0000-4000-8000-000000000099'),
      ),
    ).toBe(true);
  });
});

describe('validateReferences: the graph a Layout opens active (ADR 0026)', () => {
  /** Two graphs in the one layout, so the active one is a choice. */
  function twoGraphs() {
    const m = baseSpaceFile();
    working(m).graphs.push({
      id: uuid('00000000-0000-4000-8000-000000000020'),
      title: 'Aside',
      edges: [{ from: B, to: A }],
    });
    return m;
  }

  it('accepts a layout that names none — the first graph is active', () => {
    expect(validateReferences(twoGraphs())).toEqual([]);
  });

  it('accepts any graph the layout owns as the active one', () => {
    const m = twoGraphs();
    working(m).activeGraph = uuid('00000000-0000-4000-8000-000000000020');
    expect(validateReferences(m)).toEqual([]);
  });

  it('reports an activeGraph no layout has', () => {
    const m = twoGraphs();
    working(m).activeGraph = uuid('00000000-0000-4000-8000-000000000099');
    const errors = validateReferences(m);
    expect(
      errors.some(
        (e) =>
          e.kind === 'layout-unknown-graph' &&
          e.ref === uuid('00000000-0000-4000-8000-000000000099'),
      ),
    ).toBe(true);
  });

  it('reports an activeGraph a *second* layout owns — ownership, not existence', () => {
    // The graph resolves in the space, so a space-wide check would pass it. It
    // is not this layout's to open on, which is what ownership makes checkable.
    const m = baseSpaceFile();
    const elsewhere = uuid('00000000-0000-4000-8000-000000000031');
    m.layouts.push(
      layout(uuid('00000000-0000-4000-8000-000000000023'), { [A]: { x: 0, y: 200 } }, [
        { id: elsewhere, title: 'Aside', edges: [] },
      ]),
    );
    working(m).activeGraph = elsewhere;

    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'layout-unknown-graph' && e.ref === elsewhere)).toBe(true);
  });

  it('names the layout in the message, since the id alone does not say where', () => {
    const m = twoGraphs();
    working(m).activeGraph = uuid('00000000-0000-4000-8000-000000000099');
    const [error] = validateReferences(m);
    expect(error?.message).toContain(`"${WORKING}"`);
  });
});

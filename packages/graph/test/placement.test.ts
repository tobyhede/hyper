import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CardId, Layout } from '@project/core';
import { Placement, positionedStrategy } from '../src/index';
import type { LayoutCard, LayoutGraph } from '../src/index';
import { uuid } from './card-files';

const SIZE = { width: 100, height: 50 };

const CARD_A = uuid('00000000-0000-4000-8000-000000000002');
const CARD_B = uuid('00000000-0000-4000-8000-000000000003');
const CARD_C = uuid('00000000-0000-4000-8000-000000000005');

function cardsOf(...ids: CardId[]): LayoutCard[] {
  return ids.map((id) => ({
    id,
    ...SIZE,
    ports: [
      { id: '00000000-0000-4000-8000-000000000004::in', side: 'in' as const },
      { id: '00000000-0000-4000-8000-000000000004::out', side: 'out' as const },
    ],
  }));
}

const graph: LayoutGraph = { cards: cardsOf(CARD_A, CARD_B, CARD_C), edges: [] };

const at = (entries: Record<string, [number, number]>) =>
  Placement.fromEntries(Object.entries(entries).map(([id, [x, y]]) => [uuid(id), { x, y }]));

const asObject = (placement: Placement) => Object.fromEntries(placement);

describe('Placement.fromLayout', () => {
  it('reads the positions a Layout authored', () => {
    const layout = {
      id: uuid('00000000-0000-4000-8000-000000000021'),
      title: 'Layout 1',
      kind: 'positioned',
      positions: { [CARD_A]: { x: 10, y: 20 }, [CARD_B]: { x: 300, y: 40 } },
    } as unknown as Layout;

    expect(asObject(Placement.fromLayout(layout))).toEqual({
      [CARD_A]: { x: 10, y: 20 },
      [CARD_B]: { x: 300, y: 40 },
    });
  });

  it('carries a Layout that authors no card at all', () => {
    const layout = {
      id: uuid('00000000-0000-4000-8000-000000000021'),
      title: 'Layout 1',
      kind: 'positioned',
      positions: {},
    } as unknown as Layout;

    // Distinct from having no Layout: this one exists and authors nothing yet.
    expect(Placement.fromLayout(layout).size).toBe(0);
  });
});

describe('Placement.fromLayoutGraph', () => {
  it('reads back what a strategy placed', async () => {
    const laid = await positionedStrategy(
      at({
        '00000000-0000-4000-8000-000000000002': [10, 20],
        '00000000-0000-4000-8000-000000000003': [300, 20],
        '00000000-0000-4000-8000-000000000005': [600, 20],
      }),
    )(graph);

    expect(asObject(Placement.fromLayoutGraph(laid))).toEqual({
      [CARD_A]: { x: 10, y: 20 },
      [CARD_B]: { x: 300, y: 20 },
      [CARD_C]: { x: 600, y: 20 },
    });
  });

  it('omits a card no strategy placed, rather than calling it the origin', () => {
    expect([
      ...Placement.fromLayoutGraph({ cards: cardsOf(CARD_A, CARD_B), edges: [] }).keys(),
    ]).toEqual([]);
  });
});

describe('Placement.next', () => {
  it('adopts the whole rendered map when nothing is authored yet', () => {
    // An Algorithmic View authors nothing, and conversion copies every Card
    // already on screen so nothing moves at the moment it happens (ADR 0025).
    const rendered = at({
      '00000000-0000-4000-8000-000000000002': [10, 20],
      '00000000-0000-4000-8000-000000000003': [300, 40],
    });

    expect(Placement.next(null, rendered, [])).toBe(rendered);
  });

  it('leaves an unplaced Card unplaced however often it is drawn', () => {
    // The Card is drawn in `positionedStrategy`'s fallback band, so the renderer
    // reports coordinates for it. Reporting is not authoring.
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });
    const rendered = at({
      '00000000-0000-4000-8000-000000000002': [10, 20],
      '00000000-0000-4000-8000-000000000003': [0, 400],
    });

    expect([...Placement.next(authored, rendered, []).keys()]).toEqual([CARD_A]);
  });

  it('promotes only the Cards a completed gesture placed', () => {
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });
    const rendered = at({
      '00000000-0000-4000-8000-000000000002': [10, 20],
      '00000000-0000-4000-8000-000000000003': [500, 60],
      '00000000-0000-4000-8000-000000000005': [0, 400],
    });

    expect(asObject(Placement.next(authored, rendered, [CARD_B]))).toEqual({
      [CARD_A]: { x: 10, y: 20 },
      [CARD_B]: { x: 500, y: 60 },
    });
  });

  it('refreshes an authored Card that has been dragged', () => {
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });
    const rendered = at({ '00000000-0000-4000-8000-000000000002': [90, 90] });

    expect(asObject(Placement.next(authored, rendered, [CARD_A]))).toEqual({
      [CARD_A]: { x: 90, y: 90 },
    });
  });

  it('keeps an authored coordinate no completed gesture named', () => {
    // A Card in flight is drawn wherever the pointer has taken it, and a
    // reprojection landing mid-drag reports that. No gesture has settled, so
    // `placed` is empty and the authored coordinate is still the one the author
    // last left the Card on. Identity is preserved for the reason the test below
    // gives: a report must not re-arrange a graph nobody has finished moving.
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });
    const rendered = at({ '00000000-0000-4000-8000-000000000002': [90, 90] });

    expect(asObject(Placement.next(authored, rendered, []))).toEqual({
      [CARD_A]: { x: 10, y: 20 },
    });
    expect(Placement.next(authored, rendered, [])).toBe(authored);
  });

  it('moves no authored Card the gesture did not place', () => {
    // The case above is answered by the empty-report fast path, so it says
    // nothing about the merge itself. Here the gesture placed B, so only B's
    // report is authorship: A is drawn wherever the renderer currently has it,
    // and a report is not a move. Without this, `placed` names which Cards may
    // *join* the map while every Card already in it tracks the screen.
    const authored = at({
      '00000000-0000-4000-8000-000000000002': [10, 20],
      '00000000-0000-4000-8000-000000000003': [300, 40],
    });
    const rendered = at({
      '00000000-0000-4000-8000-000000000002': [777, 888],
      '00000000-0000-4000-8000-000000000003': [500, 60],
    });

    expect(asObject(Placement.next(authored, rendered, [CARD_B]))).toEqual({
      [CARD_A]: { x: 10, y: 20 },
      [CARD_B]: { x: 500, y: 60 },
    });
  });

  it('returns the placement it was given when nothing changes', () => {
    // Identity is load-bearing: `usePlacementRendering` re-runs layout whenever
    // this changes identity, so a projection reporting the geometry already on
    // screen must not re-arrange a settled graph.
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });
    const rendered = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });

    expect(Placement.next(authored, rendered, [CARD_A])).toBe(authored);
  });

  it('ignores a placed Card the renderer has no position for', () => {
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });
    const rendered = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });

    expect(Placement.next(authored, rendered, [CARD_B]).has(CARD_B)).toBe(false);
  });
});

describe('Placement.place', () => {
  it('authors a Card no renderer has drawn yet', () => {
    // The atomic create-and-connect Edit places its new Card at the drop point,
    // which cannot arrive through `next` because nothing has rendered it.
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });

    expect(asObject(Placement.place(authored, CARD_B, { x: 640, y: 80 }))).toEqual({
      [CARD_A]: { x: 10, y: 20 },
      [CARD_B]: { x: 640, y: 80 },
    });
  });
});

describe('Placement.empty', () => {
  it('hands each caller its own map rather than one shared instance', () => {
    // Space Authoring installs the Placement it is handed without copying it, so
    // every constructor has to answer with a map only its caller holds. A shared
    // instance is the one way a later mutating helper could reach an authored
    // placement some other holder is still reading.
    expect(Placement.empty()).not.toBe(Placement.empty());
    expect(Placement.empty().size).toBe(0);
  });
});

describe('Placement immutability', () => {
  it('leaves the placements it was given alone', () => {
    // Same reason: nothing may write through to an argument, because the caller
    // that installed it is still holding it.
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });
    const rendered = at({
      '00000000-0000-4000-8000-000000000002': [90, 90],
      '00000000-0000-4000-8000-000000000003': [500, 60],
    });

    Placement.next(authored, rendered, [CARD_A, CARD_B]);
    Placement.place(authored, CARD_C, { x: 1, y: 2 });

    expect(asObject(authored)).toEqual({ [CARD_A]: { x: 10, y: 20 } });
    expect(asObject(rendered)).toEqual({
      [CARD_A]: { x: 90, y: 90 },
      [CARD_B]: { x: 500, y: 60 },
    });
  });

  it('copies the points it is handed instead of aliasing them', () => {
    // `fromEntries` is built from React Flow's live `node.position` objects. A
    // Placement holding those would follow the next drag frame, which is exactly
    // the authored-from-a-report mistake this module exists to prevent.
    const live = { x: 10, y: 20 };
    const placement = Placement.fromEntries([[CARD_A, live]]);

    live.x = 999;

    expect(placement.get(CARD_A)).toEqual({ x: 10, y: 20 });
  });
});

describe('Placement.equals', () => {
  it('answers on value, not identity', () => {
    expect(
      Placement.equals(
        at({ '00000000-0000-4000-8000-000000000002': [10, 20] }),
        at({ '00000000-0000-4000-8000-000000000002': [10, 20] }),
      ),
    ).toBe(true);
  });

  it('separates null from empty', () => {
    // No Layout selected at all, versus a Layout that authors nothing.
    expect(Placement.equals(null, Placement.empty())).toBe(false);
    expect(Placement.equals(null, null)).toBe(true);
  });

  it('notices a moved Card, a gained one and a lost one', () => {
    const base = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });

    expect(Placement.equals(base, at({ '00000000-0000-4000-8000-000000000002': [11, 20] }))).toBe(
      false,
    );
    expect(
      Placement.equals(
        base,
        at({
          '00000000-0000-4000-8000-000000000002': [10, 20],
          '00000000-0000-4000-8000-000000000003': [1, 1],
        }),
      ),
    ).toBe(false);
    expect(Placement.equals(base, Placement.empty())).toBe(false);
  });
});

describe('Placement.toPositions', () => {
  it('round-trips through the record a Layout stores', () => {
    const placement = at({
      '00000000-0000-4000-8000-000000000002': [10, 20],
      '00000000-0000-4000-8000-000000000003': [300, 40],
    });
    const layout = {
      id: uuid('00000000-0000-4000-8000-000000000021'),
      title: 'Layout 1',
      kind: 'positioned',
      positions: Placement.toPositions(placement),
    } as unknown as Layout;

    expect(Placement.equals(Placement.fromLayout(layout), placement)).toBe(true);
  });
});

const idsArb = fc
  .uniqueArray(fc.uuid(), { minLength: 1, maxLength: 8 })
  .map((ids): CardId[] => ids.map(uuid));
const coordArb = fc.integer({ min: -1000, max: 1000 });

describe('Placement properties', () => {
  it('round-trips: replaying a laid-out graph reproduces its placement', async () => {
    // The property that makes conversion a capture rather than a reinterpretation:
    // what the automatic strategy computed is exactly what the Layout means.
    await fc.assert(
      fc.asyncProperty(idsArb, fc.array(coordArb, { minLength: 60 }), async (ids, coords) => {
        const positions = Placement.fromEntries(
          ids.map((id, i) => [id, { x: coords[i * 2] ?? 0, y: coords[i * 2 + 1] ?? 0 }]),
        );
        const laid = await positionedStrategy(positions)({ cards: cardsOf(...ids), edges: [] });
        const replayed = await positionedStrategy(Placement.fromLayoutGraph(laid))({
          cards: cardsOf(...ids),
          edges: [],
        });

        expect(replayed.cards.map((c) => ({ x: c.x, y: c.y }))).toEqual(
          laid.cards.map((c) => ({ x: c.x, y: c.y })),
        );
      }),
    );
  });

  it('never widens an authored placement, whatever a renderer reports', async () => {
    // The rule two commits were spent restoring: rendered geometry is a report,
    // and only a completed gesture may add a Card to the authored map.
    await fc.assert(
      fc.asyncProperty(idsArb, fc.array(coordArb, { minLength: 60 }), async (ids, coords) => {
        const authoredIds = ids.slice(0, Math.ceil(ids.length / 2));
        const authored = Placement.fromEntries(
          authoredIds.map((id, i) => [id, { x: coords[i * 2] ?? 0, y: coords[i * 2 + 1] ?? 0 }]),
        );
        // Everything on screen, including the fallback band the omitted Cards sit in.
        const laid = await positionedStrategy(authored)({ cards: cardsOf(...ids), edges: [] });
        const rendered = Placement.fromLayoutGraph(laid);

        expect([...Placement.next(authored, rendered, []).keys()].sort()).toEqual(
          [...authored.keys()].sort(),
        );
      }),
    );
  });

  it('is inert when a report names no completed gesture, wherever the Cards are drawn', () => {
    // The general statement of the rule above: a report that authors nothing
    // changes nothing — not the Cards in the map and not the coordinates of the
    // ones already there. Whatever a renderer has cards standing on mid-gesture,
    // the authored placement is the same value, unmoved and unwidened.
    fc.assert(
      fc.property(idsArb, fc.array(coordArb, { minLength: 120 }), (ids, coords) => {
        const authoredIds = ids.slice(0, Math.ceil(ids.length / 2));
        const authored = Placement.fromEntries(
          authoredIds.map((id, i) => [id, { x: coords[i * 2] ?? 0, y: coords[i * 2 + 1] ?? 0 }]),
        );
        // Every Card on screen, each one somewhere unrelated to what was authored.
        const rendered = Placement.fromEntries(
          ids.map((id, i) => [id, { x: coords[60 + i * 2] ?? 0, y: coords[60 + i * 2 + 1] ?? 0 }]),
        );

        expect(Placement.next(authored, rendered, [])).toBe(authored);
      }),
    );
  });
});

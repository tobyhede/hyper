import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CardId, CardPlacement, Layout } from '@project/core';
import { Placement, positionedStrategy } from '../src/index';
import type { LayoutStrategyCard, LayoutStrategyGraph } from '../src/index';
import { uuid } from './card-files';

const SIZE = { width: 100, height: 50 };

const CARD_A = uuid('00000000-0000-4000-8000-000000000002');
const CARD_B = uuid('00000000-0000-4000-8000-000000000003');
const CARD_C = uuid('00000000-0000-4000-8000-000000000005');

function cardsOf(...ids: CardId[]): LayoutStrategyCard[] {
  return ids.map((id) => ({
    id,
    ...SIZE,
    ports: [
      { id: '00000000-0000-4000-8000-000000000004::in', side: 'in' as const },
      { id: '00000000-0000-4000-8000-000000000004::out', side: 'out' as const },
    ],
  }));
}

const graph: LayoutStrategyGraph = { cards: cardsOf(CARD_A, CARD_B, CARD_C), edges: [] };

const at = (entries: Record<string, [number, number]>) =>
  Placement.fromEntries(Object.entries(entries).map(([id, [x, y]]) => [uuid(id), { x, y }]));

const asObject = (placement: Placement) => Object.fromEntries(placement);

describe('Placement.fromLayout', () => {
  it('reads the positions a Layout authored', () => {
    const layout: Layout = {
      id: uuid('00000000-0000-4000-8000-000000000021'),
      title: 'Layout 1',
      kind: 'positioned',
      positions: {
        [CARD_A]: { x: 10, y: 20, open: false },
        [CARD_B]: { x: 300, y: 40, open: false },
      },
      graphs: [],
    };

    expect(asObject(Placement.fromLayout(layout))).toEqual({
      [CARD_A]: { x: 10, y: 20, open: false },
      [CARD_B]: { x: 300, y: 40, open: false },
    });
  });

  it('carries a Layout that authors no card at all', () => {
    const layout: Layout = {
      id: uuid('00000000-0000-4000-8000-000000000021'),
      title: 'Layout 1',
      kind: 'positioned',
      positions: {},
      graphs: [],
    };

    // Distinct from having no Layout: this one exists and authors nothing yet.
    expect(Placement.fromLayout(layout).size).toBe(0);
  });
});

describe('Placement.fromLayoutStrategyGraph', () => {
  it('reads back what a strategy placed', async () => {
    const laid = await positionedStrategy(
      at({
        '00000000-0000-4000-8000-000000000002': [10, 20],
        '00000000-0000-4000-8000-000000000003': [300, 20],
        '00000000-0000-4000-8000-000000000005': [600, 20],
      }),
    )(graph);

    expect(asObject(Placement.fromLayoutStrategyGraph(laid))).toEqual({
      [CARD_A]: { x: 10, y: 20, open: false },
      [CARD_B]: { x: 300, y: 20, open: false },
      [CARD_C]: { x: 600, y: 20, open: false },
    });
  });

  it('carries no expansion across, which is why only a View may be converted', async () => {
    const authored = Placement.fromEntries([
      [CARD_A, { x: 0, y: 0, open: true, openSize: { width: 560, height: 420 } }],
      [CARD_B, { x: 300, y: 0, open: false }],
    ]);
    const laid = await positionedStrategy(authored)({
      cards: cardsOf(CARD_A, CARD_B),
      edges: [],
    });

    const converted = Placement.fromLayoutStrategyGraph(laid);

    // Nothing comes back Open: a converted Layout is authored from an
    // Algorithmic View, where nothing is (ADR 0025, ADR 0064).
    expect([...converted.values()].every((at) => !at.open)).toBe(true);
    // And B comes back at its *drawn* x, carrying A's growth as authorship.
    // That is the whole reason this may only ever be handed a strategy graph
    // with nothing Open in it: conversion has no inverse, and
    // `Placement.next` is the one door that does.
    expect(converted.get(CARD_B)).toEqual({ x: 600, y: 0, open: false });
  });

  it('omits a card no strategy placed, rather than calling it the origin', () => {
    expect([
      ...Placement.fromLayoutStrategyGraph({ cards: cardsOf(CARD_A, CARD_B), edges: [] }).keys(),
    ]).toEqual([]);
  });
});

describe('Placement.next', () => {
  it('inverts Expanded Card displacement before authoring a rendered position', () => {
    const authored = Placement.fromEntries([
      [CARD_A, { x: 10, y: 20, open: true, openSize: { width: 360, height: 196 } }],
      [CARD_B, { x: 300, y: 200, open: false }],
    ]);
    const drawn = Placement.drawn(authored);

    expect(asObject(drawn)).toEqual({
      [CARD_A]: { x: 10, y: 20, open: true, openSize: { width: 360, height: 196 } },
      [CARD_B]: { x: 400, y: 250, open: false },
    });
    expect(Placement.next(authored, drawn, [CARD_A, CARD_B])).toBe(authored);
  });

  it('preserves an Expanded Card rect when the renderer reports only its moved position', () => {
    const authored = Placement.fromEntries([
      [CARD_A, { x: 10, y: 20, open: true, openSize: { width: 560, height: 420 } }],
    ]);
    const rendered = Placement.fromEntries([[CARD_A, { x: 90, y: 80, open: false }]]);

    expect(asObject(Placement.next(authored, rendered, [CARD_A]))).toEqual({
      [CARD_A]: { x: 90, y: 80, open: true, openSize: { width: 560, height: 420 } },
    });
  });

  it('inverts displacement when admitting a Card the Layout did not yet place', () => {
    const authored = Placement.fromEntries([
      [CARD_A, { x: 10, y: 20, open: true, openSize: { width: 560, height: 420 } }],
    ]);
    const rendered = Placement.fromEntries([[CARD_B, { x: 500, y: 400, open: false }]]);

    const next = Placement.next(authored, rendered, [CARD_B]);
    expect(asObject(next)).toEqual({
      [CARD_A]: { x: 10, y: 20, open: true, openSize: { width: 560, height: 420 } },
      [CARD_B]: { x: 200, y: 126, open: false },
    });
    expect(Placement.drawn(next).get(CARD_B)).toEqual({ x: 500, y: 400, open: false });
  });

  it('clamps a rendered coordinate inside an expansion gap to its near boundary', () => {
    const authored = Placement.fromEntries([
      [CARD_A, { x: 10, y: 0, open: true, openSize: { width: 360, height: 196 } }],
      [CARD_B, { x: 300, y: 0, open: false }],
    ]);
    const rendered = Placement.place(Placement.drawn(authored), CARD_B, {
      x: 60,
      y: 0,
      open: false,
    });

    const next = Placement.next(authored, rendered, [CARD_B]);

    expect(next.get(CARD_B)).toEqual({ x: 10, y: 0, open: false });
    expect(Placement.drawn(next).get(CARD_B)).toEqual({ x: 10, y: 0, open: false });
  });

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
      [CARD_A]: { x: 10, y: 20, open: false },
      [CARD_B]: { x: 500, y: 60, open: false },
    });
  });

  it('refreshes an authored Card that has been dragged', () => {
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });
    const rendered = at({ '00000000-0000-4000-8000-000000000002': [90, 90] });

    expect(asObject(Placement.next(authored, rendered, [CARD_A]))).toEqual({
      [CARD_A]: { x: 90, y: 90, open: false },
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
      [CARD_A]: { x: 10, y: 20, open: false },
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
      [CARD_A]: { x: 10, y: 20, open: false },
      [CARD_B]: { x: 500, y: 60, open: false },
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

    expect(asObject(Placement.place(authored, CARD_B, { x: 640, y: 80, open: false }))).toEqual({
      [CARD_A]: { x: 10, y: 20, open: false },
      [CARD_B]: { x: 640, y: 80, open: false },
    });
  });
});

describe('Placement.remove', () => {
  it('drops one Card from the placement and leaves the rest where they are', () => {
    // Removing a Card from a Layout removes its membership, and membership *is*
    // the position key (ADR 0040) — so this is the whole of what that Edit does
    // to the map.
    const authored = at({
      '00000000-0000-4000-8000-000000000002': [10, 20],
      '00000000-0000-4000-8000-000000000003': [300, 40],
    });

    expect(asObject(Placement.remove(authored, CARD_A))).toEqual({
      [CARD_B]: { x: 300, y: 40, open: false },
    });
  });

  it('answers the placement it was given when the Card was never in it', () => {
    // Identity, not just equality: an unchanged placement keeps the one it has,
    // so a projection that reports it does not re-arrange a settled graph.
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });

    expect(Placement.remove(authored, CARD_C)).toBe(authored);
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
    Placement.place(authored, CARD_C, { x: 1, y: 2, open: false });
    Placement.remove(authored, CARD_A);

    expect(asObject(authored)).toEqual({ [CARD_A]: { x: 10, y: 20, open: false } });
    expect(asObject(rendered)).toEqual({
      [CARD_A]: { x: 90, y: 90, open: false },
      [CARD_B]: { x: 500, y: 60, open: false },
    });
  });

  it('copies the points it is handed instead of aliasing them', () => {
    // `fromEntries` is built from React Flow's live `node.position` objects. A
    // Placement holding those would follow the next drag frame, which is exactly
    // the authored-from-a-report mistake this module exists to prevent.
    const live: CardPlacement = { x: 10, y: 20, open: false };
    const placement = Placement.fromEntries([[CARD_A, live]]);

    live.x = 999;

    expect(placement.get(CARD_A)).toEqual({ x: 10, y: 20, open: false });
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
    const layout: Layout = {
      id: uuid('00000000-0000-4000-8000-000000000021'),
      title: 'Layout 1',
      kind: 'positioned',
      positions: Placement.toPositions(placement),
      graphs: [],
    };

    expect(Placement.equals(Placement.fromLayout(layout), placement)).toBe(true);
  });
});

const idsArb = fc
  .uniqueArray(fc.uuid(), { minLength: 1, maxLength: 8 })
  .map((ids): CardId[] => ids.map(uuid));
const coordArb = fc.integer({ min: -1000, max: 1000 });
const expandedSizeArb = fc.record({
  width: fc.integer({ min: 261, max: 900 }),
  height: fc.integer({ min: 147, max: 700 }),
});

describe('Placement properties', () => {
  it('round-trips every authored rect through a production-shaped drawn report', () => {
    fc.assert(
      fc.property(
        idsArb,
        fc.array(coordArb, { minLength: 16, maxLength: 16 }),
        fc.array(fc.option(expandedSizeArb, { nil: undefined }), {
          minLength: 8,
          maxLength: 8,
        }),
        (ids, coords, expansions) => {
          const authored = Placement.fromEntries(
            ids.map((id, index) => {
              const at = {
                x: coords[index * 2] ?? 0,
                y: coords[index * 2 + 1] ?? 0,
              };
              const expanded = expansions[index];
              return [id, expanded === undefined ? at : { ...at, expanded }] as const;
            }),
          );
          // Production reports React Flow node positions only. Keeping the
          // authored `expanded` rect on this report would make the inverse test
          // vacuous and is the defect this property exists to prevent.
          const rendered = Placement.fromEntries(
            [...Placement.drawn(authored)].map(([id, at]) => [
              id,
              { x: at.x, y: at.y, open: false },
            ]),
          );

          expect(Placement.next(authored, rendered, [...authored.keys()])).toBe(authored);
        },
      ),
    );
  });

  it('round-trips: replaying a laid-out graph reproduces its placement', async () => {
    // The property that makes conversion a capture rather than a reinterpretation:
    // what the automatic strategy computed is exactly what the Layout means.
    await fc.assert(
      fc.asyncProperty(idsArb, fc.array(coordArb, { minLength: 60 }), async (ids, coords) => {
        const positions = Placement.fromEntries(
          ids.map((id, i) => [
            id,
            { x: coords[i * 2] ?? 0, y: coords[i * 2 + 1] ?? 0, open: false },
          ]),
        );
        const laid = await positionedStrategy(positions)({ cards: cardsOf(...ids), edges: [] });
        const replayed = await positionedStrategy(Placement.fromLayoutStrategyGraph(laid))({
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
          authoredIds.map((id, i) => [
            id,
            { x: coords[i * 2] ?? 0, y: coords[i * 2 + 1] ?? 0, open: false },
          ]),
        );
        // Everything on screen, including the fallback band the omitted Cards sit in.
        const laid = await positionedStrategy(authored)({ cards: cardsOf(...ids), edges: [] });
        const rendered = Placement.fromLayoutStrategyGraph(laid);

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
          authoredIds.map((id, i) => [
            id,
            { x: coords[i * 2] ?? 0, y: coords[i * 2 + 1] ?? 0, open: false },
          ]),
        );
        // Every Card on screen, each one somewhere unrelated to what was authored.
        const rendered = Placement.fromEntries(
          ids.map((id, i) => [
            id,
            { x: coords[60 + i * 2] ?? 0, y: coords[60 + i * 2 + 1] ?? 0, open: false },
          ]),
        );

        expect(Placement.next(authored, rendered, [])).toBe(authored);
      }),
    );
  });
});

describe('Placement.next over an Expanded Card', () => {
  it('authors a drop inside an Expanded Card on the near side of its step', () => {
    const authored = Placement.fromEntries([
      [CARD_A, { x: 0, y: 0, open: true, openSize: { width: 560, height: 420 } }],
      [CARD_B, { x: 1000, y: 1000, open: false }],
    ]);
    // Dropped on top of A, inside the band of drawn coordinates no authored
    // point draws into — the step ADR 0064 accepts.
    const rendered = Placement.fromEntries([[CARD_B, { x: 50, y: 30, open: false }]]);

    const next = Placement.next(authored, rendered, [CARD_B]);

    expect(next.get(CARD_B)).toEqual({ x: 0, y: 0, open: false });
    // The near side is a fixed point, so the Card settles where it was dropped
    // rather than jumping the full growth on the frame after release.
    expect(Placement.drawn(next).get(CARD_B)).toEqual({ x: 0, y: 0, open: false });
  });
});

describe('Placement.drawn under a stored rect smaller than a collapsed Card', () => {
  it('displaces nothing rather than displacing backwards', () => {
    const authored = Placement.fromEntries([
      [CARD_A, { x: 0, y: 0, open: true, openSize: { width: 100, height: 100 } }],
      [CARD_B, { x: 400, y: 400, open: false }],
    ]);

    expect(Placement.drawn(authored).get(CARD_B)).toEqual({ x: 400, y: 400, open: false });
    expect(Placement.next(authored, Placement.drawn(authored), [CARD_B])).toBe(authored);
  });
});

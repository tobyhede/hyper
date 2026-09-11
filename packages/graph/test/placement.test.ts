import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { COLLAPSED_THING_SIZE } from '@project/core';
import type { ThingId, ThingPlacement, Diagram } from '@project/core';
import { Placement, positionedStrategy } from '../src/index';
import type { LayoutStrategyThing, LayoutStrategyGraph } from '../src/index';
import { uuid } from './thing-files';

const SIZE = { width: 100, height: 50 };

const THING_A = uuid('00000000-0000-4000-8000-000000000002');
const THING_B = uuid('00000000-0000-4000-8000-000000000003');
const THING_C = uuid('00000000-0000-4000-8000-000000000005');

function thingsOf(...ids: ThingId[]): LayoutStrategyThing[] {
  return ids.map((id) => ({
    id,
    ...SIZE,
    ports: [
      { id: '00000000-0000-4000-8000-000000000004::in', side: 'in' as const },
      { id: '00000000-0000-4000-8000-000000000004::out', side: 'out' as const },
    ],
  }));
}

const graph: LayoutStrategyGraph = { things: thingsOf(THING_A, THING_B, THING_C), edges: [] };

const at = (entries: Record<string, [number, number]>) =>
  Placement.fromEntries(Object.entries(entries).map(([id, [x, y]]) => [uuid(id), { x, y }]));

const asObject = (placement: Placement) => Object.fromEntries(placement);

describe('Placement.fromDiagram', () => {
  it('reads the positions a Diagram authored', () => {
    const diagram: Diagram = {
      id: uuid('00000000-0000-4000-8000-000000000021'),
      title: 'Diagram 1',
      kind: 'positioned',
      positions: {
        [THING_A]: { x: 10, y: 20, open: false },
        [THING_B]: { x: 300, y: 40, open: false },
      },
      graphs: [],
    };

    expect(asObject(Placement.fromDiagram(diagram))).toEqual({
      [THING_A]: { x: 10, y: 20, open: false },
      [THING_B]: { x: 300, y: 40, open: false },
    });
  });

  it('carries a Diagram that authors no thing at all', () => {
    const diagram: Diagram = {
      id: uuid('00000000-0000-4000-8000-000000000021'),
      title: 'Diagram 1',
      kind: 'positioned',
      positions: {},
      graphs: [],
    };

    // Distinct from having no Diagram: this one exists and authors nothing yet.
    expect(Placement.fromDiagram(diagram).size).toBe(0);
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
      [THING_A]: { x: 10, y: 20, open: false },
      [THING_B]: { x: 300, y: 20, open: false },
      [THING_C]: { x: 600, y: 20, open: false },
    });
  });

  it('carries no Open state across, which is why only a View may be converted', async () => {
    const authored = Placement.fromEntries([
      [THING_A, { x: 0, y: 0, open: true, openSize: { width: 560, height: 420 } }],
      [THING_B, { x: 300, y: 0, open: false }],
    ]);
    const laid = await positionedStrategy(authored)({
      things: thingsOf(THING_A, THING_B),
      edges: [],
    });

    const converted = Placement.fromLayoutStrategyGraph(laid);

    // Nothing comes back Open: a converted Diagram is authored from an
    // empty Placement, where nothing is (ADR 0025, ADR 0064). A's remembered
    // Open Size is what conversion drops on the floor, and there is no way back
    // to it — which is why only a Diagram with nothing Open may be converted.
    expect([...converted.values()].every((at) => !at.open)).toBe(true);
    // B's coordinate survives untouched, because A being Open never moved it at
    // render time: the Edit that opened A did (ADR 0084).
    expect(converted.get(THING_B)).toEqual({ x: 300, y: 0, open: false });
  });

  it('omits a thing no strategy placed, rather than calling it the origin', () => {
    expect([
      ...Placement.fromLayoutStrategyGraph({
        things: thingsOf(THING_A, THING_B),
        edges: [],
      }).keys(),
    ]).toEqual([]);
  });
});

describe('Placement.next', () => {
  it('authors what the canvas reports, whatever else is Open', () => {
    // Nothing is inverted any more: displacement was applied by the Edit that
    // opened A, so B's reported coordinate is already B's authored one and the
    // report round-trips as itself (ADR 0084).
    const authored = Placement.fromEntries([
      [THING_A, { x: 10, y: 20, open: true, openSize: { width: 360, height: 196 } }],
      [THING_B, { x: 300, y: 200, open: false }],
    ]);
    const rendered = Placement.fromEntries([
      [THING_A, { x: 10, y: 20, open: false }],
      [THING_B, { x: 300, y: 200, open: false }],
    ]);

    expect(Placement.next(authored, rendered, [THING_A, THING_B])).toBe(authored);
  });

  it('preserves an Open Thing rect when the renderer reports only its moved position', () => {
    const authored = Placement.fromEntries([
      [THING_A, { x: 10, y: 20, open: true, openSize: { width: 560, height: 420 } }],
    ]);
    const rendered = Placement.fromEntries([[THING_A, { x: 90, y: 80, open: false }]]);

    expect(asObject(Placement.next(authored, rendered, [THING_A]))).toEqual({
      [THING_A]: { x: 90, y: 80, open: true, openSize: { width: 560, height: 420 } },
    });
  });

  it('admits a Thing the Diagram did not yet place at the point reported', () => {
    // Admission reads the report as authorship too. A's Open rect decides
    // nothing about where B lands.
    const authored = Placement.fromEntries([
      [THING_A, { x: 10, y: 20, open: true, openSize: { width: 560, height: 420 } }],
    ]);
    const rendered = Placement.fromEntries([[THING_B, { x: 500, y: 400, open: false }]]);

    expect(asObject(Placement.next(authored, rendered, [THING_B]))).toEqual({
      [THING_A]: { x: 10, y: 20, open: true, openSize: { width: 560, height: 420 } },
      [THING_B]: { x: 500, y: 400, open: false },
    });
  });

  it('adopts the whole rendered map when nothing is authored yet', () => {
    // An automatic strategy authors nothing; capturing its result copies every Thing
    // already on screen so nothing moves at the moment it happens (ADR 0025).
    const rendered = at({
      '00000000-0000-4000-8000-000000000002': [10, 20],
      '00000000-0000-4000-8000-000000000003': [300, 40],
    });

    expect(Placement.next(null, rendered, [])).toBe(rendered);
  });

  it('promotes only the Things a completed gesture placed', () => {
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });
    const rendered = at({
      '00000000-0000-4000-8000-000000000002': [10, 20],
      '00000000-0000-4000-8000-000000000003': [500, 60],
      '00000000-0000-4000-8000-000000000005': [0, 400],
    });

    expect(asObject(Placement.next(authored, rendered, [THING_B]))).toEqual({
      [THING_A]: { x: 10, y: 20, open: false },
      [THING_B]: { x: 500, y: 60, open: false },
    });
  });

  it('refreshes an authored Thing that has been dragged', () => {
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });
    const rendered = at({ '00000000-0000-4000-8000-000000000002': [90, 90] });

    expect(asObject(Placement.next(authored, rendered, [THING_A]))).toEqual({
      [THING_A]: { x: 90, y: 90, open: false },
    });
  });

  it('keeps an authored coordinate no completed gesture named', () => {
    // A Thing in flight is drawn wherever the pointer has taken it, and a
    // reprojection landing mid-drag reports that. No gesture has settled, so
    // `placed` is empty and the authored coordinate is still the one the author
    // last left the Thing on. Identity is preserved for the reason the test below
    // gives: a report must not re-arrange a graph nobody has finished moving.
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });
    const rendered = at({ '00000000-0000-4000-8000-000000000002': [90, 90] });

    expect(asObject(Placement.next(authored, rendered, []))).toEqual({
      [THING_A]: { x: 10, y: 20, open: false },
    });
    expect(Placement.next(authored, rendered, [])).toBe(authored);
  });

  it('moves no authored Thing the gesture did not place', () => {
    // The case above is answered by the empty-report fast path, so it says
    // nothing about the merge itself. Here the gesture placed B, so only B's
    // report is authorship: A is drawn wherever the renderer currently has it,
    // and a report is not a move. Without this, `placed` names which Things may
    // *join* the map while every Thing already in it tracks the screen.
    const authored = at({
      '00000000-0000-4000-8000-000000000002': [10, 20],
      '00000000-0000-4000-8000-000000000003': [300, 40],
    });
    const rendered = at({
      '00000000-0000-4000-8000-000000000002': [777, 888],
      '00000000-0000-4000-8000-000000000003': [500, 60],
    });

    expect(asObject(Placement.next(authored, rendered, [THING_B]))).toEqual({
      [THING_A]: { x: 10, y: 20, open: false },
      [THING_B]: { x: 500, y: 60, open: false },
    });
  });

  it('returns the placement it was given when nothing changes', () => {
    // Identity is load-bearing: `usePlacementRendering` re-runs layout whenever
    // this changes identity, so a projection reporting the geometry already on
    // screen must not re-arrange a settled graph.
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });
    const rendered = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });

    expect(Placement.next(authored, rendered, [THING_A])).toBe(authored);
  });

  it('ignores a placed Thing the renderer has no position for', () => {
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });
    const rendered = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });

    expect(Placement.next(authored, rendered, [THING_B]).has(THING_B)).toBe(false);
  });
});

describe('Placement.place', () => {
  it('authors a Thing no renderer has drawn yet', () => {
    // The atomic create-and-connect Edit places its new Thing at the drop point,
    // which cannot arrive through `next` because nothing has rendered it.
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });

    expect(asObject(Placement.place(authored, THING_B, { x: 640, y: 80, open: false }))).toEqual({
      [THING_A]: { x: 10, y: 20, open: false },
      [THING_B]: { x: 640, y: 80, open: false },
    });
  });
});

describe('Placement.remove', () => {
  it('drops one Thing from the placement and leaves the rest where they are', () => {
    // Removing a Thing from a Diagram removes its membership, and membership *is*
    // the position key (ADR 0040) — so this is the whole of what that Edit does
    // to the map.
    const authored = at({
      '00000000-0000-4000-8000-000000000002': [10, 20],
      '00000000-0000-4000-8000-000000000003': [300, 40],
    });

    expect(asObject(Placement.remove(authored, THING_A))).toEqual({
      [THING_B]: { x: 300, y: 40, open: false },
    });
  });

  it('answers the placement it was given when the Thing was never in it', () => {
    // Identity, not just equality: an unchanged placement keeps the one it has,
    // so a projection that reports it does not re-arrange a settled graph.
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });

    expect(Placement.remove(authored, THING_C)).toBe(authored);
  });
});

describe('Placement.growth', () => {
  it('answers the Open rect less the collapsed one, per axis', () => {
    expect(Placement.growth({ width: 560, height: 420 })).toEqual({ width: 300, height: 274 });
  });

  it('is zero for a Thing Open at exactly the collapsed size', () => {
    expect(Placement.growth(COLLAPSED_THING_SIZE)).toEqual({ width: 0, height: 0 });
  });

  it('floors a stored rect smaller than a collapsed Thing at zero on each axis', () => {
    // Nothing authors one — the resizer's minimum is the collapsed size — but a
    // stored Space is bytes. A negative growth would pull neighbours back over
    // the Thing that caused it, past the subject, where the negating Close can no
    // longer reach them. A rect smaller than a collapsed Thing is not a shrink of
    // its neighbours, so it displaces nobody.
    expect(Placement.growth({ width: 100, height: 100 })).toEqual({ width: 0, height: 0 });
    expect(Placement.growth({ width: 100, height: 700 })).toEqual({ width: 0, height: 554 });
  });

  it('displaces nobody when the growth it computed is a floored one', () => {
    const authored = Placement.fromEntries([
      [THING_A, { x: 0, y: 0, open: true, openSize: { width: 100, height: 100 } }],
      [THING_B, { x: 400, y: 400, open: false }],
    ]);

    expect(
      Placement.displace(authored, THING_A, Placement.growth({ width: 100, height: 100 })),
    ).toBe(authored);
  });
});

describe('Placement.displace', () => {
  const growth = { width: 300, height: 274 };

  it('moves the Things strictly beyond the subject and leaves the rest', () => {
    // Strict, per axis: a Thing level with the subject on an axis does not move
    // on that axis, and one unit beyond it does.
    const authored = Placement.fromEntries([
      [THING_A, { x: 10, y: 20, open: false }],
      [THING_B, { x: 10, y: 20, open: false }],
      [THING_C, { x: 11, y: 21, open: false }],
    ]);

    expect(asObject(Placement.displace(authored, THING_A, growth))).toEqual({
      [THING_A]: { x: 10, y: 20, open: false },
      [THING_B]: { x: 10, y: 20, open: false },
      [THING_C]: { x: 311, y: 295, open: false },
    });
  });

  it('decides each axis on its own', () => {
    // A Thing below the subject and level with it moves down and not right, and
    // the mirror image moves right and not down.
    const authored = Placement.fromEntries([
      [THING_A, { x: 100, y: 100, open: false }],
      [THING_B, { x: 100, y: 500, open: false }],
      [THING_C, { x: 500, y: 100, open: false }],
    ]);

    expect(asObject(Placement.displace(authored, THING_A, growth))).toEqual({
      [THING_A]: { x: 100, y: 100, open: false },
      [THING_B]: { x: 100, y: 774, open: false },
      [THING_C]: { x: 800, y: 100, open: false },
    });
  });

  it('never moves the subject, whatever the growth', () => {
    // A Thing does not displace itself, and `>` is what says so — the subject is
    // not strictly beyond its own coordinate on either axis.
    const authored = Placement.fromEntries([[THING_A, { x: -50, y: -50, open: false }]]);

    expect(Placement.displace(authored, THING_A, growth).get(THING_A)).toEqual({
      x: -50,
      y: -50,
      open: false,
    });
  });

  it('reclaims the room again under the negated growth', () => {
    // How Close is expressed: the same operation, the sign reversed.
    const authored = Placement.fromEntries([
      [THING_A, { x: 0, y: 0, open: false }],
      [THING_B, { x: 400, y: 400, open: false }],
    ]);
    const opened = Placement.displace(authored, THING_A, growth);

    expect(opened.get(THING_B)).toEqual({ x: 700, y: 674, open: false });
    expect(
      asObject(
        Placement.displace(opened, THING_A, { width: -growth.width, height: -growth.height }),
      ),
    ).toEqual(asObject(authored));
  });

  it('is not an involution when the negative growth is applied first', () => {
    // The counter-example the round-trip property's nonnegative bound names,
    // made executable so the bound is a fact rather than prose. B at x = 1 is
    // carried to x = -1 by a width of -2, and the negation that follows skips it
    // because it is no longer strictly beyond A. Unreachable in the product:
    // Open floors its growth at zero and Close only negates one already applied.
    const authored = Placement.fromEntries([
      [THING_A, { x: 0, y: 0, open: false }],
      [THING_B, { x: 1, y: 0, open: false }],
    ]);
    const shrunk = Placement.displace(authored, THING_A, { width: -2, height: 0 });
    const restored = Placement.displace(shrunk, THING_A, { width: 2, height: 0 });

    expect(shrunk.get(THING_B)).toEqual({ x: -1, y: 0, open: false });
    expect(restored.get(THING_B)).toEqual({ x: -1, y: 0, open: false });
  });

  it('carries Open/Closed state and the remembered Open Size through untouched', () => {
    // Only `x` and `y` move. Open Size is stored on the Thing's own entry and
    // survives everything that happens to its neighbours (ADR 0066).
    const authored = Placement.fromEntries([
      [THING_A, { x: 0, y: 0, open: true, openSize: { width: 560, height: 420 } }],
      [THING_B, { x: 400, y: 400, open: true, openSize: { width: 800, height: 600 } }],
      [THING_C, { x: 400, y: 400, open: false, openSize: { width: 700, height: 500 } }],
    ]);

    expect(asObject(Placement.displace(authored, THING_A, growth))).toEqual({
      [THING_A]: { x: 0, y: 0, open: true, openSize: { width: 560, height: 420 } },
      [THING_B]: { x: 700, y: 674, open: true, openSize: { width: 800, height: 600 } },
      [THING_C]: { x: 700, y: 674, open: false, openSize: { width: 700, height: 500 } },
    });
  });

  it('answers the placement it was given when the subject is not a member', () => {
    // Identity, not just equality, for the reason `remove` answers it: an Edit
    // that moved nothing must not re-arrange a settled graph.
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });

    expect(Placement.displace(authored, THING_C, growth)).toBe(authored);
  });

  it('answers the placement it was given when the growth is zero on both axes', () => {
    const authored = at({
      '00000000-0000-4000-8000-000000000002': [10, 20],
      '00000000-0000-4000-8000-000000000003': [300, 40],
    });

    expect(Placement.displace(authored, THING_A, { width: 0, height: 0 })).toBe(authored);
  });

  it('leaves the placement it was given alone', () => {
    const authored = at({
      '00000000-0000-4000-8000-000000000002': [0, 0],
      '00000000-0000-4000-8000-000000000003': [400, 400],
    });

    Placement.displace(authored, THING_A, growth);

    expect(asObject(authored)).toEqual({
      [THING_A]: { x: 0, y: 0, open: false },
      [THING_B]: { x: 400, y: 400, open: false },
    });
  });
});

describe('Placement.reclaim', () => {
  it("gives an Open Thing's room back to the Things beyond it, entry untouched", () => {
    // 400x300 Open against a 260x146 collapsed rect is a growth of 140x154,
    // already written into THING_B's coordinates by the Open Edit.
    const authored = Placement.fromEntries([
      [THING_A, { x: 0, y: 0, open: true, openSize: { width: 400, height: 300 } }],
      [THING_B, { x: 140, y: 154, open: false }],
    ]);

    expect(asObject(Placement.reclaim(authored, THING_A))).toEqual({
      // Still Open, and still remembering the size: reclaiming is the
      // displacement half alone, and the caller writes the entry it wants.
      [THING_A]: { x: 0, y: 0, open: true, openSize: { width: 400, height: 300 } },
      [THING_B]: { x: 0, y: 0, open: false },
    });
  });

  it('reclaims nothing for a Closed Thing that remembers an Open Size', () => {
    // A remembered Open Size is not room the Thing holds — nothing was displaced
    // for it — so there is nothing to give back (ADR 0066).
    const authored = Placement.fromEntries([
      [THING_A, { x: 0, y: 0, open: false, openSize: { width: 400, height: 300 } }],
      [THING_B, { x: 140, y: 154, open: false }],
    ]);

    expect(Placement.reclaim(authored, THING_A)).toBe(authored);
  });

  it('reclaims nothing for a Thing the placement does not hold', () => {
    const authored = at({ [THING_A]: [0, 0] });
    expect(Placement.reclaim(authored, THING_B)).toBe(authored);
  });

  it('undoes exactly the Open that applied the growth', () => {
    const authored = Placement.fromEntries([
      [THING_A, { x: 10, y: 20, open: false }],
      [THING_B, { x: 400, y: 400, open: false }],
    ]);
    const openSize = { width: 560, height: 420 };
    const opened = Placement.place(
      Placement.displace(authored, THING_A, Placement.growth(openSize)),
      THING_A,
      { x: 10, y: 20, open: true, openSize },
    );

    expect(asObject(Placement.reclaim(opened, THING_A))).toEqual({
      [THING_A]: { x: 10, y: 20, open: true, openSize },
      [THING_B]: { x: 400, y: 400, open: false },
    });
  });

  it('reclaims from where the subject is now, not from where it was Opened', () => {
    // The moved-*subject* face of ADR 0084's memorylessness, and the mirror of
    // the moved-neighbour one the ADR states: a reclaim reads the Diagram as it
    // stands, so a subject dragged past its own displaced neighbours finds
    // nobody beyond it and gives nothing back. Deliberate — recording where a
    // particular Open happened is the per-Thing history ADR 0084 rejected.
    const openSize = { width: 560, height: 420 };
    const opened = Placement.fromEntries([
      [THING_A, { x: 5000, y: 5000, open: true, openSize }],
      [THING_B, { x: 600, y: 474, open: false }],
    ]);

    expect(Placement.reclaim(opened, THING_A)).toBe(opened);
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

    Placement.next(authored, rendered, [THING_A, THING_B]);
    Placement.place(authored, THING_C, { x: 1, y: 2, open: false });
    Placement.remove(authored, THING_A);

    expect(asObject(authored)).toEqual({ [THING_A]: { x: 10, y: 20, open: false } });
    expect(asObject(rendered)).toEqual({
      [THING_A]: { x: 90, y: 90, open: false },
      [THING_B]: { x: 500, y: 60, open: false },
    });
  });

  it('copies the points it is handed instead of aliasing them', () => {
    // `fromEntries` is built from React Flow's live `node.position` objects. A
    // Placement holding those would follow the next drag frame, which is exactly
    // the authored-from-a-report mistake this module exists to prevent.
    const live: ThingPlacement = { x: 10, y: 20, open: false };
    const placement = Placement.fromEntries([[THING_A, live]]);

    live.x = 999;

    expect(placement.get(THING_A)).toEqual({ x: 10, y: 20, open: false });
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
    // No Diagram selected at all, versus a Diagram that authors nothing.
    expect(Placement.equals(null, Placement.empty())).toBe(false);
    expect(Placement.equals(null, null)).toBe(true);
  });

  it('notices a moved Thing, a gained one and a lost one', () => {
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
  it('round-trips through the record a Diagram stores', () => {
    const placement = at({
      '00000000-0000-4000-8000-000000000002': [10, 20],
      '00000000-0000-4000-8000-000000000003': [300, 40],
    });
    const diagram: Diagram = {
      id: uuid('00000000-0000-4000-8000-000000000021'),
      title: 'Diagram 1',
      kind: 'positioned',
      positions: Placement.toPositions(placement),
      graphs: [],
    };

    expect(Placement.equals(Placement.fromDiagram(diagram), placement)).toBe(true);
  });
});

const idsArb = fc
  .uniqueArray(fc.uuid(), { minLength: 1, maxLength: 8 })
  .map((ids): ThingId[] => ids.map(uuid));
const coordArb = fc.integer({ min: -1000, max: 1000 });
const openSizeArb = fc.record({
  width: fc.integer({ min: 261, max: 900 }),
  height: fc.integer({ min: 147, max: 700 }),
});

describe('Placement properties', () => {
  it('round-trips a Diagram through opening and closing, for any nonnegative growth', () => {
    // The property Open and Close rest on (ADR 0084): closing reclaims exactly
    // the room opening made, so a Diagram opened and immediately closed is the
    // Diagram it started as — every Thing back on its own coordinate, not merely
    // an equal map.
    //
    // The **nonnegative** bound is load-bearing and is not here to keep the
    // generator tidy. `displace` is not an involution for a negative initial
    // growth, and deliberately: the counter-example below is executable. It is
    // unreachable in the product because Open always applies a growth floored at
    // zero and Close always applies the negation of a growth already applied, so
    // every Thing Close must reclaim from is still beyond the subject when it
    // runs. The fix is to state the bound, not to clamp the operation or make it
    // remember which Things a particular Open pushed.
    fc.assert(
      fc.property(
        idsArb,
        fc.array(coordArb, { minLength: 16, maxLength: 16 }),
        fc.nat({ max: 8 }),
        fc.record({ width: fc.nat({ max: 640 }), height: fc.nat({ max: 480 }) }),
        fc.array(fc.option(openSizeArb, { nil: undefined }), { minLength: 8, maxLength: 8 }),
        (ids, coords, subjectIndex, growth, openSizes) => {
          const placement = Placement.fromEntries(
            ids.map((id, index) => {
              const point = {
                x: coords[index * 2] ?? 0,
                y: coords[index * 2 + 1] ?? 0,
              };
              // Open entries are in the generator because the round trip has to
              // hold over a Diagram with Things already Open in it — Open Size
              // rides through untouched, and only the coordinates move.
              const openSize = openSizes[index];
              return [
                id,
                openSize === undefined
                  ? { ...point, open: false as const }
                  : { ...point, open: true as const, openSize },
              ] as const;
            }),
          );
          const subject = ids[subjectIndex % ids.length];
          if (subject === undefined) return;

          const opened = Placement.displace(placement, subject, growth);
          const closed = Placement.displace(opened, subject, {
            width: -growth.width,
            height: -growth.height,
          });

          expect(asObject(closed)).toEqual(asObject(placement));
        },
      ),
    );
  });

  it('round-trips: replaying a laid-out graph reproduces its placement', async () => {
    // The property that makes conversion a capture rather than a reinterpretation:
    // what the automatic strategy computed is exactly what the Diagram means.
    await fc.assert(
      fc.asyncProperty(idsArb, fc.array(coordArb, { minLength: 60 }), async (ids, coords) => {
        const positions = Placement.fromEntries(
          ids.map((id, i) => [
            id,
            { x: coords[i * 2] ?? 0, y: coords[i * 2 + 1] ?? 0, open: false },
          ]),
        );
        const laid = await positionedStrategy(positions)({ things: thingsOf(...ids), edges: [] });
        const replayed = await positionedStrategy(Placement.fromLayoutStrategyGraph(laid))({
          things: thingsOf(...ids),
          edges: [],
        });

        expect(replayed.things.map((t) => ({ x: t.x, y: t.y }))).toEqual(
          laid.things.map((t) => ({ x: t.x, y: t.y })),
        );
      }),
    );
  });

  it('never widens an authored placement, whatever a renderer reports', async () => {
    // The rule two commits were spent restoring: rendered geometry is a report,
    // and only a completed gesture may add a Thing to the authored map.
    await fc.assert(
      fc.asyncProperty(idsArb, fc.array(coordArb, { minLength: 60 }), async (ids, coords) => {
        const authoredIds = ids.slice(0, Math.ceil(ids.length / 2));
        const authored = Placement.fromEntries(
          authoredIds.map((id, i) => [
            id,
            { x: coords[i * 2] ?? 0, y: coords[i * 2 + 1] ?? 0, open: false },
          ]),
        );
        // A positioned projection contains exactly the authored Diagram members.
        const laid = await positionedStrategy(authored)({ things: thingsOf(...ids), edges: [] });
        const rendered = Placement.fromLayoutStrategyGraph(laid);

        expect([...Placement.next(authored, rendered, []).keys()].sort()).toEqual(
          [...authored.keys()].sort(),
        );
      }),
    );
  });

  it('is inert when a report names no completed gesture, wherever the Things are drawn', () => {
    // The general statement of the rule above: a report that authors nothing
    // changes nothing — not the Things in the map and not the coordinates of the
    // ones already there. Whatever a renderer has things standing on mid-gesture,
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
        // Every Thing on screen, each one somewhere unrelated to what was authored.
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

describe('Placement.next over an Open Thing', () => {
  it('authors a drop on top of an Open Thing exactly where it was released', () => {
    // The clamp band is gone with the derivation that created it (ADR 0084).
    // There is no longer a range of canvas coordinates no authored point can
    // name, so a Thing dropped over an Open one lands on the drop point.
    const authored = Placement.fromEntries([
      [THING_A, { x: 0, y: 0, open: true, openSize: { width: 560, height: 420 } }],
      [THING_B, { x: 1000, y: 1000, open: false }],
    ]);
    const rendered = Placement.fromEntries([[THING_B, { x: 50, y: 30, open: false }]]);

    expect(Placement.next(authored, rendered, [THING_B]).get(THING_B)).toEqual({
      x: 50,
      y: 30,
      open: false,
    });
  });
});

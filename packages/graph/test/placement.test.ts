import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { COLLAPSED_RESOURCE_SIZE } from '@project/core';
import type { ResourceId, ResourcePlacement, Map } from '@project/core';
import { Placement, positionedStrategy } from '../src/index';
import type { LayoutStrategyResource, LayoutStrategyGraph } from '../src/index';
import { uuid } from './resource-files';

const SIZE = { width: 100, height: 50 };

const RESOURCE_A = uuid('00000000-0000-4000-8000-000000000002');
const RESOURCE_B = uuid('00000000-0000-4000-8000-000000000003');
const RESOURCE_C = uuid('00000000-0000-4000-8000-000000000005');

function resourcesOf(...ids: ResourceId[]): LayoutStrategyResource[] {
  return ids.map((id) => ({
    id,
    ...SIZE,
    ports: [
      { id: '00000000-0000-4000-8000-000000000004::in', side: 'in' as const },
      { id: '00000000-0000-4000-8000-000000000004::out', side: 'out' as const },
    ],
  }));
}

const graph: LayoutStrategyGraph = {
  resources: resourcesOf(RESOURCE_A, RESOURCE_B, RESOURCE_C),
  edges: [],
};

const at = (entries: Record<string, [number, number]>) =>
  Placement.fromEntries(Object.entries(entries).map(([id, [x, y]]) => [uuid(id), { x, y }]));

const asObject = (placement: Placement) => Object.fromEntries(placement);

describe('Placement.fromMap', () => {
  it('reads the positions a Map authored', () => {
    const authored: Map = {
      id: uuid('00000000-0000-4000-8000-000000000021'),
      title: 'Map 1',
      kind: 'positioned',
      positions: {
        [RESOURCE_A]: { x: 10, y: 20, open: false },
        [RESOURCE_B]: { x: 300, y: 40, open: false },
      },
      graphs: [],
    };

    expect(asObject(Placement.fromMap(authored))).toEqual({
      [RESOURCE_A]: { x: 10, y: 20, open: false },
      [RESOURCE_B]: { x: 300, y: 40, open: false },
    });
  });

  it('carries a Map that authors no resource at all', () => {
    const authored: Map = {
      id: uuid('00000000-0000-4000-8000-000000000021'),
      title: 'Map 1',
      kind: 'positioned',
      positions: {},
      graphs: [],
    };

    // Distinct from having no Map: this one exists and authors nothing yet.
    expect(Placement.fromMap(authored).size).toBe(0);
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
      [RESOURCE_A]: { x: 10, y: 20, open: false },
      [RESOURCE_B]: { x: 300, y: 20, open: false },
      [RESOURCE_C]: { x: 600, y: 20, open: false },
    });
  });

  it('carries no Open state across, which is why only a View may be converted', async () => {
    const authored = Placement.fromEntries([
      [RESOURCE_A, { x: 0, y: 0, open: true, size: { width: 560, height: 420 } }],
      [RESOURCE_B, { x: 300, y: 0, open: false }],
    ]);
    const laid = await positionedStrategy(authored)({
      resources: resourcesOf(RESOURCE_A, RESOURCE_B),
      edges: [],
    });

    const converted = Placement.fromLayoutStrategyGraph(laid);

    // Nothing comes back Open: `fromLayoutStrategyGraph` authors from an
    // empty Placement, where nothing is. A's remembered Open Size is dropped,
    // and nothing in a laid-out graph can bring it back.
    expect([...converted.values()].every((at) => !at.open)).toBe(true);
    // B's coordinate is untouched, because A being Open does not move it at
    // render time: the Edit that opened A did (ADR 0084).
    expect(converted.get(RESOURCE_B)).toEqual({ x: 300, y: 0, open: false });
  });

  it('omits a resource no strategy placed, rather than calling it the origin', () => {
    expect([
      ...Placement.fromLayoutStrategyGraph({
        resources: resourcesOf(RESOURCE_A, RESOURCE_B),
        edges: [],
      }).keys(),
    ]).toEqual([]);
  });
});

describe('Placement.next', () => {
  it('authors what the canvas reports, whatever else is Open', () => {
    // Nothing is inverted: displacement was applied by the Edit that opened A,
    // so B's reported coordinate is already B's authored one and the report
    // round-trips as itself (ADR 0084).
    const authored = Placement.fromEntries([
      [RESOURCE_A, { x: 10, y: 20, open: true, size: { width: 360, height: 196 } }],
      [RESOURCE_B, { x: 300, y: 200, open: false }],
    ]);
    const rendered = Placement.fromEntries([
      [RESOURCE_A, { x: 10, y: 20, open: false }],
      [RESOURCE_B, { x: 300, y: 200, open: false }],
    ]);

    expect(Placement.next(authored, rendered, [RESOURCE_A, RESOURCE_B])).toBe(authored);
  });

  it('preserves a Resource state, size and Shape when the renderer reports only its moved position', () => {
    const authored = Placement.fromEntries([
      [
        RESOURCE_A,
        { x: 10, y: 20, open: true, size: { width: 560, height: 420 }, shape: 'diamond' },
      ],
    ]);
    const rendered = Placement.fromEntries([[RESOURCE_A, { x: 90, y: 80 }]]);

    expect(asObject(Placement.next(authored, rendered, [RESOURCE_A]))).toEqual({
      [RESOURCE_A]: {
        x: 90,
        y: 80,
        open: true,
        size: { width: 560, height: 420 },
        shape: 'diamond',
      },
    });
  });

  it('admits a Resource the Map did not yet place at the point reported', () => {
    // Admission reads the report as authorship too. A's Open rect decides
    // nothing about where B lands.
    const authored = Placement.fromEntries([
      [RESOURCE_A, { x: 10, y: 20, open: true, size: { width: 560, height: 420 } }],
    ]);
    const rendered = Placement.fromEntries([[RESOURCE_B, { x: 500, y: 400, open: false }]]);

    expect(asObject(Placement.next(authored, rendered, [RESOURCE_B]))).toEqual({
      [RESOURCE_A]: { x: 10, y: 20, open: true, size: { width: 560, height: 420 } },
      [RESOURCE_B]: { x: 500, y: 400, open: false },
    });
  });

  it('adopts the whole rendered map when nothing is authored yet', () => {
    // An automatic strategy authors nothing; capturing its result copies every Resource
    // already on screen so nothing moves at the moment it happens.
    const rendered = at({
      '00000000-0000-4000-8000-000000000002': [10, 20],
      '00000000-0000-4000-8000-000000000003': [300, 40],
    });

    expect(Placement.next(null, rendered, [])).toBe(rendered);
  });

  it('promotes only the Resources a completed gesture placed', () => {
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });
    const rendered = at({
      '00000000-0000-4000-8000-000000000002': [10, 20],
      '00000000-0000-4000-8000-000000000003': [500, 60],
      '00000000-0000-4000-8000-000000000005': [0, 400],
    });

    expect(asObject(Placement.next(authored, rendered, [RESOURCE_B]))).toEqual({
      [RESOURCE_A]: { x: 10, y: 20, open: false },
      [RESOURCE_B]: { x: 500, y: 60, open: false },
    });
  });

  it('refreshes an authored Resource that has been dragged', () => {
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });
    const rendered = at({ '00000000-0000-4000-8000-000000000002': [90, 90] });

    expect(asObject(Placement.next(authored, rendered, [RESOURCE_A]))).toEqual({
      [RESOURCE_A]: { x: 90, y: 90, open: false },
    });
  });

  it('keeps an authored coordinate no completed gesture named', () => {
    // A Resource in flight is drawn wherever the pointer has taken it, and a
    // reprojection landing mid-drag reports that. No gesture has settled, so
    // `placed` is empty and the authored coordinate is still the one the author
    // last left the Resource on. Identity is preserved for the reason the test below
    // gives: a report must not re-arrange a graph nobody has finished moving.
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });
    const rendered = at({ '00000000-0000-4000-8000-000000000002': [90, 90] });

    expect(asObject(Placement.next(authored, rendered, []))).toEqual({
      [RESOURCE_A]: { x: 10, y: 20, open: false },
    });
    expect(Placement.next(authored, rendered, [])).toBe(authored);
  });

  it('moves no authored Resource the gesture did not place', () => {
    // The case above is answered by the empty-report fast path, so it says
    // nothing about the merge itself. Here the gesture placed B, so only B's
    // report is authorship: A is drawn wherever the renderer currently has it,
    // and a report is not a move. Without this, `placed` names which Resources may
    // *join* the map while every Resource already in it tracks the screen.
    const authored = at({
      '00000000-0000-4000-8000-000000000002': [10, 20],
      '00000000-0000-4000-8000-000000000003': [300, 40],
    });
    const rendered = at({
      '00000000-0000-4000-8000-000000000002': [777, 888],
      '00000000-0000-4000-8000-000000000003': [500, 60],
    });

    expect(asObject(Placement.next(authored, rendered, [RESOURCE_B]))).toEqual({
      [RESOURCE_A]: { x: 10, y: 20, open: false },
      [RESOURCE_B]: { x: 500, y: 60, open: false },
    });
  });

  it('returns the placement it was given when nothing changes', () => {
    // Identity is load-bearing: `usePlacementRendering` re-runs layout whenever
    // this changes identity, so a projection reporting the geometry already on
    // screen must not re-arrange a settled graph.
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });
    const rendered = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });

    expect(Placement.next(authored, rendered, [RESOURCE_A])).toBe(authored);
  });

  it('ignores a placed Resource the renderer has no position for', () => {
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });
    const rendered = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });

    expect(Placement.next(authored, rendered, [RESOURCE_B]).has(RESOURCE_B)).toBe(false);
  });
});

describe('Placement.place', () => {
  it('authors a Resource no renderer has drawn yet', () => {
    // The atomic create-and-connect Edit places its new Resource at the drop point,
    // which cannot arrive through `next` because nothing has rendered it.
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });

    expect(asObject(Placement.place(authored, RESOURCE_B, { x: 640, y: 80, open: false }))).toEqual(
      {
        [RESOURCE_A]: { x: 10, y: 20, open: false },
        [RESOURCE_B]: { x: 640, y: 80, open: false },
      },
    );
  });

  it('writes an entry as given, storing no state, size or Shape it was not given', () => {
    expect(asObject(Placement.place(Placement.empty(), RESOURCE_B, { x: 640, y: 80 }))).toEqual({
      [RESOURCE_B]: { x: 640, y: 80 },
    });
  });

  it('keeps the Shape of a whole entry it is given', () => {
    expect(
      asObject(
        Placement.place(Placement.empty(), RESOURCE_B, { x: 0, y: 0, open: false, shape: 'pill' }),
      ),
    ).toEqual({ [RESOURCE_B]: { x: 0, y: 0, open: false, shape: 'pill' } });
  });
});

describe('Placement.remove', () => {
  it('drops one Resource from the placement and leaves the rest where they are', () => {
    // Removing a Resource from a Map removes its membership, and membership *is*
    // the position key (ADR 0040) — so this is the whole of what that Edit does
    // to the map.
    const authored = at({
      '00000000-0000-4000-8000-000000000002': [10, 20],
      '00000000-0000-4000-8000-000000000003': [300, 40],
    });

    expect(asObject(Placement.remove(authored, RESOURCE_A))).toEqual({
      [RESOURCE_B]: { x: 300, y: 40, open: false },
    });
  });

  it('answers the placement it was given when the Resource was never in it', () => {
    // Identity, not just equality: an unchanged placement keeps the one it has,
    // so a projection that reports it does not re-arrange a settled graph.
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });

    expect(Placement.remove(authored, RESOURCE_C)).toBe(authored);
  });
});

describe('Placement.displace', () => {
  const before = COLLAPSED_RESOURCE_SIZE;
  const after = { width: 560, height: 420 };

  it('moves the Resources clear of the subject before the Resize and leaves the rest', () => {
    // Clear means starting at or past the far edge of the subject's rect before
    // the Resize (ADR 0093): a Resource one unit short of that edge overlaps the
    // subject and does not move, and one exactly on it does.
    const { width, height } = before;
    const authored = Placement.fromEntries([
      [RESOURCE_A, { x: 0, y: 0, open: false }],
      [RESOURCE_B, { x: width - 1, y: height - 1, open: false }],
      [RESOURCE_C, { x: width, y: 0, open: false }],
    ]);

    expect(asObject(Placement.displace(authored, RESOURCE_A, before, after))).toEqual({
      [RESOURCE_A]: { x: 0, y: 0, open: false },
      [RESOURCE_B]: { x: width - 1, y: height - 1, open: false },
      [RESOURCE_C]: { x: width + 300, y: 0, open: false },
    });
  });

  it('measures from the size the subject had, not from the Closed Size', () => {
    // A subject already 500 wide: a Resource at x = 400 overlaps it and stays,
    // one at x = 500 is clear and takes the 100 the subject grows by.
    const authored = Placement.fromEntries([
      [RESOURCE_A, { x: 0, y: 0, size: { width: 500, height: 146 } }],
      [RESOURCE_B, { x: 400, y: 0, open: false }],
      [RESOURCE_C, { x: 500, y: 0, open: false }],
    ]);

    const moved = Placement.displace(
      authored,
      RESOURCE_A,
      { width: 500, height: 146 },
      { width: 600, height: 146 },
    );
    expect(moved.get(RESOURCE_B)).toEqual({ x: 400, y: 0, open: false });
    expect(moved.get(RESOURCE_C)).toEqual({ x: 600, y: 0, open: false });
  });

  it('moves a Resource exactly on the bottom edge, and leaves one unit short of it', () => {
    // The y-axis half of "at or past, not strictly past" (ADR 0093). x stays
    // inside the subject's column so roomAxis takes y rather than x first.
    const { width, height } = before;
    const authored = Placement.fromEntries([
      [RESOURCE_A, { x: 0, y: 0, open: false }],
      [RESOURCE_B, { x: width - 1, y: height - 1, open: false }],
      [RESOURCE_C, { x: width - 1, y: height, open: false }],
    ]);

    expect(asObject(Placement.displace(authored, RESOURCE_A, before, after))).toEqual({
      [RESOURCE_A]: { x: 0, y: 0, open: false },
      [RESOURCE_B]: { x: width - 1, y: height - 1, open: false },
      [RESOURCE_C]: { x: width - 1, y: height + 274, open: false },
    });
  });

  it('moves each Resource on one axis, x first', () => {
    // A Resource below the subject and inside its column moves down; one to its
    // right moves right; one clear on both moves right and not down (ADR 0093).
    const authored = Placement.fromEntries([
      [RESOURCE_A, { x: 100, y: 100, open: false }],
      [RESOURCE_B, { x: 100, y: 500, open: false }],
      [RESOURCE_C, { x: 500, y: 500, open: false }],
    ]);

    expect(asObject(Placement.displace(authored, RESOURCE_A, before, after))).toEqual({
      [RESOURCE_A]: { x: 100, y: 100, open: false },
      [RESOURCE_B]: { x: 100, y: 774, open: false },
      [RESOURCE_C]: { x: 800, y: 500, open: false },
    });
  });

  it('does not pull a Resource beside the subject up by the height it never took', () => {
    // A shrink: a Resource to the right of the subject, its top a little below
    // the subject's, gives back only the width.
    const authored = Placement.fromEntries([
      [RESOURCE_A, { x: 0, y: 0, size: after }],
      [RESOURCE_B, { x: 931, y: 48, open: false }],
    ]);

    expect(Placement.displace(authored, RESOURCE_A, after, before).get(RESOURCE_B)).toEqual({
      x: 631,
      y: 48,
      open: false,
    });
  });

  it('never moves the subject, whatever the change', () => {
    const authored = Placement.fromEntries([[RESOURCE_A, { x: -50, y: -50, open: false }]]);

    expect(Placement.displace(authored, RESOURCE_A, before, after).get(RESOURCE_A)).toEqual({
      x: -50,
      y: -50,
      open: false,
    });
  });

  it('restores every position on the shrink back', () => {
    const authored = Placement.fromEntries([
      [RESOURCE_A, { x: 0, y: 0, open: false }],
      [RESOURCE_B, { x: 400, y: 400, open: false }],
    ]);
    const grown = Placement.displace(authored, RESOURCE_A, before, after);

    expect(grown.get(RESOURCE_B)).toEqual({ x: 700, y: 400, open: false });
    expect(asObject(Placement.displace(grown, RESOURCE_A, after, before))).toEqual(
      asObject(authored),
    );
  });

  it('is not an involution when the shrink comes first', () => {
    // B overlaps A's larger rect but is clear of the smaller one, so the shrink
    // skips it and the grow back pushes it. Stated, not repaired: remembering
    // which Resources a Resize pushed is the history ADR 0084 rejected.
    const wide = { width: 500, height: 146 };
    const authored = Placement.fromEntries([
      [RESOURCE_A, { x: 0, y: 0, size: wide }],
      [RESOURCE_B, { x: 300, y: 0, open: false }],
    ]);
    const shrunk = Placement.displace(authored, RESOURCE_A, wide, before);
    const restored = Placement.displace(shrunk, RESOURCE_A, before, wide);

    expect(shrunk.get(RESOURCE_B)).toEqual({ x: 300, y: 0, open: false });
    expect(restored.get(RESOURCE_B)).toEqual({ x: 540, y: 0, open: false });
  });

  it('carries Open/Closed state, size and Shape through untouched', () => {
    // Only `x` and `y` move (ADR 0121).
    const authored = Placement.fromEntries([
      [RESOURCE_A, { x: 0, y: 0, open: true, shape: 'diamond' }],
      [
        RESOURCE_B,
        { x: 400, y: 400, open: true, size: { width: 800, height: 600 }, shape: 'pill' },
      ],
      [RESOURCE_C, { x: 400, y: 400, size: { width: 700, height: 500 }, shape: 'ellipse' }],
    ]);

    expect(asObject(Placement.displace(authored, RESOURCE_A, before, after))).toEqual({
      [RESOURCE_A]: { x: 0, y: 0, open: true, shape: 'diamond' },
      [RESOURCE_B]: {
        x: 700,
        y: 400,
        open: true,
        size: { width: 800, height: 600 },
        shape: 'pill',
      },
      [RESOURCE_C]: {
        x: 700,
        y: 400,
        open: false,
        size: { width: 700, height: 500 },
        shape: 'ellipse',
      },
    });
  });

  it('answers the placement it was given when the subject is not a member', () => {
    // Identity, not just equality, for the reason `remove` answers it: an Edit
    // that moved nothing must not re-arrange a settled graph.
    const authored = at({ '00000000-0000-4000-8000-000000000002': [10, 20] });

    expect(Placement.displace(authored, RESOURCE_C, before, after)).toBe(authored);
  });

  it('answers the placement it was given when the size does not change', () => {
    const authored = at({
      '00000000-0000-4000-8000-000000000002': [10, 20],
      '00000000-0000-4000-8000-000000000003': [300, 40],
    });

    expect(Placement.displace(authored, RESOURCE_A, after, after)).toBe(authored);
  });

  it('leaves the placement it was given alone', () => {
    const authored = at({
      '00000000-0000-4000-8000-000000000002': [0, 0],
      '00000000-0000-4000-8000-000000000003': [400, 400],
    });

    Placement.displace(authored, RESOURCE_A, before, after);

    expect(asObject(authored)).toEqual({
      [RESOURCE_A]: { x: 0, y: 0, open: false },
      [RESOURCE_B]: { x: 400, y: 400, open: false },
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

    Placement.next(authored, rendered, [RESOURCE_A, RESOURCE_B]);
    Placement.place(authored, RESOURCE_C, { x: 1, y: 2, open: false });
    Placement.remove(authored, RESOURCE_A);

    expect(asObject(authored)).toEqual({ [RESOURCE_A]: { x: 10, y: 20, open: false } });
    expect(asObject(rendered)).toEqual({
      [RESOURCE_A]: { x: 90, y: 90, open: false },
      [RESOURCE_B]: { x: 500, y: 60, open: false },
    });
  });

  it('copies the points it is handed instead of referencing them', () => {
    // `fromEntries` is built from React Flow's live `node.position` objects. A
    // Placement holding those would follow the next drag frame, which is exactly
    // the authored-from-a-report mistake this module exists to prevent.
    const live: ResourcePlacement = { x: 10, y: 20, open: false };
    const placement = Placement.fromEntries([[RESOURCE_A, live]]);

    live.x = 999;

    expect(placement.get(RESOURCE_A)).toEqual({ x: 10, y: 20, open: false });
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
    // No Map selected at all, versus a Map that authors nothing.
    expect(Placement.equals(null, Placement.empty())).toBe(false);
    expect(Placement.equals(null, null)).toBe(true);
  });

  it('notices a moved Resource, a gained one and a lost one', () => {
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

  it('notices a Resource drawn in another Shape', () => {
    const withResourceShape = (resourceShape: ResourcePlacement['shape']) =>
      Placement.fromEntries([[RESOURCE_A, { x: 10, y: 20, open: false, shape: resourceShape }]]);

    expect(Placement.equals(withResourceShape('rectangle'), withResourceShape('rectangle'))).toBe(
      true,
    );
    expect(Placement.equals(withResourceShape('rectangle'), withResourceShape('ellipse'))).toBe(
      false,
    );
  });
});

describe('Placement.toPositions', () => {
  it('round-trips through the record a Map stores', () => {
    const placement = at({
      '00000000-0000-4000-8000-000000000002': [10, 20],
      '00000000-0000-4000-8000-000000000003': [300, 40],
    });
    const authored: Map = {
      id: uuid('00000000-0000-4000-8000-000000000021'),
      title: 'Map 1',
      kind: 'positioned',
      positions: Placement.toPositions(placement),
      graphs: [],
    };

    expect(Placement.equals(Placement.fromMap(authored), placement)).toBe(true);
  });
});

const idsArb = fc
  .uniqueArray(fc.uuid(), { minLength: 1, maxLength: 8 })
  .map((ids): ResourceId[] => ids.map(uuid));
const coordArb = fc.integer({ min: -1000, max: 1000 });
const sizeArb = fc.record({
  width: fc.integer({ min: 261, max: 900 }),
  height: fc.integer({ min: 147, max: 700 }),
});

describe('Placement properties', () => {
  it('restores every position through a Resize and the Resize back, for any grow', () => {
    // A grow carries every Resource clear of the subject clear of the grown
    // rect, which is the rect the shrink back measures from, so the pair
    // restores the Map exactly. Grow first: the other order is not an
    // involution, and that asymmetry is stated in `displace`, not clamped.
    fc.assert(
      fc.property(
        idsArb,
        fc.array(coordArb, { minLength: 16, maxLength: 16 }),
        fc.nat({ max: 8 }),
        sizeArb,
        fc.record({ width: fc.nat({ max: 640 }), height: fc.nat({ max: 480 }) }),
        fc.array(fc.option(sizeArb, { nil: undefined }), { minLength: 8, maxLength: 8 }),
        (ids, coords, subjectIndex, before, grow, sizes) => {
          const placement = Placement.fromEntries(
            ids.map((id, index) => {
              const point = {
                x: coords[index * 2] ?? 0,
                y: coords[index * 2 + 1] ?? 0,
              };
              // Resized entries ride through untouched; only coordinates move.
              const size = sizes[index];
              return [
                id,
                size === undefined ? { ...point, open: false } : { ...point, open: true, size },
              ] as const;
            }),
          );
          const subject = ids[subjectIndex % ids.length];
          if (subject === undefined) return;
          const after = { width: before.width + grow.width, height: before.height + grow.height };

          const grown = Placement.displace(placement, subject, before, after);
          const restored = Placement.displace(grown, subject, after, before);

          expect(asObject(restored)).toEqual(asObject(placement));
        },
      ),
    );
  });

  it('round-trips: replaying a laid-out graph reproduces its placement', async () => {
    // The property that makes conversion a capture rather than a reinterpretation:
    // what the automatic strategy computed is exactly what the Map means.
    await fc.assert(
      fc.asyncProperty(idsArb, fc.array(coordArb, { minLength: 60 }), async (ids, coords) => {
        const positions = Placement.fromEntries(
          ids.map((id, i) => [
            id,
            { x: coords[i * 2] ?? 0, y: coords[i * 2 + 1] ?? 0, open: false },
          ]),
        );
        const laid = await positionedStrategy(positions)({
          resources: resourcesOf(...ids),
          edges: [],
        });
        const replayed = await positionedStrategy(Placement.fromLayoutStrategyGraph(laid))({
          resources: resourcesOf(...ids),
          edges: [],
        });

        expect(replayed.resources.map((r) => ({ x: r.x, y: r.y }))).toEqual(
          laid.resources.map((r) => ({ x: r.x, y: r.y })),
        );
      }),
    );
  });

  it('never widens an authored placement, whatever a renderer reports', async () => {
    // The rule: rendered geometry is a report,
    // and only a completed gesture may add a Resource to the authored map.
    await fc.assert(
      fc.asyncProperty(idsArb, fc.array(coordArb, { minLength: 60 }), async (ids, coords) => {
        const authoredIds = ids.slice(0, Math.ceil(ids.length / 2));
        const authored = Placement.fromEntries(
          authoredIds.map((id, i) => [
            id,
            { x: coords[i * 2] ?? 0, y: coords[i * 2 + 1] ?? 0, open: false },
          ]),
        );
        // A positioned projection contains exactly the authored Map members.
        const laid = await positionedStrategy(authored)({
          resources: resourcesOf(...ids),
          edges: [],
        });
        const rendered = Placement.fromLayoutStrategyGraph(laid);

        expect([...Placement.next(authored, rendered, []).keys()].sort()).toEqual(
          [...authored.keys()].sort(),
        );
      }),
    );
  });

  it('is inert when a report names no completed gesture, wherever the Resources are drawn', () => {
    // The general statement of the rule above: a report that authors nothing
    // changes nothing — not the Resources in the map and not the coordinates of the
    // ones already there. Whatever a renderer has resources standing on mid-gesture,
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
        // Every Resource on screen, each one somewhere unrelated to what was authored.
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

describe('Placement.next over a resized Resource', () => {
  it('authors a drop on top of a resized Resource exactly where it was released', () => {
    // Every canvas coordinate is an authored one (ADR 0084), so a Resource
    // dropped over a resized one lands on the drop point.
    const authored = Placement.fromEntries([
      [RESOURCE_A, { x: 0, y: 0, open: true, size: { width: 560, height: 420 } }],
      [RESOURCE_B, { x: 1000, y: 1000, open: false }],
    ]);
    const rendered = Placement.fromEntries([[RESOURCE_B, { x: 50, y: 30, open: false }]]);

    expect(Placement.next(authored, rendered, [RESOURCE_B]).get(RESOURCE_B)).toEqual({
      x: 50,
      y: 30,
      open: false,
    });
  });
});

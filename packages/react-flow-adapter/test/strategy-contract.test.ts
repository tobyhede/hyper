import { describe, expect, it } from 'vitest';
import type { CardId, RouteId } from '@project/core';
import {
  buildLayoutGraph,
  gridStrategy,
  Placement,
  positionedStrategy,
  type CardHandleSet,
  type GraphEdge,
  type LayoutGraph,
  type LayoutStrategy,
} from '@project/graph';
import { elkStrategy } from '../src/index';
import { uuid } from './uuid';

/**
 * The `LayoutStrategy` contract, asserted against every implementation.
 *
 * `gridStrategy`, `positionedStrategy` and `elkStrategy` each had thorough
 * tests, in three files, sharing no assertions. So each was verified to do what
 * *it* does, and nothing checked they agree on the thing they have in common —
 * which is the whole reason the seam exists. AGENTS.md says `gridStrategy` is
 * kept "partly to keep the seam honest"; this is what makes that true.
 *
 * A strategy is free to put cards anywhere. What it may not do is lose one,
 * invent one, drop an edge, rewrite an identity, or return something other than
 * a promise. `elkStrategy` runs the real elkjs here — it is the implementation
 * most able to violate this, being the one that does not simply arrange in a
 * loop, so faking the engine would test the wrong half.
 */

const SIZE = { width: 320, height: 180 };

/** A card with one inbound and one outbound handle, as `buildLayoutGraph` makes
 *  them from a route's edges. */
const handles = (routeId: RouteId): CardHandleSet => ({
  targetHandles: [{ id: `${routeId}::in`, routeId }],
  sourceHandles: [{ id: `${routeId}::out`, routeId }],
});

/**
 * A fork and a merge over five cards — deliberately not a line, since a line is
 * the degenerate case and every fixture route already is one.
 *
 *      b
 *    /   \
 *   a       d — e
 *    \   /
 *      c
 */
function sampleGraph(): LayoutGraph {
  const cardIds = [
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000000006',
    '00000000-0000-4000-8000-000000000008',
  ].map(uuid);
  const routeId = uuid('00000000-0000-4000-8000-000000000004');
  const handlesByCard = new Map(cardIds.map((id) => [id, handles(routeId)]));
  const connections: readonly [CardId, CardId][] = [
    [uuid('00000000-0000-4000-8000-000000000002'), uuid('00000000-0000-4000-8000-000000000003')],
    [uuid('00000000-0000-4000-8000-000000000002'), uuid('00000000-0000-4000-8000-000000000005')],
    [uuid('00000000-0000-4000-8000-000000000003'), uuid('00000000-0000-4000-8000-000000000006')],
    [uuid('00000000-0000-4000-8000-000000000005'), uuid('00000000-0000-4000-8000-000000000006')],
    [uuid('00000000-0000-4000-8000-000000000006'), uuid('00000000-0000-4000-8000-000000000008')],
  ];
  const edges: GraphEdge[] = connections.map(([from, to]) => ({
    id: `${routeId}:${from}->${to}`,
    routeId,
    source: from,
    target: to,
    sourceHandle: `${routeId}::out`,
    targetHandle: `${routeId}::in`,
  }));

  return buildLayoutGraph(cardIds, handlesByCard, edges, SIZE);
}

/** Positions for `positionedStrategy`, which reads an authored Layout. */
const authored = (): Placement =>
  Placement.fromEntries([
    [uuid('00000000-0000-4000-8000-000000000002'), { x: 0, y: 100 }],
    [uuid('00000000-0000-4000-8000-000000000003'), { x: 400, y: 0 }],
    [uuid('00000000-0000-4000-8000-000000000005'), { x: 400, y: 200 }],
    [uuid('00000000-0000-4000-8000-000000000006'), { x: 800, y: 100 }],
    [uuid('00000000-0000-4000-8000-000000000008'), { x: 1200, y: 100 }],
  ]);

const STRATEGIES: [name: string, make: () => LayoutStrategy][] = [
  ['gridStrategy', () => gridStrategy()],
  ['positionedStrategy', () => positionedStrategy(authored())],
  ['elkStrategy', () => elkStrategy()],
];

describe.each(STRATEGIES)('LayoutStrategy contract: %s', (_name, make) => {
  it('returns a promise, whether or not it needs one', async () => {
    // The contract is uniformly async so every caller handles one shape, even
    // though grid and positioned are pure arithmetic.
    const result = make()(sampleGraph());
    expect(result).toBeInstanceOf(Promise);
    await result;
  });

  it('conserves every card, by id, adding and losing none', async () => {
    const input = sampleGraph();
    const output = await make()(input);

    expect(output.cards.map((c) => c.id).sort()).toEqual([
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000005',
      '00000000-0000-4000-8000-000000000006',
      '00000000-0000-4000-8000-000000000008',
    ]);
  });

  it('places every card at finite coordinates', async () => {
    const output = await make()(sampleGraph());

    for (const card of output.cards) {
      expect(Number.isFinite(card.x), `${card.id} has no finite x`).toBe(true);
      expect(Number.isFinite(card.y), `${card.id} has no finite y`).toBe(true);
    }
  });

  it('preserves each card’s declared size', async () => {
    const output = await make()(sampleGraph());

    // A strategy arranges; it does not resize. The view decides how big a card
    // is and passes it in.
    for (const card of output.cards) {
      expect(card.width).toBe(SIZE.width);
      expect(card.height).toBe(SIZE.height);
    }
  });

  it('conserves every edge, with its endpoints and handles intact', async () => {
    const input = sampleGraph();
    const output = await make()(input);

    const identity = (g: LayoutGraph) =>
      g.edges
        .map((e) => `${e.id}|${e.source}|${e.target}|${e.sourceHandle}|${e.targetHandle}`)
        .sort();

    expect(identity(output)).toEqual(identity(input));
  });

  it('keeps every card’s ports, by id and side', async () => {
    const input = sampleGraph();
    const output = await make()(input);

    const ports = (g: LayoutGraph) =>
      g.cards.flatMap((c) => c.ports.map((p) => `${c.id}/${p.id}/${p.side}`)).sort();

    // A handle a strategy dropped is an edge React Flow cannot resolve — its
    // warning #008, and an edge drawn to the wrong point.
    expect(ports(output)).toEqual(ports(input));
  });

  it('does not mutate the graph it was given', async () => {
    const input = sampleGraph();
    const before = JSON.stringify(input);
    await make()(input);

    // Callers reuse the built graph across strategy switches, so arranging must
    // not be destructive.
    expect(JSON.stringify(input)).toBe(before);
  });

  it('arranges an empty graph without complaint', async () => {
    const output = await make()({ cards: [], edges: [] });

    // A new space has one card and no routes, and reaches this on first paint.
    expect(output.cards).toEqual([]);
    expect(output.edges).toEqual([]);
  });

  it('arranges a single card with no edges', async () => {
    const only = buildLayoutGraph(
      [uuid('00000000-0000-4000-8000-000000000099')],
      new Map(),
      [],
      SIZE,
    );
    const output = await make()(only);

    expect(output.cards).toHaveLength(1);
    expect(Number.isFinite(output.cards[0]?.x)).toBe(true);
    expect(Number.isFinite(output.cards[0]?.y)).toBe(true);
  });

  it('separates cards rather than stacking them', async () => {
    const output = await make()(sampleGraph());
    const at = output.cards.map((c) => `${String(c.x)},${String(c.y)}`);

    // Any two cards sharing a coordinate is the failure that looks like a
    // missing card on screen.
    expect(new Set(at).size).toBe(output.cards.length);
  });
});

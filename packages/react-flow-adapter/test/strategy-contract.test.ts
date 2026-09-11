import { describe, expect, it } from 'vitest';
import type { ThingId } from '@project/core';
import {
  buildLayoutStrategyGraph,
  gridStrategy,
  Placement,
  positionedStrategy,
  type GraphRenderEdge,
  type LayoutStrategyGraph,
  type LayoutStrategy,
} from '@project/graph';
import { uuid } from './uuid';

/**
 * The `LayoutStrategy` contract, asserted against every implementation.
 *
 * `gridStrategy` and `positionedStrategy` each had thorough tests, in separate
 * files, sharing no assertions. So each was verified to do what *it* does, and
 * nothing checked they agree on the thing they have in common — which is the
 * whole reason the seam exists. docs/agents/rendering.md says `gridStrategy` is
 * kept "partly to keep the seam honest"; this is what makes that true.
 *
 * A strategy is free to put things anywhere. What it may not do is lose one,
 * invent one, drop an edge, rewrite an identity, or return something other than
 * a promise.
 */

const SIZE = { width: 320, height: 180 };

/**
 * A fork and a merge over five things — deliberately not a line, since a line is
 * the degenerate case and every fixture graph already is one.
 *
 *      b
 *    /   \
 *   a       d — e
 *    \   /
 *      c
 */
function sampleGraph(): LayoutStrategyGraph {
  const thingIds = [
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000000006',
    '00000000-0000-4000-8000-000000000008',
  ].map(uuid);
  const graphId = uuid('00000000-0000-4000-8000-000000000004');
  const connections: readonly [ThingId, ThingId][] = [
    [uuid('00000000-0000-4000-8000-000000000002'), uuid('00000000-0000-4000-8000-000000000003')],
    [uuid('00000000-0000-4000-8000-000000000002'), uuid('00000000-0000-4000-8000-000000000005')],
    [uuid('00000000-0000-4000-8000-000000000003'), uuid('00000000-0000-4000-8000-000000000006')],
    [uuid('00000000-0000-4000-8000-000000000005'), uuid('00000000-0000-4000-8000-000000000006')],
    [uuid('00000000-0000-4000-8000-000000000006'), uuid('00000000-0000-4000-8000-000000000008')],
  ];
  const edges: GraphRenderEdge[] = connections.map(([from, to]) => ({
    id: `${graphId}:${from}->${to}`,
    graphId,
    source: from,
    target: to,
    sourceHandle: `${graphId}::out`,
    targetHandle: `${graphId}::in`,
  }));

  return buildLayoutStrategyGraph(thingIds, edges, () => SIZE);
}

/**
 * Positions for `positionedStrategy`, which reads an authored Diagram.
 *
 * Also covers `00000000...0099`, the single thing `arranges a single thing with
 * no edges` below builds ad hoc: `positionedStrategy` only draws a thing its
 * Placement names (ADR 0040), so the shared cross-strategy contract needs this
 * Diagram to have authored a position for it too.
 */
const authored = (): Placement =>
  Placement.fromEntries([
    [uuid('00000000-0000-4000-8000-000000000002'), { x: 0, y: 100, open: false }],
    [uuid('00000000-0000-4000-8000-000000000003'), { x: 400, y: 0, open: false }],
    [uuid('00000000-0000-4000-8000-000000000005'), { x: 400, y: 200, open: false }],
    [uuid('00000000-0000-4000-8000-000000000006'), { x: 800, y: 100, open: false }],
    [uuid('00000000-0000-4000-8000-000000000008'), { x: 1200, y: 100, open: false }],
    [uuid('00000000-0000-4000-8000-000000000099'), { x: 0, y: 0, open: false }],
  ]);

const STRATEGIES: [name: string, make: () => LayoutStrategy][] = [
  ['gridStrategy', () => gridStrategy()],
  ['positionedStrategy', () => positionedStrategy(authored())],
];

describe.each(STRATEGIES)('LayoutStrategy contract: %s', (_name, make) => {
  it('returns a promise, whether or not it needs one', async () => {
    // The contract is uniformly async so every caller handles one shape, even
    // though grid and positioned are pure arithmetic.
    const result = make()(sampleGraph());
    expect(result).toBeInstanceOf(Promise);
    await result;
  });

  it('conserves every thing, by id, adding and losing none', async () => {
    const input = sampleGraph();
    const output = await make()(input);

    expect(output.things.map((t) => t.id).sort()).toEqual([
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000005',
      '00000000-0000-4000-8000-000000000006',
      '00000000-0000-4000-8000-000000000008',
    ]);
  });

  it('places every thing at finite coordinates', async () => {
    const output = await make()(sampleGraph());

    for (const thing of output.things) {
      expect(Number.isFinite(thing.x), `${thing.id} has no finite x`).toBe(true);
      expect(Number.isFinite(thing.y), `${thing.id} has no finite y`).toBe(true);
    }
  });

  it('preserves each thing’s declared size', async () => {
    const output = await make()(sampleGraph());

    // A strategy arranges; it does not resize. The view decides how big a thing
    // is and passes it in.
    for (const thing of output.things) {
      expect(thing.width).toBe(SIZE.width);
      expect(thing.height).toBe(SIZE.height);
    }
  });

  it('conserves every edge, with its endpoints and handles intact', async () => {
    const input = sampleGraph();
    const output = await make()(input);

    const identity = (g: LayoutStrategyGraph) =>
      g.edges
        .map((e) => `${e.id}|${e.source}|${e.target}|${e.sourceHandle}|${e.targetHandle}`)
        .sort();

    expect(identity(output)).toEqual(identity(input));
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
    const output = await make()({ things: [], edges: [] });

    // A new space has one thing and no graphs, and reaches this on first paint.
    expect(output.things).toEqual([]);
    expect(output.edges).toEqual([]);
  });

  it('arranges a single thing with no edges', async () => {
    const only = buildLayoutStrategyGraph(
      [uuid('00000000-0000-4000-8000-000000000099')],
      [],
      () => SIZE,
    );
    const output = await make()(only);

    expect(output.things).toHaveLength(1);
    expect(Number.isFinite(output.things[0]?.x)).toBe(true);
    expect(Number.isFinite(output.things[0]?.y)).toBe(true);
  });

  it('separates things rather than stacking them', async () => {
    const output = await make()(sampleGraph());
    const at = output.things.map((t) => `${String(t.x)},${String(t.y)}`);

    // Any two things sharing a coordinate is the failure that looks like a
    // missing thing on screen.
    expect(new Set(at).size).toBe(output.things.length);
  });
});

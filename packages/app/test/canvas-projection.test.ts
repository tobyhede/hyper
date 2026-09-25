import { describe, expect, it } from 'vitest';
import { uuidSchema, type MapId } from '@project/core';
import {
  GRAPH_PALETTE,
  loadSpace,
  Placement,
  positionedStrategy,
  type Space,
} from '@project/graph';
import { OTHER_GRAPH_OPACITY } from '@project/react-flow-adapter';
import { canvasProjection, type CanvasInteraction } from '../src/canvas-projection';
import { resolveMap } from '../src/map-resolution';
import { resourceFile } from './resource-files';

const RESOURCE_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const RESOURCE_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const DRAWN_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const SECOND_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000009');

const RESOURCES = [resourceFile(RESOURCE_A), resourceFile(RESOURCE_B)];

const DRAWN = { id: DRAWN_GRAPH, title: 'Drawn', edges: [{ from: RESOURCE_A, to: RESOURCE_B }] };
const OTHER = { id: OTHER_GRAPH, title: 'Other', edges: [{ from: RESOURCE_B, to: RESOURCE_A }] };
const EMPTY = { id: DRAWN_GRAPH, title: 'Empty', edges: [] };

/**
 * An authored Map over both Resources, owning the Graphs it is handed.
 *
 * A Graph is a nested owned value of exactly one Map (ADR 0040), so a Space
 * that holds Graphs is a Space that holds a Map — and this one positions both
 * Resources, which is what closes every owned Edge over its membership.
 */
const mapOwning = (...graphs: readonly object[]) => ({
  id: MAP,
  title: 'Working',
  kind: 'positioned',
  positions: {
    [RESOURCE_A]: { x: 0, y: 0, open: false },
    [RESOURCE_B]: { x: 400, y: 0, open: false },
  },
  graphs,
});

/** Nothing activated, nothing selected. */
const AT_REST: CanvasInteraction = {
  activeGraphId: null,
  activeResourceId: null,
  selectedResourceId: null,
  presenting: false,
};

function spaceWith(extra: Record<string, unknown> = {}): Space {
  const result = loadSpace(
    {
      version: 1,
      id: '00000000-0000-4000-8000-000000000001',
      title: 'T',
      defaultMap: MAP,
      maps: [mapOwning(EMPTY)],
      ...extra,
    },
    RESOURCES,
  );
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(', '));
  return result.space;
}

/** Arrange through the Map's own strategy, so a test sees what the app renders. */
async function projectThrough(
  space: Space,
  interaction: CanvasInteraction = AT_REST,
  selection?: MapId,
) {
  const resolved = resolveMap(space, selection);
  const projection = canvasProjection(space, resolved);
  const laidOut = await positionedStrategy(Placement.fromMap(resolved.map))(
    projection.strategyGraph,
  );
  return { ...projection, ...projection.project(laidOut, interaction) };
}

describe('canvasProjection', () => {
  it('marks authored Map Resources editable', async () => {
    const space = spaceWith({ maps: [mapOwning(DRAWN)] });

    const authored = await projectThrough(space, AT_REST, MAP);

    expect(authored.nodes.map((node) => node.data.readOnly)).toEqual([false, false]);
  });

  it('projects every Map Resource when its Graph is empty', async () => {
    const { nodes } = await projectThrough(spaceWith());

    expect(nodes.map((node) => node.id).sort()).toEqual([RESOURCE_A, RESOURCE_B]);
  });

  it('emphasises the Active Graph without hiding the rest of the Space', async () => {
    const space = spaceWith({ maps: [mapOwning(DRAWN, OTHER)] });

    const equal = await projectThrough(space);
    const emphasised = await projectThrough(space, { ...AT_REST, activeGraphId: DRAWN_GRAPH });

    expect(equal.edges.map((edge) => edge.style?.opacity)).toEqual([1, 1]);
    expect(emphasised.edges.map((edge) => edge.style?.opacity).sort()).toEqual([
      OTHER_GRAPH_OPACITY,
      1,
    ]);
    // Emphasis, not filtering: both Graphs are still drawn (ADR 0026).
    expect(emphasised.edges).toHaveLength(2);
  });

  it('colours the authoring handles as the Active Graph, and as the first slot without one', async () => {
    const space = spaceWith({ maps: [mapOwning({ ...DRAWN, color: '#123456' })] });

    const active = await projectThrough(space, { ...AT_REST, activeGraphId: DRAWN_GRAPH });
    const none = await projectThrough(spaceWith());

    expect(active.nodes.map((node) => node.data.activeGraphColor)).toEqual(['#123456', '#123456']);
    // A first connection is drawn before the Graph it mints exists, so a Space
    // with no Active Graph still needs a stroke.
    expect(none.nodes[0]?.data.activeGraphColor).toBe(GRAPH_PALETTE[0]);
  });

  it('recedes the Edges of every Graph but the Active one', async () => {
    const space = spaceWith({ maps: [mapOwning(DRAWN, OTHER)] });

    const { edges } = await projectThrough(space, { ...AT_REST, activeGraphId: DRAWN_GRAPH });

    const opacityOf = (graphId: string) =>
      Number(edges.find((edge) => edge.data?.['graphId'] === graphId)?.style?.opacity);
    expect(opacityOf(DRAWN_GRAPH)).toBe(1);
    expect(opacityOf(OTHER_GRAPH)).toBeLessThan(1);
  });

  /*
   * Two Space Resources on one target, selecting one Map at different Graphs
   * (ADR 0026).
   *
   * Which Edges an embedding draws is the Map's business, and which one it
   * emphasises is the Resource's, so a pair that differs only by stored Graph has
   * to come out identical in membership and opposite in emphasis. Asserted as a
   * pair rather than as two separate projections: one projection emphasising
   * correctly says nothing about whether the other one drew the same Space, and
   * a regression that let `activeGraphId` filter rather than emphasise would
   * satisfy every single-projection claim above.
   */
  it('draws one Map at two Graphs with the same Edges and opposite emphasis', async () => {
    const space = spaceWith({ maps: [mapOwning(DRAWN, OTHER)] });

    const onDrawn = await projectThrough(space, { ...AT_REST, activeGraphId: DRAWN_GRAPH });
    const onOther = await projectThrough(space, { ...AT_REST, activeGraphId: OTHER_GRAPH });

    const drawnGraphIds = (edges: typeof onDrawn.edges) =>
      edges.map((edge) => edge.data?.['graphId']).sort();
    expect(drawnGraphIds(onOther.edges)).toEqual(drawnGraphIds(onDrawn.edges));
    expect(onOther.edges.map((edge) => edge.id).sort()).toEqual(
      onDrawn.edges.map((edge) => edge.id).sort(),
    );

    const opacityOf = (edges: typeof onDrawn.edges, graphId: string) =>
      Number(edges.find((edge) => edge.data?.['graphId'] === graphId)?.style?.opacity);
    expect(opacityOf(onDrawn.edges, DRAWN_GRAPH)).toBe(1);
    expect(opacityOf(onDrawn.edges, OTHER_GRAPH)).toBeLessThan(1);
    expect(opacityOf(onOther.edges, OTHER_GRAPH)).toBe(1);
    expect(opacityOf(onOther.edges, DRAWN_GRAPH)).toBeLessThan(1);
  });

  it('names the traversal position, the authoring selection and what Presenting draws', async () => {
    const space = spaceWith({ maps: [mapOwning(DRAWN)] });

    const { nodes } = await projectThrough(space, {
      ...AT_REST,
      activeResourceId: RESOURCE_A,
      selectedResourceId: RESOURCE_B,
      presenting: true,
    });

    const byId = Object.fromEntries(nodes.map((node) => [node.id, node.data]));
    expect(byId[RESOURCE_A]?.active).toBe(true);
    expect(byId[RESOURCE_B]?.selectedForAuthoring).toBe(true);
    // Presenting draws the Active Resource's content, and only that Resource's (ADR 0027).
    expect(byId[RESOURCE_A]?.showContent).toBe(true);
    expect(byId[RESOURCE_B]?.showContent).toBe(false);
  });

  it('draws every Graph a selected Map owns', async () => {
    const space = spaceWith({ maps: [mapOwning(DRAWN, OTHER)] });

    const { visibleGraphs, nodes, edges } = await projectThrough(space, AT_REST, MAP);

    // Graphs and Edges are derived separately and must agree on the same set —
    // the Graphs this Map owns (ADR 0040), which here is both. A Resource's
    // anchors are Graph-independent, so every Resource the Map draws carries
    // the same four.
    expect(visibleGraphs.map((graph) => graph.id)).toEqual([DRAWN_GRAPH, OTHER_GRAPH]);
    expect(edges.map((edge) => edge.data?.['graphId']).sort()).toEqual(
      [DRAWN_GRAPH, OTHER_GRAPH].sort(),
    );
    expect(nodes.map((node) => node.id).sort()).toEqual([RESOURCE_A, RESOURCE_B]);
  });

  it('draws no Edge of a Graph a sibling Map owns', async () => {
    // Two Maps of one Space place the same Resources, and an embedded sub-flow
    // merges their projections into one React Flow instance (ADR 0068). Both
    // Resources the unowned Edge names are therefore mounted, so what keeps that
    // Edge off this Map is the derivation here and not React Flow dropping
    // an Edge whose endpoints it cannot resolve. Edges and handles are filtered
    // by the same owned set two lines apart: assert both, because dropping
    // either one alone still leaves the other refusing to draw.
    const space = spaceWith({
      maps: [mapOwning(DRAWN), { ...mapOwning(OTHER), id: SECOND_MAP, title: 'Sibling' }],
    });

    const sibling = await projectThrough(space, AT_REST, SECOND_MAP);

    expect(sibling.nodes.map((node) => node.id).sort()).toEqual([RESOURCE_A, RESOURCE_B]);
    expect(sibling.visibleGraphs.map((graph) => graph.id)).toEqual([OTHER_GRAPH]);
    expect(sibling.edges.map((edge) => edge.data?.['graphId'])).toEqual([OTHER_GRAPH]);
  });

  it('carries each authored Expanded rect through strategy input and node projection', async () => {
    const map = {
      ...mapOwning(DRAWN),
      positions: {
        [RESOURCE_A]: { x: 0, y: 0, open: true, openSize: { width: 560, height: 420 } },
        [RESOURCE_B]: { x: 700, y: 0, open: false },
      },
    };
    const space = spaceWith({ maps: [map] });
    const resolved = resolveMap(space, MAP);
    const projection = canvasProjection(space, resolved);
    const strategyResource = projection.strategyGraph.resources.find(({ id }) => id === RESOURCE_A);

    expect(strategyResource).toMatchObject({ width: 560, height: 420 });

    const laidOut = await positionedStrategy(Placement.fromMap(resolved.map))(
      projection.strategyGraph,
    );
    const node = projection.project(laidOut, AT_REST).nodes.find(({ id }) => id === RESOURCE_A);
    expect(node).toMatchObject({ width: 560, height: 420, data: { expanded: true } });
  });
});

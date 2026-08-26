import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { loadSpace, type Space } from '@project/graph';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { canvasProjection, type CanvasInteraction } from '../src/canvas-projection';
import { GRAPH_PALETTE } from '../src/colors';
import { createRendererResolver, type CanvasRendererId } from '../src/renderer';

/** One composed resolver; nothing here converts, so its identity source is never used. */
const resolveRenderer = createRendererResolver({
  newGraphId: () => uuidSchema.parse('00000000-0000-4000-8000-0000000000ff'),
});
import { cardFile } from './card-files';

const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const DRAWN_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const LAYOUT = uuidSchema.parse('00000000-0000-4000-8000-000000000008');

const CARDS = [cardFile(CARD_A), cardFile(CARD_B)];

const DRAWN = { id: DRAWN_GRAPH, title: 'Drawn', edges: [{ from: CARD_A, to: CARD_B }] };
const OTHER = { id: OTHER_GRAPH, title: 'Other', edges: [{ from: CARD_B, to: CARD_A }] };

/**
 * An authored Layout over both Cards, owning the Graphs it is handed.
 *
 * A Graph is a nested owned value of exactly one Layout (ADR 0040), so a Space
 * that holds Graphs is a Space that holds a Layout — and this one positions both
 * Cards, which is what closes every owned Edge over its membership.
 */
const layoutOwning = (...graphs: readonly object[]) => ({
  id: LAYOUT,
  title: 'Working',
  kind: 'positioned',
  positions: { [CARD_A]: { x: 0, y: 0 }, [CARD_B]: { x: 400, y: 0 } },
  graphs,
});

/** Nothing activated, nothing selected, nothing dragged. */
const AT_REST: CanvasInteraction = {
  activeGraphId: null,
  activeCardId: null,
  selectedCardId: null,
  presenting: false,
  moved: false,
};

function spaceWith(extra: Record<string, unknown> = {}): Space {
  const result = loadSpace(
    { version: 1, id: '00000000-0000-4000-8000-000000000001', title: 'T', ...extra },
    CARDS,
  );
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(', '));
  return result.space;
}

/** Arrange through the view's own strategy, so a test sees what the app renders. */
async function projectThrough(
  space: Space,
  interaction: CanvasInteraction = AT_REST,
  selection?: CanvasRendererId,
) {
  const view = resolveRenderer(space, selection);
  const projection = canvasProjection(space, view);
  const laidOut = await view.strategy(projection.strategyGraph);
  return { ...projection, ...projection.project(laidOut, interaction) };
}

/** Every Graph a projected Card carries a coloured handle for. */
function handledGraphIds(nodes: readonly CardFlowNode[]): string[] {
  const ids = nodes.flatMap((node) =>
    [...node.data.sourceHandles, ...node.data.targetHandles].map((handle) => handle.graphId),
  );
  return [...new Set(ids)].sort();
}

describe('canvasProjection', () => {
  it('projects every Space Card when the Space has no Graphs', async () => {
    const { nodes } = await projectThrough(spaceWith());

    expect(nodes.map((node) => node.id).sort()).toEqual([CARD_A, CARD_B]);
  });

  it('emphasises the Active Graph without hiding the rest of the Space', async () => {
    const space = spaceWith({ layouts: [layoutOwning(DRAWN, OTHER)] });

    const equal = await projectThrough(space);
    const emphasised = await projectThrough(space, { ...AT_REST, activeGraphId: DRAWN_GRAPH });

    expect(equal.nodes.map((node) => node.data.emphasis)).toEqual(['equal', 'equal']);
    expect(emphasised.nodes.map((node) => node.data.emphasis)).toEqual(['subtle', 'subtle']);
    // Emphasis, not filtering: both Graphs are still drawn (ADR 0026).
    expect(emphasised.edges).toHaveLength(2);
  });

  it('colours the authoring handles as the Active Graph, and as the first slot without one', async () => {
    const space = spaceWith({ layouts: [layoutOwning({ ...DRAWN, color: '#123456' })] });

    const active = await projectThrough(space, { ...AT_REST, activeGraphId: DRAWN_GRAPH });
    const none = await projectThrough(spaceWith());

    expect(active.nodes.map((node) => node.data.activeGraphColor)).toEqual(['#123456', '#123456']);
    // A first connection is drawn before the Graph it mints exists, so a Space
    // with no Active Graph still needs a stroke.
    expect(none.nodes[0]?.data.activeGraphColor).toBe(GRAPH_PALETTE[0]);
  });

  it('recedes the Edges of every Graph but the Active one', async () => {
    const space = spaceWith({ layouts: [layoutOwning(DRAWN, OTHER)] });

    const { edges } = await projectThrough(space, { ...AT_REST, activeGraphId: DRAWN_GRAPH });

    const opacityOf = (graphId: string) =>
      Number(edges.find((edge) => edge.data?.['graphId'] === graphId)?.style?.opacity);
    expect(opacityOf(DRAWN_GRAPH)).toBe(1);
    expect(opacityOf(OTHER_GRAPH)).toBeLessThan(1);
  });

  it('names the traversal position, the authoring selection and what Presenting draws', async () => {
    const space = spaceWith({ layouts: [layoutOwning(DRAWN)] });

    const { nodes } = await projectThrough(space, {
      ...AT_REST,
      activeCardId: CARD_A,
      selectedCardId: CARD_B,
      presenting: true,
    });

    const byId = Object.fromEntries(nodes.map((node) => [node.id, node.data]));
    expect(byId[CARD_A]?.active).toBe(true);
    expect(byId[CARD_B]?.selectedForAuthoring).toBe(true);
    // Presenting draws the Active Card's content, and only that Card's (ADR 0027).
    expect(byId[CARD_A]?.showContent).toBe(true);
    expect(byId[CARD_B]?.showContent).toBe(false);
  });

  it('drops routed Edge geometry once a Card has been dragged out of the placement', async () => {
    const space = spaceWith({ layouts: [layoutOwning(DRAWN)] });

    const settled = await projectThrough(space);
    const dragged = await projectThrough(space, { ...AT_REST, moved: true });

    expect(settled.edges[0]?.data?.['points']).toBeDefined();
    expect(dragged.edges[0]?.data?.['points']).toBeUndefined();
  });

  it('draws every Graph a selected Layout owns', async () => {
    const space = spaceWith({ layouts: [layoutOwning(DRAWN, OTHER)] });

    const { visibleGraphs, nodes, edges } = await projectThrough(space, AT_REST, {
      kind: 'layout',
      layoutId: LAYOUT,
    });

    // Graphs, Edges and handles are derived separately and must agree on the
    // same set — the Graphs this Layout owns (ADR 0040), which here is both.
    expect(visibleGraphs.map((graph) => graph.id)).toEqual([DRAWN_GRAPH, OTHER_GRAPH]);
    expect(edges.map((edge) => edge.data?.['graphId']).sort()).toEqual(
      [DRAWN_GRAPH, OTHER_GRAPH].sort(),
    );
    expect(handledGraphIds(nodes)).toEqual([DRAWN_GRAPH, OTHER_GRAPH].sort());
  });

  it('carries each authored Open rect through strategy input and node projection', async () => {
    const layout = {
      ...layoutOwning(DRAWN),
      positions: {
        [CARD_A]: { x: 0, y: 0, expanded: { width: 560, height: 420 } },
        [CARD_B]: { x: 700, y: 0 },
      },
    };
    const space = spaceWith({ layouts: [layout] });
    const renderer = resolveRenderer(space, { kind: 'layout', layoutId: LAYOUT });
    const projection = canvasProjection(space, renderer);
    const strategyCard = projection.strategyGraph.cards.find(({ id }) => id === CARD_A);

    expect(strategyCard).toMatchObject({ width: 560, height: 420 });

    const laidOut = await renderer.strategy(projection.strategyGraph);
    const node = projection.project(laidOut, AT_REST).nodes.find(({ id }) => id === CARD_A);
    expect(node).toMatchObject({ width: 560, height: 420, data: { open: true } });
  });
});

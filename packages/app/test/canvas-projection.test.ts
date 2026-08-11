import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { loadSpace, type Space } from '@project/graph';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { canvasProjection, type CanvasInteraction } from '../src/canvas-projection';
import { GRAPH_PALETTE } from '../src/colors';
import { resolveView, type RendererSelection } from '../src/view';
import { cardFile } from './card-files';

const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const DRAWN_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const FILTERED_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const LAYOUT = uuidSchema.parse('00000000-0000-4000-8000-000000000008');

const CARDS = [cardFile(CARD_A), cardFile(CARD_B)];

const TWO_GRAPHS = [
  { id: DRAWN_GRAPH, title: 'Drawn', edges: [{ from: CARD_A, to: CARD_B }] },
  { id: FILTERED_GRAPH, title: 'Filtered', edges: [{ from: CARD_B, to: CARD_A }] },
];

/** A Layout drawing one of the Space's two Graphs (ADR 0026). */
const FILTERING_LAYOUT = {
  id: LAYOUT,
  title: 'Filtering',
  kind: 'positioned',
  positions: { [CARD_A]: { x: 0, y: 0 }, [CARD_B]: { x: 400, y: 0 } },
  graphs: [DRAWN_GRAPH],
};

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
    { version: 2, id: '00000000-0000-4000-8000-000000000001', title: 'T', graphs: [], ...extra },
    CARDS,
  );
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(', '));
  return result.space;
}

/** Arrange through the view's own strategy, so a test sees what the app renders. */
async function projectThrough(
  space: Space,
  interaction: CanvasInteraction = AT_REST,
  selection?: RendererSelection,
) {
  const view = resolveView(space, selection);
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
    const space = spaceWith({ graphs: TWO_GRAPHS });

    const equal = await projectThrough(space);
    const emphasised = await projectThrough(space, { ...AT_REST, activeGraphId: DRAWN_GRAPH });

    expect(equal.nodes.map((node) => node.data.emphasis)).toEqual(['equal', 'equal']);
    expect(emphasised.nodes.map((node) => node.data.emphasis)).toEqual(['subtle', 'subtle']);
    // Emphasis, not filtering: both Graphs are still drawn (ADR 0026).
    expect(emphasised.edges).toHaveLength(2);
  });

  it('colours the authoring handles as the Active Graph, and as the first slot without one', async () => {
    const space = spaceWith({ graphs: [{ ...TWO_GRAPHS[0], color: '#123456' }] });

    const active = await projectThrough(space, { ...AT_REST, activeGraphId: DRAWN_GRAPH });
    const none = await projectThrough(spaceWith());

    expect(active.nodes.map((node) => node.data.activeGraphColor)).toEqual(['#123456', '#123456']);
    // A first connection is drawn before the Graph it mints exists, so a Space
    // with no Active Graph still needs a stroke.
    expect(none.nodes[0]?.data.activeGraphColor).toBe(GRAPH_PALETTE[0]);
  });

  it('recedes the Edges of every Graph but the Active one', async () => {
    const space = spaceWith({ graphs: TWO_GRAPHS });

    const { edges } = await projectThrough(space, { ...AT_REST, activeGraphId: DRAWN_GRAPH });

    const opacityOf = (graphId: string) =>
      Number(edges.find((edge) => edge.data?.['graphId'] === graphId)?.style?.opacity);
    expect(opacityOf(DRAWN_GRAPH)).toBe(1);
    expect(opacityOf(FILTERED_GRAPH)).toBeLessThan(1);
  });

  it('names the traversal position, the authoring selection and what Presenting draws', async () => {
    const space = spaceWith({ graphs: [TWO_GRAPHS[0]] });

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

  it('drops routed Edge geometry once a Card has been dragged out of the arrangement', async () => {
    const space = spaceWith({ graphs: [TWO_GRAPHS[0]] });

    const settled = await projectThrough(space);
    const dragged = await projectThrough(space, { ...AT_REST, moved: true });

    expect(settled.edges[0]?.data?.['points']).toBeDefined();
    expect(dragged.edges[0]?.data?.['points']).toBeUndefined();
  });

  it('draws only the Graphs the selected Layout shows', async () => {
    const space = spaceWith({ graphs: TWO_GRAPHS, layouts: [FILTERING_LAYOUT] });

    const { visibleGraphs, nodes, edges } = await projectThrough(space, AT_REST, {
      kind: 'layout',
      layoutId: LAYOUT,
    });

    expect(visibleGraphs.map((graph) => graph.id)).toEqual([DRAWN_GRAPH]);
    expect(edges.map((edge) => edge.data?.['graphId'])).toEqual([DRAWN_GRAPH]);
    expect(handledGraphIds(nodes)).toEqual([DRAWN_GRAPH]);
  });
});

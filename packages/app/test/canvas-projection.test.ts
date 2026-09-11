import { describe, expect, it } from 'vitest';
import { uuidSchema, type DiagramId } from '@project/core';
import { loadSpace, Placement, positionedStrategy, type Space } from '@project/graph';
import { canvasProjection, type CanvasInteraction } from '../src/canvas-projection';
import { GRAPH_PALETTE } from '../src/colors';
import { resolveDiagram } from '../src/diagram-resolution';
import { thingFile } from './thing-files';

const THING_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const THING_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const DRAWN_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const SECOND_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000009');

const THINGS = [thingFile(THING_A), thingFile(THING_B)];

const DRAWN = { id: DRAWN_GRAPH, title: 'Drawn', edges: [{ from: THING_A, to: THING_B }] };
const OTHER = { id: OTHER_GRAPH, title: 'Other', edges: [{ from: THING_B, to: THING_A }] };
const EMPTY = { id: DRAWN_GRAPH, title: 'Empty', edges: [] };

/**
 * An authored Diagram over both Things, owning the Graphs it is handed.
 *
 * A Graph is a nested owned value of exactly one Diagram (ADR 0040), so a Space
 * that holds Graphs is a Space that holds a Diagram — and this one positions both
 * Things, which is what closes every owned Edge over its membership.
 */
const diagramOwning = (...graphs: readonly object[]) => ({
  id: DIAGRAM,
  title: 'Working',
  kind: 'positioned',
  positions: { [THING_A]: { x: 0, y: 0, open: false }, [THING_B]: { x: 400, y: 0, open: false } },
  graphs,
});

/** Nothing activated, nothing selected. */
const AT_REST: CanvasInteraction = {
  activeGraphId: null,
  activeThingId: null,
  selectedThingId: null,
  presenting: false,
};

function spaceWith(extra: Record<string, unknown> = {}): Space {
  const result = loadSpace(
    {
      version: 1,
      id: '00000000-0000-4000-8000-000000000001',
      title: 'T',
      defaultDiagram: DIAGRAM,
      diagrams: [diagramOwning(EMPTY)],
      ...extra,
    },
    THINGS,
  );
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(', '));
  return result.space;
}

/** Arrange through the Diagram's own strategy, so a test sees what the app renders. */
async function projectThrough(
  space: Space,
  interaction: CanvasInteraction = AT_REST,
  selection?: DiagramId,
) {
  const resolved = resolveDiagram(space, selection);
  const projection = canvasProjection(space, resolved);
  const laidOut = await positionedStrategy(Placement.fromDiagram(resolved.diagram))(
    projection.strategyGraph,
  );
  return { ...projection, ...projection.project(laidOut, interaction) };
}

describe('canvasProjection', () => {
  it('marks authored Diagram Things editable', async () => {
    const space = spaceWith({ diagrams: [diagramOwning(DRAWN)] });

    const authored = await projectThrough(space, AT_REST, DIAGRAM);

    expect(authored.nodes.map((node) => node.data.readOnly)).toEqual([false, false]);
  });

  it('projects every Diagram Thing when its Graph is empty', async () => {
    const { nodes } = await projectThrough(spaceWith());

    expect(nodes.map((node) => node.id).sort()).toEqual([THING_A, THING_B]);
  });

  it('emphasises the Active Graph without hiding the rest of the Space', async () => {
    const space = spaceWith({ diagrams: [diagramOwning(DRAWN, OTHER)] });

    const equal = await projectThrough(space);
    const emphasised = await projectThrough(space, { ...AT_REST, activeGraphId: DRAWN_GRAPH });

    expect(equal.nodes.map((node) => node.data.emphasis)).toEqual(['equal', 'equal']);
    expect(emphasised.nodes.map((node) => node.data.emphasis)).toEqual(['subtle', 'subtle']);
    // Emphasis, not filtering: both Graphs are still drawn (ADR 0026).
    expect(emphasised.edges).toHaveLength(2);
  });

  it('colours the authoring handles as the Active Graph, and as the first slot without one', async () => {
    const space = spaceWith({ diagrams: [diagramOwning({ ...DRAWN, color: '#123456' })] });

    const active = await projectThrough(space, { ...AT_REST, activeGraphId: DRAWN_GRAPH });
    const none = await projectThrough(spaceWith());

    expect(active.nodes.map((node) => node.data.activeGraphColor)).toEqual(['#123456', '#123456']);
    // A first connection is drawn before the Graph it mints exists, so a Space
    // with no Active Graph still needs a stroke.
    expect(none.nodes[0]?.data.activeGraphColor).toBe(GRAPH_PALETTE[0]);
  });

  it('recedes the Edges of every Graph but the Active one', async () => {
    const space = spaceWith({ diagrams: [diagramOwning(DRAWN, OTHER)] });

    const { edges } = await projectThrough(space, { ...AT_REST, activeGraphId: DRAWN_GRAPH });

    const opacityOf = (graphId: string) =>
      Number(edges.find((edge) => edge.data?.['graphId'] === graphId)?.style?.opacity);
    expect(opacityOf(DRAWN_GRAPH)).toBe(1);
    expect(opacityOf(OTHER_GRAPH)).toBeLessThan(1);
  });

  it('names the traversal position, the authoring selection and what Presenting draws', async () => {
    const space = spaceWith({ diagrams: [diagramOwning(DRAWN)] });

    const { nodes } = await projectThrough(space, {
      ...AT_REST,
      activeThingId: THING_A,
      selectedThingId: THING_B,
      presenting: true,
    });

    const byId = Object.fromEntries(nodes.map((node) => [node.id, node.data]));
    expect(byId[THING_A]?.active).toBe(true);
    expect(byId[THING_B]?.selectedForAuthoring).toBe(true);
    // Presenting draws the Active Thing's content, and only that Thing's (ADR 0027).
    expect(byId[THING_A]?.showContent).toBe(true);
    expect(byId[THING_B]?.showContent).toBe(false);
  });

  it('draws every Graph a selected Diagram owns', async () => {
    const space = spaceWith({ diagrams: [diagramOwning(DRAWN, OTHER)] });

    const { visibleGraphs, nodes, edges } = await projectThrough(space, AT_REST, DIAGRAM);

    // Graphs and Edges are derived separately and must agree on the same set —
    // the Graphs this Diagram owns (ADR 0040), which here is both. A Thing's
    // anchors used to be a third derivation of it; they are Graph-independent
    // since ADR 0087, so every Thing the Diagram draws carries the same four.
    expect(visibleGraphs.map((graph) => graph.id)).toEqual([DRAWN_GRAPH, OTHER_GRAPH]);
    expect(edges.map((edge) => edge.data?.['graphId']).sort()).toEqual(
      [DRAWN_GRAPH, OTHER_GRAPH].sort(),
    );
    expect(nodes.map((node) => node.id).sort()).toEqual([THING_A, THING_B]);
  });

  it('draws no Edge of a Graph a sibling Diagram owns', async () => {
    // Two Diagrams of one Space place the same Things, and an embedded sub-flow
    // merges their projections into one React Flow instance (ADR 0068). Both
    // Things the unowned Edge names are therefore mounted, so what keeps that
    // Edge off this Diagram is the derivation here and not React Flow dropping
    // an Edge whose endpoints it cannot resolve. Edges and handles are filtered
    // by the same owned set two lines apart: assert both, because dropping
    // either one alone still leaves the other refusing to draw.
    const space = spaceWith({
      diagrams: [
        diagramOwning(DRAWN),
        { ...diagramOwning(OTHER), id: SECOND_DIAGRAM, title: 'Sibling' },
      ],
    });

    const sibling = await projectThrough(space, AT_REST, SECOND_DIAGRAM);

    expect(sibling.nodes.map((node) => node.id).sort()).toEqual([THING_A, THING_B]);
    expect(sibling.visibleGraphs.map((graph) => graph.id)).toEqual([OTHER_GRAPH]);
    expect(sibling.edges.map((edge) => edge.data?.['graphId'])).toEqual([OTHER_GRAPH]);
  });

  it('carries each authored Expanded rect through strategy input and node projection', async () => {
    const diagram = {
      ...diagramOwning(DRAWN),
      positions: {
        [THING_A]: { x: 0, y: 0, open: true, openSize: { width: 560, height: 420 } },
        [THING_B]: { x: 700, y: 0, open: false },
      },
    };
    const space = spaceWith({ diagrams: [diagram] });
    const resolved = resolveDiagram(space, DIAGRAM);
    const projection = canvasProjection(space, resolved);
    const strategyThing = projection.strategyGraph.things.find(({ id }) => id === THING_A);

    expect(strategyThing).toMatchObject({ width: 560, height: 420 });

    const laidOut = await positionedStrategy(Placement.fromDiagram(resolved.diagram))(
      projection.strategyGraph,
    );
    const node = projection.project(laidOut, AT_REST).nodes.find(({ id }) => id === THING_A);
    expect(node).toMatchObject({ width: 560, height: 420, data: { expanded: true } });
  });
});

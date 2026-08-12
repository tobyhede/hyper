import type { CardId, Graph, GraphId } from '@project/core';
import {
  buildCardHandles,
  buildGraphRenderEdges,
  buildLayoutStrategyGraph,
  filterHandlesByGraphs,
  type LayoutStrategyGraph,
  type Space,
} from '@project/graph';
import type { Edge } from '@xyflow/react';
import {
  projectCardNodes,
  projectGraphEdges,
  type CardFlowNode,
  type GraphEmphasis,
} from '@project/react-flow-adapter';
import { CARD_HEIGHT, CARD_SIZE } from './card';
import { activeGraphColor, graphColorMap } from './colors';
import type { ResolvedRenderer } from './renderer';

/**
 * What the canvas draws, derived from a Space and the view rendering it.
 *
 * Everything here is a pure function of the Space, the resolved view and the
 * interaction state — no store, no React, no DOM. It is split in two because an
 * arrangement is asynchronous: the outer call answers everything a strategy
 * needs and everything the canvas draws *around* the cards, and `project` turns
 * the resolved arrangement into React Flow's nodes and edges.
 */

/** The transient state a projection is coloured by, owned by nobody here. */
export interface CanvasInteraction {
  /** The Graph being emphasised, if one is active. */
  readonly activeGraphId: GraphId | null;
  /** The Card reached during traversal, if any. */
  readonly activeCardId: CardId | null;
  /** The Card named by an authoring gesture, if any. */
  readonly selectedCardId: CardId | null;
  /** Presenting draws the active Card's content rather than its title. */
  readonly presenting: boolean;
  /** Whether a Card has been dragged out of the arrangement. */
  readonly moved: boolean;
}

/** React Flow's view of the Space, ready to publish. */
export interface CanvasNodesAndEdges {
  readonly nodes: readonly CardFlowNode[];
  readonly edges: readonly Edge[];
}

export interface PendingCanvasProjection {
  /** What a layout strategy arranges: the visible cards, handles and edges. */
  readonly strategyGraph: LayoutStrategyGraph;
  /** Every visible Graph's resolved colour. */
  readonly colors: Readonly<Record<string, string>>;
  /** The Graphs this view draws, in the Space's authored order. */
  readonly visibleGraphs: readonly Graph[];
  /**
   * The arrangement, coloured by the interaction state.
   *
   * Takes a resolved `LayoutStrategyGraph` rather than a nullable one on
   * purpose: there is nothing worth projecting before a strategy has run, and
   * requiring one here is what stops a caller publishing a projection whose
   * every card sits at the origin.
   */
  project(laidOut: LayoutStrategyGraph, interaction: CanvasInteraction): CanvasNodesAndEdges;
}

export function canvasProjection(space: Space, view: ResolvedRenderer): PendingCanvasProjection {
  const colors = graphColorMap(space);
  // Which Graphs the renderer draws, resolved from the Layout that filtered them
  // (ADR 0026). Membership is the view's decision (ADR 0005), which is why it
  // arrives on the resolved view rather than being decided here.
  const visible = new Set<GraphId>(view.visibleGraphIds);
  const visibleGraphs = space.graphs.filter((graph) => visible.has(graph.id));
  const handles = filterHandlesByGraphs(buildCardHandles(space), view.visibleGraphIds);
  const edges = buildGraphRenderEdges(space).filter((edge) => visible.has(edge.graphId));
  // Every card, not just the graph-visited ones. A Space may have cards and no
  // graphs at all (ADR 0015) — deriving the card set from the graphs would draw
  // a new Space as an empty canvas, which is the one thing it must not do. Which
  // cards a view draws was always the View's call, not the layout's (ADR 0005).
  const cardIds = space.cards.map((card) => card.id);
  const strategyGraph = buildLayoutStrategyGraph(cardIds, handles, edges, CARD_SIZE);

  return {
    strategyGraph,
    colors,
    visibleGraphs,
    project: (laidOut, interaction) => {
      const { activeGraphId } = interaction;
      // Activating a Graph emphasises it; it never hides the rest of the Space.
      const emphasis: GraphEmphasis = activeGraphId === null ? 'equal' : 'subtle';

      return {
        nodes: projectCardNodes(space, handles, colors, {
          activeCardId: interaction.activeCardId,
          selectedCardId: interaction.selectedCardId,
          showActiveCardContent: interaction.presenting,
          activeGraphId,
          activeGraphColor: activeGraphColor(colors, activeGraphId),
          emphasis,
          strategyGraph: laidOut,
          nodeHeight: CARD_HEIGHT,
          cardIds,
        }),
        // A layout's routed Edge geometry describes the arrangement it computed,
        // so it stops being true once a Card is dragged out of it. From then on
        // the Edges fall back to plain curves between wherever the Cards now are
        // — which is what a positioned view draws anyway, since it routes nothing.
        edges: projectGraphEdges(edges, colors, {
          activeGraphId,
          emphasis,
          ...(interaction.moved ? {} : { strategyGraph: laidOut }),
        }),
      };
    },
  };
}

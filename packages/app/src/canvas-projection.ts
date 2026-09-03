import type { CardId, Graph, GraphId } from '@project/core';
import {
  buildCardHandles,
  buildGraphRenderEdges,
  buildLayoutStrategyGraph,
  filterHandlesByGraphs,
  Placement,
  type LayoutStrategyGraph,
  type ResolvedLayout,
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
import { layoutCards } from './layout-resolution';

/**
 * What the canvas draws, derived from a Space and the Layout drawing it.
 *
 * Everything here is a pure function of the Space, the resolved Layout and the
 * interaction state — no store, no React, no DOM. It is split in two because a
 * layout strategy runs asynchronously: the outer call answers everything a
 * strategy needs and everything the canvas draws *around* the cards, and
 * `project` turns the resolved placement into React Flow's nodes and edges.
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
  /** Whether a Card has been dragged out of the placement the strategy computed. */
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
  /** The Graphs this Layout draws — its own, in authored order. */
  readonly visibleGraphs: readonly Graph[];
  /**
   * The placed cards and their Edges, coloured by the interaction state.
   *
   * Takes a resolved `LayoutStrategyGraph` rather than a nullable one on
   * purpose: there is nothing worth projecting before a strategy has run, and
   * requiring one here is what stops a caller publishing a projection whose
   * every card sits at the origin.
   */
  project(laidOut: LayoutStrategyGraph, interaction: CanvasInteraction): CanvasNodesAndEdges;
}

export function canvasProjection(space: Space, resolved: ResolvedLayout): PendingCanvasProjection {
  const colors = graphColorMap(space);
  // Which Graphs the Layout draws: the ones it owns, exactly (ADR 0045). They
  // are the Space's own values, so the projection below draws the same Graphs
  // the Layout carries rather than a set derived a second way here.
  const visibleGraphs = resolved.layout.graphs;
  const drawnGraphIds = visibleGraphs.map((graph) => graph.id);
  const visible = new Set<GraphId>(drawnGraphIds);
  const handles = filterHandlesByGraphs(buildCardHandles(space), drawnGraphIds);
  const edges = buildGraphRenderEdges(space).filter((edge) => visible.has(edge.graphId));
  // The Layout chooses the Cards it draws. In particular, a Layout's sparse
  // placement omits Cards from its canvas; the Sidebar Cards collection is the
  // surface that reveals those Cards without manufacturing positions (ADR 0040,
  // ADR 0069).
  const cardIds = layoutCards(space, resolved.layout).map((card) => card.id);
  const authored = Placement.fromLayout(resolved.layout);
  const openCardIds = new Set([...authored].filter(([, at]) => at.open).map(([cardId]) => cardId));
  const strategyGraph = buildLayoutStrategyGraph(cardIds, handles, edges, (cardId) => {
    const at = authored.get(cardId);
    return at?.open === true ? at.openSize : CARD_SIZE;
  });

  return {
    strategyGraph,
    colors,
    visibleGraphs,
    project: (laidOut, interaction) => {
      const { activeGraphId } = interaction;
      // Activating a Graph emphasises it; it never hides the rest of the Space.
      const emphasis: GraphEmphasis = activeGraphId === null ? 'equal' : 'subtle';

      // A layout's routed Edge geometry describes the placement it computed,
      // so it stops being true once a Card is dragged out of it. From then on
      // the Edges fall back to plain curves between wherever the Cards now are
      // — which is what a positioned view draws anyway, since it routes nothing.
      const edgeOptions = interaction.moved
        ? { activeGraphId, emphasis }
        : { activeGraphId, emphasis, strategyGraph: laidOut };

      return {
        nodes: projectCardNodes(space, handles, colors, {
          readOnly: false,
          activeCardId: interaction.activeCardId,
          selectedCardId: interaction.selectedCardId,
          showActiveCardContent: interaction.presenting,
          activeGraphId,
          activeGraphColor: activeGraphColor(colors, activeGraphId),
          emphasis,
          strategyGraph: laidOut,
          nodeHeight: CARD_HEIGHT,
          cardIds,
          openCardIds,
        }),
        edges: projectGraphEdges(edges, colors, edgeOptions),
      };
    },
  };
}

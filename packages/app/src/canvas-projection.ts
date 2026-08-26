import type { CardId, Graph, GraphId } from '@project/core';
import {
  buildCardHandles,
  buildGraphRenderEdges,
  buildLayoutStrategyGraph,
  filterHandlesByGraphs,
  Placement,
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
 * What the canvas draws, derived from a Space and the renderer drawing it.
 *
 * Everything here is a pure function of the Space, the resolved renderer and the
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
  /** The Graphs this renderer draws — its subject's, in authored order. */
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

export function canvasProjection(
  space: Space,
  renderer: ResolvedRenderer,
): PendingCanvasProjection {
  const colors = graphColorMap(space);
  // Which Graphs the renderer draws: its subject's, exactly (ADR 0045). They are
  // the Space's own values, so the projection below draws the same Graphs the
  // renderer was resolved over rather than a set derived a second way here.
  const visibleGraphs = renderer.subject.graphs;
  const drawnGraphIds = visibleGraphs.map((graph) => graph.id);
  const visible = new Set<GraphId>(drawnGraphIds);
  const handles = filterHandlesByGraphs(buildCardHandles(space), drawnGraphIds);
  const edges = buildGraphRenderEdges(space).filter((edge) => visible.has(edge.graphId));
  // Every Card in the Space, and **deliberately not `renderer.subject.cards`**.
  //
  // This is the one deferred read of the fallback-band exception (docs/agents/rendering.md).
  // `positionedStrategy` still draws a Card a selected Layout omits, in a band
  // below everything the Layout places, and until package 5 builds Cards View,
  // Add to Layout and Remove from Layout that band is the only surface such a
  // Card can be reached through. Narrowing this to the subject now would take it
  // off screen with nothing to replace it. Package 5 swaps this line for the
  // subject when it deletes the band.
  //
  // A Space may also have Cards and no Graphs at all (ADR 0015), so the set can
  // never be derived from the Graphs either — that would draw a new Space as an
  // empty canvas.
  const cardIds = space.cards.map((card) => card.id);
  const authored =
    renderer.kind === 'layout' ? Placement.fromLayout(renderer.resolvedLayout.layout) : null;
  const openCardIds = new Set(
    authored === null
      ? []
      : [...authored].filter(([, at]) => at.expanded !== undefined).map(([cardId]) => cardId),
  );
  const strategyGraph = buildLayoutStrategyGraph(
    cardIds,
    handles,
    edges,
    (cardId) => authored?.get(cardId)?.expanded ?? CARD_SIZE,
  );

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

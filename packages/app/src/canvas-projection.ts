import type { ThingId, Graph, GraphId } from '@project/core';
import {
  buildGraphRenderEdges,
  buildLayoutStrategyGraph,
  Placement,
  type LayoutStrategyGraph,
  type ResolvedDiagram,
  type Space,
} from '@project/graph';
import type { Edge } from '@xyflow/react';
import {
  projectThingNodes,
  projectGraphEdges,
  type ThingFlowNode,
  type GraphEmphasis,
} from '@project/react-flow-adapter';
import { THING_SIZE } from './thing';
import { activeGraphColor, graphColorMap } from './colors';
import { diagramThings } from './diagram-resolution';

/**
 * What the canvas draws, derived from a Space and the Diagram drawing it.
 *
 * Everything here is a pure function of the Space, the resolved Diagram and the
 * interaction state — no store, no React, no DOM. It is split in two because a
 * layout strategy runs asynchronously: the outer call answers everything a
 * strategy needs and everything the canvas draws *around* the things, and
 * `project` turns the resolved placement into React Flow's nodes and edges.
 */

/** The transient state a projection is coloured by, owned by nobody here. */
export interface CanvasInteraction {
  /** The Graph being emphasised, if one is active. */
  readonly activeGraphId: GraphId | null;
  /** The Thing reached during traversal, if any. */
  readonly activeThingId: ThingId | null;
  /** The Thing named by an authoring gesture, if any. */
  readonly selectedThingId: ThingId | null;
  /** Presenting draws the active Thing's content rather than its title. */
  readonly presenting: boolean;
}

/** React Flow's view of the Space, ready to publish. */
export interface CanvasNodesAndEdges {
  readonly nodes: readonly ThingFlowNode[];
  readonly edges: readonly Edge[];
}

export interface PendingCanvasProjection {
  /** What a layout strategy arranges: the visible things and edges. */
  readonly strategyGraph: LayoutStrategyGraph;
  /** Every visible Graph's resolved colour. */
  readonly colors: Readonly<Record<string, string>>;
  /** The Graphs this Diagram draws — its own, in authored order. */
  readonly visibleGraphs: readonly Graph[];
  /**
   * The placed things and their Edges, coloured by the interaction state.
   *
   * Takes a resolved `LayoutStrategyGraph` rather than a nullable one on
   * purpose: there is nothing worth projecting before a strategy has run, and
   * requiring one here is what stops a caller publishing a projection whose
   * every thing sits at the origin.
   */
  project(laidOut: LayoutStrategyGraph, interaction: CanvasInteraction): CanvasNodesAndEdges;
}

export function canvasProjection(space: Space, resolved: ResolvedDiagram): PendingCanvasProjection {
  const colors = graphColorMap(space);
  // Which Graphs the Diagram draws: the ones it owns, exactly (ADR 0045). They
  // are the Space's own values, so the projection below draws the same Graphs
  // the Diagram carries rather than a set derived a second way here.
  const visibleGraphs = resolved.diagram.graphs;
  const drawnGraphIds = visibleGraphs.map((graph) => graph.id);
  const visible = new Set<GraphId>(drawnGraphIds);
  const edges = buildGraphRenderEdges(space).filter((edge) => visible.has(edge.graphId));
  // The Diagram chooses the Things it draws. In particular, a Diagram's sparse
  // placement omits Things from its canvas; the Things drawer is the surface that
  // reveals those Things without manufacturing positions (ADR 0040, ADR 0069) —
  // the Sidebar's Things collection before ADR 0082, the Dock's drawer now.
  const thingIds = diagramThings(space, resolved.diagram).map((thing) => thing.id);
  const authored = Placement.fromDiagram(resolved.diagram);
  const openThingIds = new Set(
    [...authored].filter(([, at]) => at.open).map(([thingId]) => thingId),
  );
  const strategyGraph = buildLayoutStrategyGraph(thingIds, edges, (thingId) => {
    const at = authored.get(thingId);
    return at?.open === true ? at.openSize : THING_SIZE;
  });

  return {
    strategyGraph,
    colors,
    visibleGraphs,
    project: (laidOut, interaction) => {
      const { activeGraphId } = interaction;
      // Activating a Graph emphasises it; it never hides the rest of the Space.
      const emphasis: GraphEmphasis = activeGraphId === null ? 'equal' : 'subtle';

      return {
        nodes: projectThingNodes(space, {
          readOnly: false,
          activeThingId: interaction.activeThingId,
          selectedThingId: interaction.selectedThingId,
          showActiveThingContent: interaction.presenting,
          activeGraphId,
          activeGraphColor: activeGraphColor(colors, activeGraphId),
          emphasis,
          strategyGraph: laidOut,
          thingIds,
          openThingIds,
        }),
        edges: projectGraphEdges(edges, colors, { activeGraphId, emphasis }),
      };
    },
  };
}

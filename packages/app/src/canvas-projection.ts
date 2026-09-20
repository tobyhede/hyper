import type { ResourceId, Graph, GraphId } from '@project/core';
import {
  buildGraphRenderEdges,
  buildLayoutStrategyGraph,
  Placement,
  type LayoutStrategyGraph,
  type ResolvedMap,
  type Space,
} from '@project/graph';
import type { Edge } from '@xyflow/react';
import {
  projectResourceNodes,
  projectGraphEdges,
  type ResourceFlowNode,
} from '@project/react-flow-adapter';
import { RESOURCE_SIZE } from './resource';
import { activeGraphColor, graphColorsByGraphId } from './colors';
import { mapResources } from './map-resolution';

/**
 * What the canvas draws, derived from a Space and the Map drawing it.
 *
 * Everything here is a pure function of the Space, the resolved Map and the
 * interaction state — no store, no React, no DOM. It is split in two because a
 * layout strategy runs asynchronously: the outer call answers everything a
 * strategy needs and everything the canvas draws *around* the resources, and
 * `project` turns the resolved placement into React Flow's nodes and edges.
 */

/** The transient state a projection is coloured by, owned by nobody here. */
export interface CanvasInteraction {
  /** The Graph being emphasised, if one is active. */
  readonly activeGraphId: GraphId | null;
  /** The Resource reached during traversal, if any. */
  readonly activeResourceId: ResourceId | null;
  /** The Resource named by an authoring gesture, if any. */
  readonly selectedResourceId: ResourceId | null;
  /** Presenting draws the active Resource's content rather than its title. */
  readonly presenting: boolean;
}

/** React Flow's view of the Space, ready to publish. */
export interface CanvasNodesAndEdges {
  readonly nodes: readonly ResourceFlowNode[];
  readonly edges: readonly Edge[];
}

export interface PendingCanvasProjection {
  /** What a layout strategy arranges: the visible resources and edges. */
  readonly strategyGraph: LayoutStrategyGraph;
  /** Every visible Graph's resolved colour. */
  readonly colors: Readonly<Record<string, string>>;
  /** The Graphs this Map draws — its own, in authored order. */
  readonly visibleGraphs: readonly Graph[];
  /**
   * The placed resources and their Edges, coloured by the interaction state.
   *
   * Takes a resolved `LayoutStrategyGraph` rather than a nullable one on
   * purpose: there is nothing worth projecting before a strategy has run, and
   * requiring one here is what stops a caller publishing a projection whose
   * every resource sits at the origin.
   */
  project(laidOut: LayoutStrategyGraph, interaction: CanvasInteraction): CanvasNodesAndEdges;
}

export function canvasProjection(space: Space, resolved: ResolvedMap): PendingCanvasProjection {
  const colors = graphColorsByGraphId(space);
  // Which Graphs the Map draws: the ones it owns, exactly (ADR 0045). They
  // are the Space's own values, so the projection below draws the same Graphs
  // the Map carries rather than a set derived a second way here.
  const visibleGraphs = resolved.map.graphs;
  const drawnGraphIds = visibleGraphs.map((graph) => graph.id);
  const visible = new Set<GraphId>(drawnGraphIds);
  const edges = buildGraphRenderEdges(space).filter((edge) => visible.has(edge.graphId));
  // The Map chooses the Resources it draws. In particular, a Map's sparse
  // placement omits Resources from its canvas; the Resources list is the surface that
  // reveals those Resources without manufacturing positions (ADR 0040, ADR 0069) —
  // the Sidebar's Resources collection before ADR 0082, the Dock's drawer now.
  const resourceIds = mapResources(space, resolved.map).map((resource) => resource.id);
  const authored = Placement.fromMap(resolved.map);
  const openResourceIds = new Set(
    [...authored].filter(([, at]) => at.open).map(([resourceId]) => resourceId),
  );
  const strategyGraph = buildLayoutStrategyGraph(resourceIds, edges, (resourceId) => {
    const at = authored.get(resourceId);
    return at?.open === true ? at.openSize : RESOURCE_SIZE;
  });

  return {
    strategyGraph,
    colors,
    visibleGraphs,
    project: (laidOut, interaction) => {
      const { activeGraphId } = interaction;
      return {
        nodes: projectResourceNodes(space, {
          readOnly: false,
          activeResourceId: interaction.activeResourceId,
          selectedResourceId: interaction.selectedResourceId,
          showActiveResourceContent: interaction.presenting,
          activeGraphId,
          activeGraphColor: activeGraphColor(colors, activeGraphId),
          strategyGraph: laidOut,
          resourceIds,
          openResourceIds,
        }),
        edges: projectGraphEdges(edges, colors, { activeGraphId }),
      };
    },
  };
}

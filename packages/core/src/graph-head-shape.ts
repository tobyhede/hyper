import type { Graph, GraphHeadShape } from './types';

/**
 * The head shape every Graph creation gesture stores, and the one a Graph with
 * none stored draws as (ADR 0105). Unlike colour, nothing chooses it to stand
 * apart from the Map's other Graphs: an author changes it where colour is not
 * enough.
 */
export const DEFAULT_GRAPH_HEAD_SHAPE: GraphHeadShape = 'arrow';

/** The head shape a Graph's Edges draw: its stored one, else the default. */
export const graphHeadShape = (graph: Pick<Graph, 'headShape'>): GraphHeadShape =>
  graph.headShape ?? DEFAULT_GRAPH_HEAD_SHAPE;

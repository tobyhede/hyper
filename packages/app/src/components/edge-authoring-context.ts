import { createContext } from 'react';
import type { CardId, GraphEdge, GraphId } from '@project/core';
import type { CardChoice } from '@project/ui';
import type { EdgeEndpoint } from '../space-authoring';

/**
 * The Edge commands one shared context supplies, rather than each Edge's `data`.
 *
 * Callbacks in `data` would be rebuilt for every Edge on every projection, and
 * React Flow compares `data` to decide whether an Edge re-renders — so a canvas
 * of twenty Edges would re-render all of them whenever any command's identity
 * moved. One context, read by whichever Edge is drawing its own controls.
 */
export interface EdgeAuthoringCommands {
  /** The Edge whose editor is open, if the open draft is an Edge editor. */
  readonly editing: { readonly graphId: GraphId; readonly edge: GraphEdge } | null;
  readonly refusal: string | null;
  readonly openEditor: (graphId: GraphId, edge: GraphEdge) => void;
  readonly closeEditor: () => void;
  readonly reconnect: (endpoint: EdgeEndpoint, cardId: CardId) => void;
  readonly deleteEdge: (graphId: GraphId, edge: GraphEdge) => void;
  /** Which Cards an endpoint may be moved to, and why each cannot. */
  readonly endpointChoices: (
    graphId: GraphId,
    edge: GraphEdge,
    endpoint: EdgeEndpoint,
  ) => readonly CardChoice[];
}

export const EdgeAuthoringContext = createContext<EdgeAuthoringCommands | null>(null);

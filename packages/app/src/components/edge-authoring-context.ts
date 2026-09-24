import { createContext } from 'react';
import type { GraphId, ResourceId } from '@project/core';
import type { EdgeRefusal } from '../edge-authoring';
import type { EdgeSubject } from '../render-adapter';

/**
 * The Edge commands one shared context supplies, rather than each Edge's `data`.
 *
 * Callbacks in `data` would be rebuilt for every Edge on every projection, and
 * React Flow compares `data` to decide whether an Edge re-renders — so a canvas
 * of twenty Edges would re-render all of them whenever any command's identity
 * moved. One context, read by whichever Edge is drawing its own chrome.
 */
export interface EdgeAuthoringCommands {
  /** The Graph whose Edges draw Titles: the Active Graph, and only it. */
  readonly activeGraphId: GraphId | null;
  /** The Edge whose Title is being written, if any. */
  readonly editingTitle: EdgeSubject | null;
  /**
   * Edge Authoring's one retained refusal, structured and undecided.
   *
   * The whole module's, not this Edge's: the consuming Edge narrows it. The
   * prose belongs to the surface (ADR 0057), not here.
   */
  readonly refusal: EdgeRefusal | null;
  /**
   * The React Flow id of the Edge under the pointer (line, Title or toolbar),
   * held briefly after leaving so crossing from line to toolbar keeps it.
   */
  readonly hovered: string | null;
  readonly hover: (edgeId: string) => void;
  readonly unhover: (edgeId: string) => void;
  /** The one-line name of a Resource, for an untitled Edge's `From → To`. */
  readonly resourceName: (resourceId: ResourceId) => string;
  readonly beginTitleEdit: (subject: EdgeSubject) => void;
  /** The refusal sentence that keeps the Title editor open, or `null` once settled. */
  readonly completeTitle: (title: string) => string | null;
  readonly cancelTitleEdit: () => void;
  readonly setTitleHidden: (subject: EdgeSubject, hidden: boolean) => void;
  readonly deleteEdge: (subject: EdgeSubject) => void;
}

export const EdgeAuthoringContext = createContext<EdgeAuthoringCommands | null>(null);

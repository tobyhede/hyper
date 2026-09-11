import { createContext } from 'react';
import type { ThingId } from '@project/core';
import type { ThingChoice } from '@project/ui';
import type { EdgeRefusal } from '../edge-authoring';
import type { EdgeSubject } from '../render-adapter';
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
  readonly editing: EdgeSubject | null;
  /**
   * Edge Authoring's one retained refusal, structured and undecided.
   *
   * The whole module's, not this Edge's: it may name a channel the selected
   * Edge's controls do not own, and narrowing it is the consuming surface's
   * job rather than something this context should pre-empt. The prose is
   * nobody's here — ADR 0057 puts the sentence and the field with the surface.
   */
  readonly refusal: EdgeRefusal | null;
  readonly openEditor: (subject: EdgeSubject) => void;
  readonly closeEditor: () => void;
  readonly reconnect: (endpoint: EdgeEndpoint, thingId: ThingId) => void;
  readonly deleteEdge: (subject: EdgeSubject) => void;
  /** Which Things an endpoint may be moved to, and why each cannot. */
  readonly endpointChoices: (
    subject: EdgeSubject,
    endpoint: EdgeEndpoint,
  ) => readonly ThingChoice[];
}

export const EdgeAuthoringContext = createContext<EdgeAuthoringCommands | null>(null);

import type { GraphId, MapId } from '@project/core';
import {
  PERSISTENCE_UNSETTLED,
  completionOutcome,
  type Capability,
  type EditOutcome,
} from './authoring-commands';
import {
  embeddedContext,
  topLevelContext,
  type AuthoredSpace,
  type AuthoringContext,
  type EmbeddedAuthoring,
} from './authoring-contexts';
import { describeAuthoringRefusal } from './authoring-refusal';
import type { CommandNotice } from './command-outcomes';

/**
 * Graph Edits, as one interface for every context that authors a Graph.
 *
 * A Graph is authored from two places: the Command Dock, over the Active
 * Graph of the Map on the canvas, and an Open Space Resource's rail, over a
 * Graph of the target Space it embeds. This module decides once whether a
 * command is available, which Edit to complete and how to say a refusal,
 * over the two contexts every authoring command module shares
 * (`authoring-contexts.ts`), and answers both callers in the shared capability
 * and outcome vocabulary (`authoring-commands.ts`). What is Graph-specific
 * stays here: the Edits a Graph takes and the title a refusal is reported
 * under.
 *
 * **What stays outside.** Which Graph is active, Copy link, where the caret
 * goes and how a report is drawn are the surfaces'. The report's lifetime is
 * command outcomes' (`command-outcomes.ts`): a refused outcome carries the
 * complete notice. So this module imports no continuation, no React and no
 * DOM (an `eslint.config.js` zone holds it, and
 * `graph-authoring-commands.test.ts` scans for it).
 */

/** Rename one Graph: synchronous, so an inline editor can hold a refused draft open. */
export type GraphRename = Capability<(title: string) => EditOutcome>;

/** Store one Graph's colour, which the canvas draws its Edges in. */
export type GraphRecolor = Capability<(color: string) => EditOutcome>;

/** The commands addressed to one Graph. */
export interface GraphCommands {
  readonly rename: GraphRename;
  readonly recolor: GraphRecolor;
}

/**
 * A completed Graph Edit that leaves its context on a Graph: that Graph and
 * the Map that owns it.
 *
 * A creation answers the Graph it made. The same shape as a completed Map
 * Edit (`map-authoring-commands.ts`), declared here so neither module names
 * the other's.
 */
export interface CompletedGraphEdit {
  readonly kind: 'completed';
  readonly mapId: MapId;
  readonly graphId: GraphId;
}

/**
 * Create one empty Graph in a Map: asynchronous, because an embedded creation
 * waits for the Spaces it writes to save before and after it.
 */
export type GraphCreate = Capability<() => Promise<EditOutcome<CompletedGraphEdit>>>;

/**
 * The Graph Edits addressed to one Map: `create` is the Map-scoped one, and
 * `graph(graphId)` answers the Graph-addressed ones.
 */
export interface MapGraphCommands {
  readonly create: GraphCreate;
  readonly graph: (graphId: GraphId) => GraphCommands;
}

/** Every Graph Edit one context offers, addressed through the Map that owns the Graph. */
export interface GraphAuthoringCommands {
  readonly map: (mapId: MapId) => MapGraphCommands;
}

/**
 * Whether each command may run, as the surface answers it.
 *
 * Separate answers because they differ at the top level: a rename is a chrome
 * title edit, and a recolour and a creation are entity Edits
 * (`authoring-availability.ts`).
 */
export interface GraphAuthoringAvailability {
  readonly rename: () => boolean;
  readonly recolor: () => boolean;
  readonly create: () => boolean;
}

const UNAVAILABLE = { kind: 'unavailable' } as const;

const UNCHANGED_TITLE = 'Graph unchanged';

const notCreated = (message: string): CommandNotice => ({ title: 'Graph not created', message });

/**
 * Create an empty Graph in `mapId`, which the Map makes its Active Graph.
 *
 * Availability is asked at invocation and, embedded, again after the Spaces
 * settle, because the wait gives the target time to be exited or the Map to
 * go. The Graph is named by the Edit's own `createdGraphId`; a completion
 * that names none, or a creation queued behind a running completion, has no
 * Graph to answer, and throws rather than answering one the author did not
 * make.
 */
const createGraph = async (
  context: AuthoringContext,
  mapId: MapId,
  live: () => boolean,
): Promise<EditOutcome<CompletedGraphEdit>> => {
  if (!live()) return UNAVAILABLE;
  const { coordination } = context;
  if (coordination !== null) {
    if (!(await coordination.settled())) {
      return { kind: 'refused', report: notCreated(PERSISTENCE_UNSETTLED) };
    }
    if (!live()) return UNAVAILABLE;
  }
  const result = context.complete(mapId, { kind: 'added-graph' });
  switch (result.kind) {
    case 'refused':
      return { kind: 'refused', report: notCreated(describeAuthoringRefusal(result.refusal)) };
    case 'unchanged':
      return { kind: 'unchanged' };
    case 'queued':
      throw new Error('Graph creation was queued behind a running completion.');
    case 'completed':
      break;
  }
  if (result.createdGraphId === undefined) {
    throw new Error('A completed Graph creation named no Graph.');
  }
  const created: CompletedGraphEdit = { kind: 'completed', mapId, graphId: result.createdGraphId };
  if (coordination === null) return created;
  // From here the Graph exists in the target: the target not saving it is a
  // Graph not saved, and the Resource not taking it a Graph not selected.
  if (!(await coordination.targetSaved())) {
    return {
      kind: 'refused',
      report: { title: 'Graph not saved', message: PERSISTENCE_UNSETTLED },
    };
  }
  const refusal = coordination.select(mapId, created.graphId);
  if (refusal !== null) {
    return { kind: 'refused', report: { title: 'Graph not selected', message: refusal } };
  }
  return (await coordination.containingSaved())
    ? created
    : {
        kind: 'refused',
        report: { title: 'Graph not selected', message: PERSISTENCE_UNSETTLED },
      };
};

const graphAuthoringCommands = (
  context: AuthoringContext,
  available: GraphAuthoringAvailability,
): GraphAuthoringCommands => ({
  map: (mapId) => ({
    // Read as a getter so `available` is the answer when the capability is
    // read, as `graph(graphId)`'s are.
    get create(): GraphCreate {
      const creates = (): boolean => available.create() && context.addressesMap(mapId);
      return { available: creates(), invoke: () => createGraph(context, mapId, creates) };
    },
    graph: (graphId) => {
      const addressed = (): boolean => context.addressesGraph(mapId, graphId);
      const renames = (): boolean => available.rename() && addressed();
      const recolors = (): boolean => available.recolor() && addressed();
      return {
        rename: {
          available: renames(),
          invoke: (title) =>
            renames()
              ? completionOutcome(
                  context.complete(mapId, { kind: 'renamed-graph', graphId, title }),
                  UNCHANGED_TITLE,
                )
              : UNAVAILABLE,
        },
        recolor: {
          available: recolors(),
          invoke: (color) =>
            recolors()
              ? completionOutcome(
                  context.complete(mapId, { kind: 'recolored-graph', graphId, color }),
                  UNCHANGED_TITLE,
                )
              : UNAVAILABLE,
        },
      };
    },
  }),
});

/**
 * Graph Edits on the Space the canvas draws (`topLevelContext`).
 *
 * It addresses the Active Graph of the selected Map only, which is the one
 * Graph the Dock names; any other is a stale press, answered unavailable.
 * It creates in the selected Map with nothing to wait for: the Edit makes the
 * new Graph Active, and the Space's own session saves it like any other Edit.
 *
 * `available` is the composition's answer to whether each chrome command may
 * run; it is as live as the caller makes it.
 */
export function topLevelGraphAuthoringCommands(
  space: AuthoredSpace,
  available: GraphAuthoringAvailability,
): GraphAuthoringCommands {
  return graphAuthoringCommands(topLevelContext(space), available);
}

/**
 * Graph Edits on a target Space an Open Space Resource embeds
 * (`embeddedContext`).
 *
 * It addresses any Graph of any Map of the target while the target is still
 * the open entry, without moving the target's own canvas.
 *
 * **Creation is ordered by what the Space Resource may name.** Both Spaces
 * settle first; the Graph is created in the target and saved there; only then
 * is the Resource pointed at it and the containing Space saved — so a stored
 * Resource never names a Graph its target has not stored.
 */
export function embeddedGraphAuthoringCommands({
  available,
  ...embedded
}: EmbeddedAuthoring): GraphAuthoringCommands {
  return graphAuthoringCommands(embeddedContext(embedded), {
    rename: available,
    recolor: available,
    create: available,
  });
}

import type { GraphId, MapId } from '@project/core';
import {
  UNAVAILABLE,
  completionOutcome,
  type Capability,
  type CompletedContextEdit,
  type EditOutcome,
} from './authoring-commands';
import {
  coordinatedCreation,
  coordinatedDeletion,
  embeddedContext,
  topLevelContext,
  type AuthoredSpace,
  type AuthoringApp,
  type AuthoringContext,
  type CreationReports,
  type EmbeddedAuthoring,
} from './authoring-contexts';

/**
 * Graph Edits, as one interface for every context that authors a Graph.
 *
 * A Graph is authored from two places: the Command Dock, over the Active
 * Graph of the Map on the canvas, and an Open Space Resource's rail, over a
 * Graph of the target Space it embeds. This module decides once whether a
 * command is available, which Edit to complete and how to say a refusal,
 * over the two contexts every authoring command module shares
 * (`authoring-contexts.ts`), which also hold the order a creation or deletion
 * waits in, and answers both callers in the shared capability
 * and outcome vocabulary (`authoring-commands.ts`). What is Graph-specific
 * stays here: the Edits a Graph takes, that a Map's last Graph is never
 * deletable, the survivor a deletion leaves, and the titles a refusal is
 * reported under.
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

/**
 * Create one empty Graph in a Map: asynchronous, because an embedded creation
 * waits for the Spaces it writes to save before and after it.
 */
export type GraphCreate = Capability<() => Promise<EditOutcome<CompletedContextEdit>>>;

/**
 * Delete one Graph: asynchronous, because every Space Resource that selects
 * it is repointed in the same Edit, across Spaces (ADR 0076).
 *
 * A Map's last Graph is never available (ADR 0079), and neither is a Graph
 * that has gone; both are asked again when invoked.
 */
export type GraphDelete = Capability<() => Promise<EditOutcome<CompletedContextEdit>>>;

/** The commands addressed to one Graph. */
export interface GraphCommands {
  readonly rename: GraphRename;
  readonly recolor: GraphRecolor;
  readonly delete: GraphDelete;
}

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
 * title edit, and a recolour, a creation and a deletion are entity Edits
 * (`authoring-availability.ts`).
 */
export interface GraphAuthoringAvailability {
  readonly rename: () => boolean;
  readonly recolor: () => boolean;
  readonly create: () => boolean;
  readonly delete: () => boolean;
}

const UNCHANGED_TITLE = 'Graph unchanged';

const CREATION_REPORTS: CreationReports = {
  notCreated: 'Graph not created',
  notSaved: 'Graph not saved',
  notSelected: 'Graph not selected',
};

const NOT_DELETED = 'Graph not deleted';

/**
 * Create an empty Graph in `mapId`, which the Map makes its Active Graph.
 *
 * The Graph is named by the Edit's own `createdGraphId`; a completion that
 * names none has no Graph to answer, and throws rather than answering one the
 * author did not make.
 */
const createGraph = (
  context: AuthoringContext,
  mapId: MapId,
  creates: () => boolean,
): Promise<EditOutcome<CompletedContextEdit>> =>
  coordinatedCreation(
    context,
    creates,
    CREATION_REPORTS,
    () => context.complete(mapId, { kind: 'added-graph' }),
    ({ createdGraphId }) => {
      if (createdGraphId === undefined) {
        throw new Error('A completed Graph creation named no Graph.');
      }
      return { kind: 'completed', mapId, graphId: createdGraphId };
    },
  );

/**
 * The Graph the deletion should leave its Map on: the Active Graph the
 * context's canvas shows when that is not the one going, and otherwise the
 * Map's own Active Graph when that survives.
 *
 * **This preference is how the canvas continues on the survivor.** The
 * lifecycle repoints every Space Resource that selected the deleted Graph at
 * the Graph preferred here, moves the Map's Active Graph to it when the Map's
 * was the one going, and installs the Edit in the Space's session, where Space
 * Authoring's reconciliation moves a canvas whose Active Graph has vanished to
 * the Map's Active Graph (`space-authoring.ts`, `reconcileNavigation`).
 * Preferring the Map's own Active Graph is what makes those one Graph; with
 * none to prefer the lifecycle takes the first Graph that survives and makes
 * it the Map's, so the two still agree. A canvas not showing the deleted
 * Graph — including one the author moved while the deletion ran — is never
 * moved, because reconciliation only moves a selection that has gone.
 * `graph-authoring-commands.test.ts` holds each: "continues on the Map’s
 * stored Active Graph…", "prefers the Active Graph an embedded target
 * shows…" and "leaves a canvas the author moved…".
 */
const preferredSurvivor = (app: AuthoringApp, mapId: MapId, graphId: GraphId): GraphId | null => {
  const { selectedMapId, activeGraphId } = app.navigation.getState();
  if (selectedMapId === mapId && activeGraphId !== null && activeGraphId !== graphId) {
    return activeGraphId;
  }
  const stored = app.currentSpace().lookup.map(mapId)?.map.activeGraph;
  return stored === undefined || stored === graphId ? null : stored;
};

const deleteGraph = (
  context: AuthoringContext,
  mapId: MapId,
  graphId: GraphId,
  deletes: () => boolean,
): Promise<EditOutcome<CompletedContextEdit>> => {
  const { app, spaceResources } = context.space;
  return coordinatedDeletion(context, deletes, NOT_DELETED, () =>
    spaceResources.deleteGraph({
      targetSpaceId: app.currentSpace().id,
      mapId,
      graphId,
      preferredGraphId: preferredSurvivor(app, mapId, graphId),
    }),
  );
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
      // The last Graph of a Map is never deletable (ADR 0079): a Map keeps
      // one to draw and to be selected with.
      const deletes = (): boolean =>
        available.delete() &&
        addressed() &&
        (context.space.app.currentSpace().lookup.map(mapId)?.map.graphs.length ?? 0) > 1;
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
        delete: {
          available: deletes(),
          invoke: () => deleteGraph(context, mapId, graphId, deletes),
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
 * It deletes with nothing to wait for either: the lifecycle refuses a Space
 * whose session needs recovery, and the canvas continues on the survivor.
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
 *
 * **Deletion waits for both Spaces to settle first**, as creation does, and
 * says an unsettled Space as a Graph not deleted: the lifecycle then repoints
 * every Space Resource that selected the Graph in the one Edit that deletes it.
 */
export function embeddedGraphAuthoringCommands({
  available,
  ...embedded
}: EmbeddedAuthoring): GraphAuthoringCommands {
  return graphAuthoringCommands(embeddedContext(embedded), {
    rename: available,
    recolor: available,
    create: available,
    delete: available,
  });
}

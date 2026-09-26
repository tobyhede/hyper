import type { MapId } from '@project/core';
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
 * Map Edits, as one interface for every context that authors a Map.
 *
 * A Map is authored from two places: the Command Dock, over the Space on the
 * canvas, and an Open Space Resource's rail, over the target Space it embeds.
 * This module decides once whether a command is available, which Edit to
 * complete and how to say a refusal, over the two contexts every authoring
 * command module shares (`authoring-contexts.ts`), which also hold the order a
 * creation or deletion waits in, and answers both callers in the shared
 * capability and outcome vocabulary (`authoring-commands.ts`). What is
 * Map-specific stays here: the Edits a Map takes, that a Space's last Map is
 * never deletable, the survivor a deletion leaves, and the titles a refusal is
 * reported under.
 *
 * **What stays outside.** Which Map is selected, Copy link, where the caret
 * goes and how a report is drawn are the surfaces'. The report's *lifetime* —
 * publishing, dismissal and the Map-change reset — is command outcomes'
 * (`command-outcomes.ts`): a refused outcome carries the complete
 * `CommandNotice`, so that module holds it without reading an
 * `AuthoringRefusal`. So this module imports no continuation, no React and no
 * DOM (an `eslint.config.js` zone holds it).
 */

/** Rename one Map: synchronous, so an inline editor can hold a refused draft open. */
export type MapRename = Capability<(title: string) => EditOutcome>;

/**
 * Delete one Map: asynchronous, because every Space Resource that selects it
 * is repointed in the same Edit, across Spaces (ADR 0076).
 *
 * A Space's last Map is never available (ADR 0079), and neither is a Map
 * that has gone; both are asked again when invoked.
 */
export type MapDelete = Capability<() => Promise<EditOutcome<CompletedContextEdit>>>;

/** The commands addressed to one Map. */
export interface MapCommands {
  readonly rename: MapRename;
  readonly delete: MapDelete;
}

/**
 * Create one empty Map: asynchronous, because an embedded creation waits for
 * the Spaces it writes to save before and after it.
 */
export type MapCreate = Capability<() => Promise<EditOutcome<CompletedContextEdit>>>;

/**
 * Every Map Edit one context offers.
 *
 * `create` is Space-scoped; `map(mapId)` answers the Map-addressed commands,
 * rename and deletion.
 */
export interface MapAuthoringCommands {
  readonly create: MapCreate;
  readonly map: (mapId: MapId) => MapCommands;
}

/**
 * Whether each command may run, as the surface answers it.
 *
 * Three answers because they differ at the top level: creating a Map selects
 * an empty one, so it is withdrawn wherever Create Resource is as well as
 * wherever a chrome rename is, and deleting one is an entity Edit
 * (`authoring-availability.ts`).
 */
export interface MapAuthoringAvailability {
  readonly rename: () => boolean;
  readonly create: () => boolean;
  readonly delete: () => boolean;
}

const CREATION_REPORTS: CreationReports = {
  notCreated: 'Map not created',
  notSaved: 'Map not saved',
  notSelected: 'Map not selected',
};

const NOT_DELETED = 'Map not deleted';

/**
 * The Map a completed `created-map` made, read where the Edit left it.
 *
 * The Edit selects the Map it makes and opens it on its one Graph, so what
 * is selected the moment it returns is the creation. Anything else is Space
 * Authoring breaking its own contract, and it throws rather than answering a
 * Map the author did not make.
 */
const recoverCreatedMap = (app: AuthoringApp): CompletedContextEdit => {
  const created = app.currentSpace().lookup.map(app.navigation.getState().selectedMapId)?.map;
  const graphId = created?.activeGraph ?? created?.graphs[0]?.id;
  if (created === undefined || graphId === undefined) {
    throw new Error('A completed Map creation left no selected Map with a Graph.');
  }
  return { kind: 'completed', mapId: created.id, graphId };
};

const createMap = (
  context: AuthoringContext,
  creates: () => boolean,
): Promise<EditOutcome<CompletedContextEdit>> => {
  const { app } = context.space;
  return coordinatedCreation(
    context,
    creates,
    CREATION_REPORTS,
    () => app.authoring.complete({ kind: 'created-map' }),
    () => recoverCreatedMap(app),
  );
};

/**
 * The Map the deletion should leave its Space on: the one the canvas shows
 * when that is not the one going, and otherwise the Space's opening Map.
 *
 * **This preference is how the canvas continues on the survivor.** The
 * lifecycle repoints every Space Resource that selected the deleted Map at
 * the Map preferred here, and installs the Edit in the target's session, where
 * Space Authoring's reconciliation moves a canvas whose Map has vanished to
 * the Space's opening Map and that Map's Active Graph (`space-authoring.ts`,
 * `reconcileNavigation`). Preferring the opening Map is what makes those one
 * Map; with no opening Map to prefer the lifecycle chooses, and moves the
 * opening Map to its choice, so the two still agree. A canvas not showing the
 * deleted Map — including one the author moved while the deletion ran — is
 * never moved, because reconciliation only moves a selection that has gone.
 * `map-authoring-commands.test.ts` holds all three: "continues on the Space’s
 * opening Map…", "leaves a canvas the author moved…" and the survivor the
 * first deletion test lands on.
 */
const preferredSurvivor = (app: AuthoringApp, mapId: MapId): MapId | null => {
  const shown = app.navigation.getState().selectedMapId;
  if (shown !== mapId) return shown;
  const opening = app.currentSpace().defaultMap;
  return opening === undefined || opening === mapId ? null : opening;
};

const deleteMap = (
  context: AuthoringContext,
  mapId: MapId,
  deletes: () => boolean,
): Promise<EditOutcome<CompletedContextEdit>> => {
  const { app, spaceResources } = context.space;
  return coordinatedDeletion(context, deletes, NOT_DELETED, () =>
    spaceResources.deleteMap({
      targetSpaceId: app.currentSpace().id,
      mapId,
      preferredMapId: preferredSurvivor(app, mapId),
    }),
  );
};

const mapAuthoringCommands = (
  context: AuthoringContext,
  available: MapAuthoringAvailability,
): MapAuthoringCommands => {
  // Creation is Space-scoped, so no Map address carries the context's own
  // check: it joins creation's availability instead.
  const creates = (): boolean => available.create() && context.current();
  return {
    // Read as a getter so `available` is the answer when the capability is
    // read, as `map(mapId)`'s are, rather than when the commands were built.
    get create(): MapCreate {
      return { available: creates(), invoke: () => createMap(context, creates) };
    },
    map: (mapId) => {
      const renames = (): boolean => available.rename() && context.addressesMap(mapId);
      // The last Map is never deletable (ADR 0079): a Space keeps one to open on.
      const deletes = (): boolean =>
        available.delete() &&
        context.addressesMap(mapId) &&
        context.space.app.currentSpace().maps.length > 1;
      return {
        rename: {
          available: renames(),
          invoke: (title) =>
            renames()
              ? completionOutcome(
                  context.complete(mapId, { kind: 'renamed-map', mapId, title }),
                  'Map unchanged',
                )
              : UNAVAILABLE,
        },
        delete: {
          available: deletes(),
          invoke: () => deleteMap(context, mapId, deletes),
        },
      };
    },
  };
};

/**
 * Map Edits on the Space the canvas draws (`topLevelContext`).
 *
 * It addresses the selected Map only. It creates with nothing to wait for:
 * the Edit selects the Map it makes, and the Space's own session saves it
 * like any other Edit. It deletes with nothing to wait for either: the
 * lifecycle refuses a Space whose session needs recovery, and the canvas
 * continues on the survivor.
 *
 * `available` is the composition's answer to whether each chrome command may
 * run; it is as live as the caller makes it.
 */
export function topLevelMapAuthoringCommands(
  space: AuthoredSpace,
  available: MapAuthoringAvailability,
): MapAuthoringCommands {
  return mapAuthoringCommands(topLevelContext(space), available);
}

/**
 * Map Edits on a target Space an Open Space Resource embeds
 * (`embeddedContext`).
 *
 * It addresses any Map of the target while the target is still the open
 * entry, without moving the target's own canvas.
 *
 * **Creation is ordered by what the Space Resource may name.** Both Spaces
 * settle first; the Map is created in the target and saved there; only then
 * is the Resource pointed at it and the containing Space saved — so a stored
 * Resource never names a Map its target has not stored.
 *
 * **Deletion waits for both Spaces to settle first**, as creation does, and
 * says an unsettled Space as a Map not deleted: the lifecycle then repoints
 * every Space Resource that selected the Map in the one Edit that deletes it.
 */
export function embeddedMapAuthoringCommands({
  available,
  ...embedded
}: EmbeddedAuthoring): MapAuthoringCommands {
  return mapAuthoringCommands(embeddedContext(embedded), {
    rename: available,
    create: available,
    delete: available,
  });
}

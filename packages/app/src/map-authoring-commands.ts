import type { GraphId, MapId, UUID } from '@project/core';
import { describeAuthoringRefusal, describeSpaceResourceRefusal } from './authoring-refusal';
import type { CommandBroke, CommandDiscarded, CommandNotice } from './command-outcomes';
import type { ComposedApp } from './compose-app';
import { PERSISTENCE_UNSETTLED } from './coordinated-context-delete';
import type { OpenSpace, OpenSpaces } from './open-spaces';
import type { SpaceResourceAuthoring } from './space-resource-lifecycle';
import type { AuthoringCompletion, AuthoringResult } from './space-authoring';

/**
 * Map Edits, as one interface for every context that authors a Map.
 *
 * A Map is authored from two places: the Command Dock, over the Space on the
 * canvas, and an Open Space Resource's rail, over the target Space it embeds.
 * This module decides once whether a command is available, which Edit to
 * complete and how to say a refusal, behind two private adapters — one per
 * context — and answers both callers in the same outcome vocabulary
 * (`.scratch/command-outcomes/issues/06`).
 *
 * **What stays outside.** Which Map is selected, Copy link, where the caret
 * goes and how a report is drawn are the surfaces'. The report's *lifetime* —
 * publishing, dismissal and the Map-change reset — is command outcomes'
 * (`command-outcomes.ts`): a refused outcome carries the complete
 * {@link CommandNotice}, so that module holds it without reading an
 * `AuthoringRefusal`. So this module imports no continuation, no React and no
 * DOM (`map-authoring-commands.test.ts`, "imports no continuation, React or
 * DOM").
 */

/**
 * What a Map Edit answers.
 *
 * `unavailable` is distinct from `refused`: nothing was attempted — the
 * command was withdrawn, or its Map has gone — so there is nothing to report.
 * `Completed` is the completed arm a capability declares, so a creation can
 * carry the identities it made without a second outcome vocabulary.
 */
export type MapEditOutcome<
  Completed extends { readonly kind: 'completed' } = { readonly kind: 'completed' },
> =
  | Completed
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'refused'; readonly report: CommandNotice };

/**
 * One command a surface offers, and whether it may offer it.
 *
 * `available` is the answer when the capability was read, which is what a
 * surface draws its unavailable treatment from. `invoke` asks again when it is
 * pressed and answers `unavailable` if the answer has changed, so a surface
 * drawn from a stale answer cannot complete an Edit that is no longer offered.
 */
export interface MapCapability<Invocation> {
  readonly available: boolean;
  readonly invoke: Invocation;
}

/**
 * A capability as a surface draws it: the press built from its own
 * invocation, or `null` where it is unavailable.
 *
 * The one way a surface spends a capability, so its unavailable treatment and
 * what it invokes are read off one answer and cannot disagree
 * (`.scratch/command-outcomes/issues/09`). The press is the surface's — it
 * decides where the outcome goes and where the caret continues — and the
 * invocation still asks again when it is pressed.
 */
export const offered = <Invocation, Press>(
  capability: MapCapability<Invocation>,
  press: (invoke: Invocation) => Press,
): Press | null => (capability.available ? press(capability.invoke) : null);

/** Rename one Map: synchronous, so an inline editor can hold a refused draft open. */
export type MapRename = MapCapability<(title: string) => MapEditOutcome>;

/**
 * A completed Map Edit that leaves its context on a Map: that Map and its
 * Active Graph.
 *
 * A creation answers the Map it made, and the surface continues in its name
 * with these — which is why they are answered rather than read back off
 * whatever is selected afterwards. A deletion answers the survivor: every
 * Space Resource that selected the deleted Map now selects this pair, and so
 * does a canvas that was showing it.
 */
export interface CompletedMapEdit {
  readonly kind: 'completed';
  readonly mapId: MapId;
  readonly graphId: GraphId;
}

/**
 * Delete one Map: asynchronous, because every Space Resource that selects it
 * is repointed in the same Edit, across Spaces (ADR 0076).
 *
 * A Space's last Map is never available (ADR 0079), and neither is a Map
 * that has gone; both are asked again when invoked.
 */
export type MapDelete = MapCapability<() => Promise<MapEditOutcome<CompletedMapEdit>>>;

/** The commands addressed to one Map. */
export interface MapCommands {
  readonly rename: MapRename;
  readonly delete: MapDelete;
}

/**
 * Create one empty Map: asynchronous, because an embedded creation waits for
 * the Spaces it writes to save before and after it.
 */
export type MapCreate = MapCapability<() => Promise<MapEditOutcome<CompletedMapEdit>>>;

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
 * The editor's answer to a rename: the sentence that holds a refused draft
 * open, or `null` to close it.
 *
 * `unavailable` and a broken invocation close it too — neither is the author's
 * draft being wrong, and the surface ends a withdrawn editor on its next
 * render in any case. A break has already reached the reporter. A discarded
 * settlement has nothing to say.
 */
export const renameDraftAnswer = (
  outcome: MapEditOutcome | CommandBroke | CommandDiscarded,
): string | null => {
  switch (outcome.kind) {
    case 'refused':
      return outcome.report.message;
    case 'completed':
    case 'unchanged':
    case 'unavailable':
    case 'broke':
    case 'discarded':
      return null;
  }
};

type RenamedMap = Extract<AuthoringCompletion, { readonly kind: 'renamed-map' }>;

/** The composition a context authors through. */
type AuthoringApp = Pick<ComposedApp, 'authoring' | 'currentSpace' | 'navigation'>;

/** The Space a context authors: its composition, and the cross-Space lifecycle over it. */
export interface AuthoredSpace {
  readonly app: AuthoringApp;
  readonly spaceResources: Pick<SpaceResourceAuthoring, 'deleteMap'>;
}

/**
 * How one context creates a Map, around the Edit both contexts share.
 *
 * The Edit is `created-map` on `app`, which selects the Map it makes there.
 * `before` and `after` are the context's own coordination; each answers the
 * report that stops the creation, or `null` to go on.
 */
interface MapCreation {
  readonly app: AuthoringApp;
  /** Asked before the Edit; absent where there is nothing to wait for. */
  readonly before?: () => Promise<CommandNotice | null>;
  /** Asked once the Edit has completed, with what it made. */
  readonly after?: (created: CompletedMapEdit) => Promise<CommandNotice | null>;
}

/**
 * How one context deletes a Map, around the lifecycle Edit both share.
 *
 * `before` is the context's own persistence gate, answering the report that
 * stops the deletion or `null` to go on.
 */
interface MapDeletion {
  readonly space: AuthoredSpace;
  readonly before?: () => Promise<CommandNotice | null>;
}

/** What differs between the two contexts, and nothing else. */
interface MapAuthoringContext {
  /** Whether each command may run, asked at read and again at invocation. */
  readonly available: MapAuthoringAvailability;
  /** Whether this context can author `mapId` as the Space stands now. */
  readonly addresses: (mapId: MapId) => boolean;
  readonly complete: (mapId: MapId, completion: RenamedMap) => AuthoringResult;
  readonly creation: MapCreation;
  readonly deletion: MapDeletion;
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

const UNAVAILABLE = { kind: 'unavailable' } as const;

const notCreated = (message: string): CommandNotice => ({ title: 'Map not created', message });

/**
 * The Map a completed `created-map` made, read where the Edit left it.
 *
 * The Edit selects the Map it makes and opens it on its one Graph, so what
 * is selected the moment it returns is the creation. Anything else is Space
 * Authoring breaking its own contract, and it throws rather than answering a
 * Map the author did not make.
 */
const recoverCreatedMap = (app: AuthoringApp): CompletedMapEdit => {
  const created = app.currentSpace().lookup.map(app.navigation.getState().selectedMapId)?.map;
  const graphId = created?.activeGraph ?? created?.graphs[0]?.id;
  if (created === undefined || graphId === undefined) {
    throw new Error('A completed Map creation left no selected Map with a Graph.');
  }
  return { kind: 'completed', mapId: created.id, graphId };
};

const createMap = async (
  creation: MapCreation,
  live: () => boolean,
): Promise<MapEditOutcome<CompletedMapEdit>> => {
  if (!live()) return UNAVAILABLE;
  if (creation.before !== undefined) {
    const stopped = await creation.before();
    if (stopped !== null) return { kind: 'refused', report: stopped };
    // The wait gave the Space time to move: ask again before authoring.
    if (!live()) return UNAVAILABLE;
  }
  const result = creation.app.authoring.complete({ kind: 'created-map' });
  switch (result.kind) {
    case 'refused':
      return { kind: 'refused', report: notCreated(describeAuthoringRefusal(result.refusal)) };
    case 'unchanged':
      return { kind: 'unchanged' };
    case 'queued':
      // A creation accepted behind a running completion has made nothing
      // yet, so there is no Map to answer.
      throw new Error('Map creation was queued behind a running completion.');
    case 'completed':
      break;
  }
  const created = recoverCreatedMap(creation.app);
  if (creation.after !== undefined) {
    const stopped = await creation.after(created);
    if (stopped !== null) return { kind: 'refused', report: stopped };
  }
  return created;
};

const notDeleted = (message: string): CommandNotice => ({ title: 'Map not deleted', message });

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

const deleteMap = async (
  deletion: MapDeletion,
  mapId: MapId,
  live: () => boolean,
): Promise<MapEditOutcome<CompletedMapEdit>> => {
  if (!live()) return UNAVAILABLE;
  const { app, spaceResources } = deletion.space;
  if (deletion.before !== undefined) {
    const stopped = await deletion.before();
    if (stopped !== null) return { kind: 'refused', report: stopped };
    // The wait gave the Space time to move: ask again before deleting.
    if (!live()) return UNAVAILABLE;
  }
  const result = await spaceResources.deleteMap({
    targetSpaceId: app.currentSpace().id,
    mapId,
    preferredMapId: preferredSurvivor(app, mapId),
  });
  switch (result.kind) {
    case 'refused':
      return { kind: 'refused', report: notDeleted(describeSpaceResourceRefusal(result.refusal)) };
    case 'unchanged':
      return { kind: 'unchanged' };
    case 'completed':
      break;
  }
  return { kind: 'completed', mapId: result.mapId, graphId: result.graphId };
};

/**
 * A Space Authoring answer as a Map Edit outcome.
 *
 * `queued` is an Edit accepted behind the one completing, which lands when that
 * one drains; it answers `completed`, so the editor closes on it as on a
 * completed rename (`renameDraftAnswer`).
 */
const renameOutcome = (result: AuthoringResult): MapEditOutcome => {
  switch (result.kind) {
    case 'refused':
      return {
        kind: 'refused',
        report: { title: 'Map unchanged', message: describeAuthoringRefusal(result.refusal) },
      };
    case 'unchanged':
      return { kind: 'unchanged' };
    case 'completed':
    case 'queued':
      return { kind: 'completed' };
  }
};

const mapAuthoringCommands = (context: MapAuthoringContext): MapAuthoringCommands => {
  const creates = context.available.create;
  return {
    // Read as a getter so `available` is the answer when the capability is
    // read, as `map(mapId)`'s are, rather than when the commands were built.
    get create(): MapCreate {
      return { available: creates(), invoke: () => createMap(context.creation, creates) };
    },
    map: (mapId) => {
      const live = (): boolean => context.available.rename() && context.addresses(mapId);
      // The last Map is never deletable (ADR 0079): a Space keeps one to open on.
      const deletes = (): boolean =>
        context.available.delete() &&
        context.addresses(mapId) &&
        context.deletion.space.app.currentSpace().maps.length > 1;
      return {
        rename: {
          available: live(),
          invoke: (title) =>
            live()
              ? renameOutcome(context.complete(mapId, { kind: 'renamed-map', mapId, title }))
              : UNAVAILABLE,
        },
        delete: {
          available: deletes(),
          invoke: () => deleteMap(context.deletion, mapId, deletes),
        },
      };
    },
  };
};

/**
 * Map Edits on the Space the canvas draws.
 *
 * It addresses the **selected** Map only: Space Authoring's top-level rename
 * resolves the selection at derivation and refuses any other id as
 * `map-not-found` (`space-authoring.ts`), so a Map that is not selected when
 * the press lands is a stale press — unavailable — rather than a refusal.
 *
 * It creates with nothing to wait for: the Edit selects the Map it makes, and
 * the Space's own session saves it like any other Edit. It deletes with
 * nothing to wait for either: the lifecycle refuses a Space whose session
 * needs recovery, and the canvas continues on the survivor.
 *
 * `available` is the composition's answer to whether each chrome command may
 * run; it is as live as the caller makes it.
 */
export function topLevelMapAuthoringCommands(
  space: AuthoredSpace,
  available: MapAuthoringAvailability,
): MapAuthoringCommands {
  const { app } = space;
  return mapAuthoringCommands({
    available,
    addresses: (mapId) =>
      app.navigation.getState().selectedMapId === mapId &&
      app.currentSpace().lookup.map(mapId) !== undefined,
    complete: (_mapId, completion) => app.authoring.complete(completion),
    creation: { app },
    deletion: { space },
  });
}

/** What an embedded context authors through, and the Resource that embeds it. */
export interface EmbeddedMapAuthoring {
  /** The open entry the rail was drawn from. */
  readonly target: OpenSpace;
  readonly spaces: Pick<OpenSpaces, 'entry' | 'waitForPersistence'>;
  /** The Space holding the Space Resource, where its selection is written. */
  readonly containingSpaceId: UUID;
  /**
   * Point the Space Resource at a Map and Graph of the target: the sentence
   * that refused it, or `null` once it is written.
   */
  readonly select: (mapId: MapId, graphId: GraphId) => string | null;
  /** The rail's general availability, one answer for every command it offers. */
  readonly available: () => boolean;
}

/**
 * Map Edits on a target Space an Open Space Resource embeds.
 *
 * It addresses any Map of the target while the target is still the open entry
 * the rail was drawn from — an exited Space is no longer authored through its
 * old composition — and completes through `completeInMap`, which authors the
 * addressed Map without moving the target's own canvas.
 *
 * **Creation is ordered by what the Space Resource may name.** Both Spaces
 * settle first; the Map is created in the target and saved there; only then
 * is the Resource pointed at it and the containing Space saved — so a stored
 * Resource never names a Map its target has not stored. A failure after the
 * Edit is not reported as a Map not created, because it was: the target not
 * saving it is a Map not saved, and the Resource not taking it a Map not
 * selected.
 *
 * **Deletion waits for both Spaces to settle first**, as creation does, and
 * says an unsettled Space as a Map not deleted: the lifecycle then repoints
 * every Space Resource that selected the Map in the one Edit that deletes it.
 */
export function embeddedMapAuthoringCommands({
  target,
  spaces,
  containingSpaceId,
  select,
  available,
}: EmbeddedMapAuthoring): MapAuthoringCommands {
  const current = (): boolean => spaces.entry(target.id) === target;
  const saved = spaces.waitForPersistence;
  const settled = async (): Promise<boolean> =>
    (await saved(target.id)) && (await saved(containingSpaceId));
  return mapAuthoringCommands({
    // Creation is Space-scoped, so no Map address carries the entry check:
    // it joins creation's own availability instead.
    available: { rename: available, create: () => available() && current(), delete: available },
    addresses: (mapId) => current() && target.app.currentSpace().lookup.map(mapId) !== undefined,
    complete: (mapId, completion) => target.app.authoring.completeInMap(mapId, completion),
    creation: {
      app: target.app,
      before: async () => ((await settled()) ? null : notCreated(PERSISTENCE_UNSETTLED)),
      after: async ({ mapId, graphId }) => {
        if (!(await saved(target.id))) {
          return { title: 'Map not saved', message: PERSISTENCE_UNSETTLED };
        }
        const refusal = select(mapId, graphId);
        if (refusal !== null) return { title: 'Map not selected', message: refusal };
        return (await saved(containingSpaceId))
          ? null
          : { title: 'Map not selected', message: PERSISTENCE_UNSETTLED };
      },
    },
    deletion: {
      space: target,
      before: async () => ((await settled()) ? null : notDeleted(PERSISTENCE_UNSETTLED)),
    },
  });
}

import type { GraphId, MapId, UUID } from '@project/core';
import { describeAuthoringRefusal } from './authoring-refusal';
import type { CommandBroke, CommandNotice } from './command-outcomes';
import type { ComposedApp } from './compose-app';
import { PERSISTENCE_UNSETTLED } from './coordinated-context-delete';
import type { OpenSpace, OpenSpaces } from './open-spaces';
import type { AuthoringCompletion, AuthoringResult } from './space-authoring';

/**
 * Map Edits, as one interface for every context that authors a Map.
 *
 * A Map is authored from two places: the Command Dock, over the Space on the
 * canvas, and an Open Space Resource's rail, over the target Space it embeds.
 * Each used to decide for itself whether the command was available, which Edit
 * to complete and how to say a refusal. This module decides those once, behind
 * two private adapters — one per context — and answers both callers in the same
 * outcome vocabulary (`.scratch/command-outcomes/issues/06`).
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

/** Rename one Map: synchronous, so an inline editor can hold a refused draft open. */
export type MapRename = MapCapability<(title: string) => MapEditOutcome>;

/** The commands addressed to one Map. */
export interface MapCommands {
  readonly rename: MapRename;
}

/**
 * A completed creation: the Map it made and that Map's Active Graph.
 *
 * The surface continues in the new Map's name with these, which is why they
 * are answered rather than read back off whatever is selected afterwards.
 */
export interface CreatedMap {
  readonly kind: 'completed';
  readonly mapId: MapId;
  readonly graphId: GraphId;
}

/**
 * Create one empty Map: asynchronous, because an embedded creation waits for
 * the Spaces it writes to save before and after it.
 */
export type MapCreate = MapCapability<() => Promise<MapEditOutcome<CreatedMap>>>;

/**
 * Every Map Edit one context offers.
 *
 * `create` is Space-scoped; `map(mapId)` answers the Map-addressed commands,
 * which deletion joins (ticket 08) as a {@link MapCapability} whose
 * invocation answers a promise of a {@link MapEditOutcome}.
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
 * render in any case. A break has already reached the reporter.
 */
export const renameDraftAnswer = (outcome: MapEditOutcome | CommandBroke): string | null =>
  outcome.kind === 'refused' ? outcome.report.message : null;

type RenamedMap = Extract<AuthoringCompletion, { readonly kind: 'renamed-map' }>;

/** The composition a context authors through. */
type AuthoringApp = Pick<ComposedApp, 'authoring' | 'currentSpace' | 'navigation'>;

/**
 * How one context creates a Map, around the Edit both contexts share.
 *
 * The Edit is `created-map` on `app`, which selects the Map it makes there.
 * `before` and `after` are the context's own coordination; each answers the
 * report that stops the creation, or `null` to go on.
 */
interface MapCreation {
  /** Whether a creation may run as the Space stands now, beyond general availability. */
  readonly live: () => boolean;
  readonly app: AuthoringApp;
  /** Asked before the Edit; absent where there is nothing to wait for. */
  readonly before?: () => Promise<CommandNotice | null>;
  /** Asked once the Edit has completed, with what it made. */
  readonly after?: (created: CreatedMap) => Promise<CommandNotice | null>;
}

/** What differs between the two contexts, and nothing else. */
interface MapAuthoringContext {
  /** General availability of each command, asked at read and again at invocation. */
  readonly available: MapAuthoringAvailability;
  /** Whether this context can author `mapId` as the Space stands now. */
  readonly addresses: (mapId: MapId) => boolean;
  readonly complete: (mapId: MapId, completion: RenamedMap) => AuthoringResult;
  readonly creation: MapCreation;
}

/**
 * Whether each command may run, as the surface answers it.
 *
 * Two answers because they differ at the top level: creating a Map selects an
 * empty one, so it is withdrawn wherever Create Resource is as well as
 * wherever a chrome rename is (`authoring-availability.ts`).
 */
export interface MapAuthoringAvailability {
  readonly rename: () => boolean;
  readonly create: () => boolean;
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
const recoverCreatedMap = (app: AuthoringApp): CreatedMap => {
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
): Promise<MapEditOutcome<CreatedMap>> => {
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

/**
 * A Space Authoring answer as a Map Edit outcome.
 *
 * `queued` is an Edit accepted behind the one completing, which lands when that
 * one drains; the surface answers it as it answers a completed one, which is
 * what the editor did before this module existed.
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
  const creates = (): boolean => context.available.create() && context.creation.live();
  return {
    // Read as a getter so `available` is the answer when the capability is
    // read, as `map(mapId)`'s are, rather than when the commands were built.
    get create(): MapCreate {
      return { available: creates(), invoke: () => createMap(context.creation, creates) };
    },
    map: (mapId) => {
      const live = (): boolean => context.available.rename() && context.addresses(mapId);
      return {
        rename: {
          available: live(),
          invoke: (title) =>
            live()
              ? renameOutcome(context.complete(mapId, { kind: 'renamed-map', mapId, title }))
              : UNAVAILABLE,
        },
      };
    },
  };
};

/** The composition a top-level context authors through. */
export type TopLevelMapAuthoring = AuthoringApp;

/**
 * Map Edits on the Space the canvas draws.
 *
 * It addresses the **selected** Map only: Space Authoring's top-level rename
 * resolves the selection at derivation and refuses any other id as
 * `map-not-found` (`space-authoring.ts`), so a Map that is not selected when
 * the press lands is a stale press — unavailable — rather than a refusal.
 *
 * It creates with nothing to wait for: the Edit selects the Map it makes, and
 * the Space's own session saves it like any other Edit.
 *
 * `available` is the composition's answer to whether each chrome command may
 * run; it is as live as the caller makes it.
 */
export function topLevelMapAuthoringCommands(
  app: TopLevelMapAuthoring,
  available: MapAuthoringAvailability,
): MapAuthoringCommands {
  return mapAuthoringCommands({
    available,
    addresses: (mapId) =>
      app.navigation.getState().selectedMapId === mapId &&
      app.currentSpace().lookup.map(mapId) !== undefined,
    complete: (_mapId, completion) => app.authoring.complete(completion),
    creation: { live: () => true, app },
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
  return mapAuthoringCommands({
    available: { rename: available, create: available },
    addresses: (mapId) => current() && target.app.currentSpace().lookup.map(mapId) !== undefined,
    complete: (mapId, completion) => target.app.authoring.completeInMap(mapId, completion),
    creation: {
      live: current,
      app: target.app,
      before: async () =>
        (await saved(target.id)) && (await saved(containingSpaceId))
          ? null
          : notCreated(PERSISTENCE_UNSETTLED),
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
  });
}

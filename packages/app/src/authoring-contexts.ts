import type { GraphId, MapId, UUID } from '@project/core';
import type { SpaceResourceContextDeletionResult } from '@project/persistence';
import {
  PERSISTENCE_UNSETTLED,
  UNAVAILABLE,
  type CompletedContextEdit,
  type EditOutcome,
} from './authoring-commands';
import { describeAuthoringRefusal, describeSpaceResourceRefusal } from './authoring-refusal';
import type { ComposedApp } from './compose-app';
import type { OpenSpace, OpenSpaces } from './open-spaces';
import type { AuthoringCompletion, AuthoringResult } from './space-authoring';
import type { SpaceResourceAuthoring } from './space-resource-lifecycle';

/**
 * The two contexts an authoring command module authors in, defined once.
 *
 * A Map or a Graph is authored from the Command Dock, over the Space on the
 * canvas, and from an Open Space Resource's rail, over the target Space it
 * embeds. What differs between the two is the same whatever is authored —
 * which Maps and Graphs the context addresses, how it completes an Edit
 * addressed to a Map, and what it waits for around an Edit that crosses
 * Spaces — so it is written here once and every authoring command module
 * (`map-authoring-commands.ts`, `graph-authoring-commands.ts`) builds its
 * own public constructors over it.
 *
 * The order a creation or deletion runs its waits in is the same for both
 * modules too, so {@link coordinatedCreation} and {@link coordinatedDeletion}
 * hold it here. Each module supplies the Edit itself, when it is offered, and
 * the titles its failures are reported under.
 *
 * Like the modules that spend it, it imports no continuation, no React and no
 * DOM (an `eslint.config.js` zone holds it).
 */

/** The composition a context authors through. */
export type AuthoringApp = Pick<ComposedApp, 'authoring' | 'currentSpace' | 'navigation'>;

/** The Space a context authors: its composition, and the cross-Space lifecycle over it. */
export interface AuthoredSpace {
  readonly app: AuthoringApp;
  readonly spaceResources: Pick<SpaceResourceAuthoring, 'deleteMap' | 'deleteGraph'>;
}

/** The Edits a context completes addressed to one Map of its Space. */
export type AddressedCompletion = Extract<
  AuthoringCompletion,
  { readonly kind: 'renamed-map' | 'added-graph' | 'renamed-graph' | 'recolored-graph' }
>;

/**
 * Point the Space Resource at a Map and Graph of the target: the sentence
 * that refused it, or `null` once it is written.
 */
export type SelectInTarget = (mapId: MapId, graphId: GraphId) => string | null;

/**
 * What an embedded context waits for around an Edit, so a stored Space
 * Resource never names a Map or Graph its target has not stored.
 *
 * Each answers whether the wait ended saved; what a failed wait is reported
 * as is the command module's.
 */
export interface ContextCoordination {
  /** Both Spaces have settled: asked before an Edit that crosses them. */
  readonly settled: () => Promise<boolean>;
  /** The target has saved an Edit made in it. */
  readonly targetSaved: () => Promise<boolean>;
  /** The containing Space has saved the Space Resource's selection. */
  readonly containingSaved: () => Promise<boolean>;
  readonly select: SelectInTarget;
}

/** One context, as every authoring command module reads it. */
export interface AuthoringContext {
  readonly space: AuthoredSpace;
  /**
   * Whether the context still authors its Space at all: always at the top
   * level, and embedded while the target is still the open entry the rail
   * was drawn from.
   */
  readonly current: () => boolean;
  /** Whether this context can author `mapId` as the Space stands now. */
  readonly addressesMap: (mapId: MapId) => boolean;
  /** Whether this context can author `graphId` of `mapId` as the Space stands now. */
  readonly addressesGraph: (mapId: MapId, graphId: GraphId) => boolean;
  readonly complete: (mapId: MapId, completion: AddressedCompletion) => AuthoringResult;
  /** What the context waits for around an Edit that crosses Spaces; `null` where nothing. */
  readonly coordination: ContextCoordination | null;
}

const owns = (app: AuthoringApp, mapId: MapId, graphId: GraphId): boolean =>
  app
    .currentSpace()
    .lookup.map(mapId)
    ?.map.graphs.some((graph) => graph.id === graphId) === true;

/**
 * The Space the canvas draws.
 *
 * It addresses the **selected** Map and its **Active** Graph only: Space
 * Authoring's top-level Edits resolve the selection at derivation, and refuse
 * any other Map as `map-not-found` (`space-authoring.ts`), so a Map or Graph
 * that is not the one shown when the press lands is a stale press —
 * unavailable — rather than a refusal.
 *
 * It waits for nothing: the Space's own session saves every Edit, and the
 * lifecycle refuses a Space whose session needs recovery.
 */
export function topLevelContext(space: AuthoredSpace): AuthoringContext {
  const { app } = space;
  const addressesMap = (mapId: MapId): boolean =>
    app.navigation.getState().selectedMapId === mapId &&
    app.currentSpace().lookup.map(mapId) !== undefined;
  return {
    space,
    current: () => true,
    addressesMap,
    addressesGraph: (mapId, graphId) =>
      addressesMap(mapId) &&
      app.navigation.getState().activeGraphId === graphId &&
      owns(app, mapId, graphId),
    complete: (_mapId, completion) => app.authoring.complete(completion),
    coordination: null,
  };
}

/** What an embedded context authors through, and the Resource that embeds it. */
export interface EmbeddedAuthoring {
  /** The open entry the rail was drawn from. */
  readonly target: OpenSpace;
  readonly spaces: Pick<OpenSpaces, 'entry' | 'waitForPersistence'>;
  /** The Space holding the Space Resource, where its selection is written. */
  readonly containingSpaceId: UUID;
  readonly select: SelectInTarget;
  /** The rail's general availability, one answer for every command it offers. */
  readonly available: () => boolean;
}

/**
 * A target Space an Open Space Resource embeds.
 *
 * It addresses any Map of the target, and any Graph of that Map, while the
 * target is still the open entry the rail was drawn from — an exited Space is
 * no longer authored through its old composition — and completes through
 * `completeInMap`, which authors the addressed Map without moving the
 * target's own canvas. It waits for both Spaces around an Edit that crosses
 * them.
 */
export function embeddedContext({
  target,
  spaces,
  containingSpaceId,
  select,
}: Omit<EmbeddedAuthoring, 'available'>): AuthoringContext {
  const current = (): boolean => spaces.entry(target.id) === target;
  const saved = spaces.waitForPersistence;
  const addressesMap = (mapId: MapId): boolean =>
    current() && target.app.currentSpace().lookup.map(mapId) !== undefined;
  return {
    space: target,
    current,
    addressesMap,
    addressesGraph: (mapId, graphId) => addressesMap(mapId) && owns(target.app, mapId, graphId),
    complete: (mapId, completion) => target.app.authoring.completeInMap(mapId, completion),
    coordination: {
      settled: async () => (await saved(target.id)) && (await saved(containingSpaceId)),
      targetSaved: () => saved(target.id),
      containingSaved: () => saved(containingSpaceId),
      select,
    },
  };
}

/** Every answer but a completion: what an Edit ends on when it does not run. */
type NotCompleted = Exclude<EditOutcome, { readonly kind: 'completed' }>;

/**
 * Before an Edit that crosses Spaces, wait for both to settle and ask again
 * whether the command is still offered, because the wait gives the target
 * time to be exited or the subject to go. `null` is the go-ahead.
 *
 * Only a context with coordination asks it, so a context that crosses no
 * Spaces begins its Edit within the press, before anything is awaited: a
 * surface reads the Space the press left synchronously.
 */
const unsettledBefore = async (
  coordination: ContextCoordination,
  live: () => boolean,
  notDone: string,
): Promise<NotCompleted | null> => {
  if (!(await coordination.settled())) {
    return { kind: 'refused', report: { title: notDone, message: PERSISTENCE_UNSETTLED } };
  }
  return live() ? null : UNAVAILABLE;
};

/** The titles a creation's failures are reported under, one per step that can fail. */
export interface CreationReports {
  /** Nothing was made: the Spaces did not settle, or the Edit was refused. */
  readonly notCreated: string;
  /** It was made, and the target did not save it. */
  readonly notSaved: string;
  /** It was saved, and the Space Resource did not take it or did not save taking it. */
  readonly notSelected: string;
}

/** A completion as Space Authoring answers it, which a creation reads what it made off. */
export type CompletedAuthoring = Extract<AuthoringResult, { readonly kind: 'completed' }>;

/**
 * Create something in a context's Space, in the order a Space Resource may
 * name it.
 *
 * Embedded, both Spaces settle first; the Edit is completed in the target and
 * saved there; only then is the Space Resource pointed at what it made and the
 * containing Space saved — so a stored Resource never names a Map or Graph its
 * target has not stored. A failure after the Edit completes is not reported as
 * not created, because it was.
 *
 * A creation queued behind a running completion has made nothing yet, so
 * there is nothing to answer; it throws, as `made` throws where a completion
 * does not say what it made, rather than answering something the author did
 * not make.
 */
export const coordinatedCreation = async (
  context: AuthoringContext,
  live: () => boolean,
  reports: CreationReports,
  complete: () => AuthoringResult,
  made: (completed: CompletedAuthoring) => CompletedContextEdit,
): Promise<EditOutcome<CompletedContextEdit>> => {
  if (!live()) return UNAVAILABLE;
  if (context.coordination !== null) {
    const unsettled = await unsettledBefore(context.coordination, live, reports.notCreated);
    if (unsettled !== null) return unsettled;
  }
  const result = complete();
  switch (result.kind) {
    case 'refused':
      return {
        kind: 'refused',
        report: { title: reports.notCreated, message: describeAuthoringRefusal(result.refusal) },
      };
    case 'unchanged':
      return { kind: 'unchanged' };
    case 'queued':
      throw new Error(`${reports.notCreated}: it was queued behind a running completion.`);
    case 'completed':
      break;
  }
  const created = made(result);
  const { coordination } = context;
  if (coordination === null) return created;
  if (!(await coordination.targetSaved())) {
    return { kind: 'refused', report: { title: reports.notSaved, message: PERSISTENCE_UNSETTLED } };
  }
  const refusal = coordination.select(created.mapId, created.graphId);
  if (refusal !== null) {
    return { kind: 'refused', report: { title: reports.notSelected, message: refusal } };
  }
  return (await coordination.containingSaved())
    ? created
    : { kind: 'refused', report: { title: reports.notSelected, message: PERSISTENCE_UNSETTLED } };
};

/**
 * Delete something from a context's Space through the cross-Space lifecycle,
 * which repoints every Space Resource that selected it in the one Edit that
 * deletes it, and answer the survivor.
 *
 * Embedded, both Spaces settle first, and an unsettled Space is reported under
 * `notDeleted`, as a refusal is.
 */
export const coordinatedDeletion = async (
  context: AuthoringContext,
  live: () => boolean,
  notDeleted: string,
  remove: () => Promise<SpaceResourceContextDeletionResult>,
): Promise<EditOutcome<CompletedContextEdit>> => {
  if (!live()) return UNAVAILABLE;
  if (context.coordination !== null) {
    const unsettled = await unsettledBefore(context.coordination, live, notDeleted);
    if (unsettled !== null) return unsettled;
  }
  const result = await remove();
  switch (result.kind) {
    case 'refused':
      return {
        kind: 'refused',
        report: { title: notDeleted, message: describeSpaceResourceRefusal(result.refusal) },
      };
    case 'unchanged':
      return { kind: 'unchanged' };
    case 'completed':
      return { kind: 'completed', mapId: result.mapId, graphId: result.graphId };
  }
};

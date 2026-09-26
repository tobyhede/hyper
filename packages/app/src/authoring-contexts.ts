import type { GraphId, MapId, UUID } from '@project/core';
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
 * own public constructors over it. What each module does with the waits, and
 * the reports it says a failed wait in, stay the module's.
 *
 * Like the modules that spend it, it imports no continuation, no React and no
 * DOM (an `eslint.config.js` zone holds it).
 */

/** The composition a context authors through. */
export type AuthoringApp = Pick<ComposedApp, 'authoring' | 'currentSpace' | 'navigation'>;

/** The Space a context authors: its composition, and the cross-Space lifecycle over it. */
export interface AuthoredSpace {
  readonly app: AuthoringApp;
  readonly spaceResources: Pick<SpaceResourceAuthoring, 'deleteMap'>;
}

/** The Edits a context completes addressed to one Map of its Space. */
export type AddressedCompletion = Extract<
  AuthoringCompletion,
  { readonly kind: 'renamed-map' | 'added-graph' | 'renamed-graph' | 'recolored-graph' }
>;

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
  /**
   * Point the Space Resource at a Map and Graph of the target: the sentence
   * that refused it, or `null` once it is written.
   */
  readonly select: (mapId: MapId, graphId: GraphId) => string | null;
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
  /**
   * Point the Space Resource at a Map and Graph of the target: the sentence
   * that refused it, or `null` once it is written.
   */
  readonly select: (mapId: MapId, graphId: GraphId) => string | null;
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

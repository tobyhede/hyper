import { newUuid, type MapId, type UUID } from '@project/core';
import type { Space } from '@project/graph';
import type { ObserverErrorReporter, SpaceSession } from '@project/persistence';
import { createCommandOutcomes, type CommandOutcomes } from './command-outcomes';
import type { ConnectionCompletion } from './connection-completion';
import type { Continuation } from './continuation';
import type { EdgeAuthoring } from './edge-authoring';
import { createMapSurface, type MapSurface } from './map-surface';
import { createDeleteConfirmation, type DeleteConfirmation } from './delete-confirmation';
import { createResourceDeletion, type ResourceDeletion } from './resource-deletion';
import type { SpaceResourceAuthoring } from './space-resource-lifecycle';
import { createNavigation, type Navigation } from './navigation';
import type { RenderAdapter } from './render-adapter';
import { requireDefaultMap } from './map-resolution';
import { createWorkingSpaceReader } from './snapshot';
import {
  createSpaceAuthoring,
  type SpaceAuthoring,
  type SurfaceAuthoring,
} from './space-authoring';
import {
  createImageResources,
  type ImageEditResult,
  type ImageOrigin,
  type ImageSources,
  type ImageTarget,
} from './image-creation';
import { createImageReplacements, type ImageReplacements } from './image-replacement';

/**
 * What an opened Space is composed of.
 *
 * The order below is not free — the opening Map resolves before
 * Navigation, Authoring before the render adapter, and both before Edge
 * Authoring — and every collaborator closes over
 * **one** {@link createWorkingSpaceReader}, which is what gives them a single
 * `Space` identity to share. Written out at a call site, that is ten statements
 * whose ordering and shared reader nothing checks; written here, a caller
 * cannot state either wrongly because it never states them at all.
 *
 * Two functions rather than one, because most callers stop at Authoring and
 * have no reason to hold a render adapter subscribed to it.
 *
 * Every optional here is a dependency the collaborator that receives it already
 * declares, and none is invented: anything beyond that turns this into a
 * dependency-injection container, which ADR 0109 rules out: no port or adapter
 * seam for a dependency with one in-process implementation. Each is spelled `| undefined` on purpose, so a
 * caller holding an optional of its own forwards it straight through instead of
 * rebuilding it behind an `exactOptionalPropertyTypes` conditional spread.
 */
export interface ComposeCoreDependencies {
  /**
   * The session the whole composition reads its Space from — and the only place
   * it reads one.
   *
   * There is deliberately no second `Space` argument. Open Spaces parses the
   * stored snapshot and the session then `structuredClone`s
   * it, so the Space a caller holds at open and the session's `working` are
   * equal values with different identities; taking both would resolve the
   * opening Map against one and everything after it against the other.
   */
  readonly spaceSession: SpaceSession;
  /** Which Map the Space opens in; the Space's own default when absent. */
  readonly selection?: MapId | undefined;
}

export interface ComposeAppDependencies extends ComposeCoreDependencies {
  /**
   * Where this Space's created and replaced images are stored and measured
   * (ADR 0106).
   *
   * Required with no default: both reach outside the process, so the caller
   * that composes the Space names them, and a test supplies answers of its own.
   * The composition is the only holder, so creating and replacing an image in
   * this Space always use the same sources.
   */
  readonly images: ImageSources;
  /**
   * Mints the identity of every Resource, Map and Graph a completed Edit creates
   * (ADR 0109).
   *
   * Passed explicitly so `createSpaceAuthoring` cannot fall back to its own and
   * the composition always says where an Edit's identities came from.
   */
  readonly newId?: (() => UUID) | undefined;
  /**
   * Where this composition reports an observer failure the work it describes
   * must survive.
   *
   * One sink for the two collaborators that declare one, Space Authoring and
   * Edge Authoring. The connection completion's `reportInvariant` is a
   * different question — an invariant violation at the React Flow seam, not an
   * observer that threw — and keeps its own. Absent, each keeps its console
   * default, which is what names the collaborator in production.
   */
  readonly reportObserverError?: ObserverErrorReporter | undefined;
  /**
   * How the connection completion Edge Authoring consumes is made.
   *
   * A factory rather than a finished instance, because a `ConnectionCompletion`
   * is written in terms of an adapter and an Authoring and this module is what
   * creates both: a caller handing in a completed one could only bind Edge
   * Authoring to a *different* pair, which is the split composition this module
   * exists to prevent. Given the collaborators, a caller can build the real one
   * with an option of its own, or answer a stand-in. The real one when absent.
   */
  readonly connections?: ((collaborators: EdgeCollaborators) => ConnectionCompletion) | undefined;
  /** Coordinated Space Resource deletion for the Delete Resource interaction. */
  readonly spaceResources?: SpaceResourceAuthoring | undefined;
}

/** The pair a connection completion is written in terms of. */
export interface EdgeCollaborators {
  readonly adapter: RenderAdapter;
  readonly authoring: SurfaceAuthoring;
}

export interface AppCore {
  readonly currentSpace: () => Space;
  readonly navigation: Navigation;
  /**
   * The Map this composition opened in.
   *
   * Answered rather than read back off Navigation: it is what `composeCore`
   * decided, and recovering it through `navigation.getState()` makes the
   * decision look like Navigation's when it is this module's.
   */
  readonly openingSelection: MapId;
}

export interface ComposedApp extends AppCore {
  /**
   * Create Image Resources from one gesture's files or URL, over this Space's
   * image sources and Authoring.
   */
  readonly createImageResources: (
    origin: ImageOrigin,
    target: ImageTarget,
  ) => Promise<ImageEditResult>;
  /**
   * This Space's image replacements: the one way to replace an Image
   * Resource's picture, and its busy state.
   */
  readonly imageReplacement: ImageReplacements;
  readonly authoring: SpaceAuthoring;
  readonly adapter: RenderAdapter;
  readonly surface: MapSurface;
  /**
   * Where the finished Edit leaves the author.
   *
   * Composed before Edge Authoring because Edge Authoring publishes into it,
   * and answered here because the two React adapters that spend it mount on
   * opposite sides of `ReactFlowProvider` and each needs the same instance.
   */
  readonly continuation: Continuation;
  readonly edgeAuthoring: EdgeAuthoring;
  /**
   * What the author is told after a chrome command, per channel.
   *
   * Composed after the continuation, which it publishes into, and before
   * Resource deletion, which runs its deletions through it.
   */
  readonly commandOutcomes: CommandOutcomes;
  /** The one question every delete command in this Space asks before it runs. */
  readonly deleteConfirmation: DeleteConfirmation;
  /** Delete from Space, asked through the delete confirmation. */
  readonly resourceDeletion: ResourceDeletion;
  /**
   * The sink this composition reports through, answered as well as taken.
   *
   * Every drawing of this Space uses this sink. Resolved here when a caller
   * supplies none, so a drawn Map always receives a function (ADR 0109).
   */
  readonly reportObserverError: ObserverErrorReporter;
}

/**
 * Navigation and everything it needs, over one working-space reader.
 *
 * Stops here because a test that wraps Navigation before handing it to
 * Authoring has to compose that wrapper itself — that seam is what those tests
 * are about, and a hook for it would hide it.
 */
export function composeCore({ spaceSession, selection }: ComposeCoreDependencies): AppCore {
  // One validated aggregate per working snapshot, so every read of an unchanged
  // snapshot answers the same `Space` and it is parsed and indexed once.
  const readWorkingSpace = createWorkingSpaceReader();
  const currentSpace = (): Space => readWorkingSpace(spaceSession.getState().working);
  // Which Map this space opens in. It also answers which Graphs are drawn
  // and which of them opens active (ADR 0040), so it has to resolve before
  // anything that reads the canvas is built.
  const openingSelection = selection ?? requireDefaultMap(currentSpace());
  const navigation = createNavigation(currentSpace, openingSelection);
  return { currentSpace, navigation, openingSelection };
}

/** The whole composition: Navigation, Space Authoring, the render adapter and Edge Authoring. */
export function composeApp(dependencies: ComposeAppDependencies): ComposedApp {
  const {
    spaceSession,
    images,
    newId = newUuid,
    reportObserverError,
    connections,
    spaceResources,
  } = dependencies;
  const core = composeCore(dependencies);
  const { currentSpace, navigation } = core;
  // Resolved once for the collaborators that take the sink required. The
  // others still receive what the caller gave, so each keeps its own console
  // default when none was given.
  const compositionReporter: ObserverErrorReporter =
    reportObserverError ?? ((error) => console.error('Space composition observer failed', error));
  const authoring = createSpaceAuthoring({
    session: spaceSession,
    navigation,
    currentSpace,
    newId,
    reportObserverError,
  });
  const deleteConfirmation = createDeleteConfirmation({ authoring, reportObserverError });
  const surface = createMapSurface(
    {
      authoring,
      currentSpace,
      deleteConfirmation,
      reportObserverError: compositionReporter,
    },
    () => ({
      kind: 'canvas',
      mapId: navigation.getState().selectedMapId,
      graphId: navigation.getState().activeGraphId,
      presentingResourceId: navigation.activeResourceId(),
      policy: 'authoring',
    }),
    connections,
  );
  surface.observe();
  const { adapter, edgeAuthoring, continuation } = surface;
  const commandOutcomes = createCommandOutcomes({
    authoring,
    navigation,
    continuation,
    reportObserverError: compositionReporter,
  });
  const resourceDeletion = createResourceDeletion({
    authoring,
    currentSpace,
    deleteConfirmation,
    commandOutcomes,
    spaceResources,
  });
  return {
    ...core,
    createImageResources: (origin, target) =>
      createImageResources({ images, authoring }, origin, target),
    imageReplacement: createImageReplacements({
      images,
      authoring,
      reportObserverError: compositionReporter,
    }),
    authoring,
    adapter,
    surface,
    continuation,
    edgeAuthoring,
    commandOutcomes,
    deleteConfirmation,
    resourceDeletion,
    reportObserverError: compositionReporter,
  };
}

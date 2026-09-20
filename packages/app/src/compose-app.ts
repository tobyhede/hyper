import { newUuid, type MapId, type SpaceSnapshot, type UUID } from '@project/core';
import type { Space } from '@project/graph';
import type { ObserverErrorReporter, SpaceSession } from '@project/persistence';
import { createConnectionCompletion, type ConnectionCompletion } from './connection-completion';
import { createContinuation, type Continuation } from './continuation';
import { createEdgeAuthoring, type EdgeAuthoring } from './edge-authoring';
import { createResourceDeletion, type ResourceDeletion } from './resource-deletion';
import type { SpaceResourceAuthoring } from './space-resource-lifecycle';
import { createNavigation, type Navigation } from './navigation';
import { createRenderAdapter, type RenderAdapter } from './render-adapter';
import { requireDefaultMap } from './map-resolution';
import { createWorkingSpaceReader } from './snapshot';
import { createSpaceAuthoring, type SpaceAuthoring } from './space-authoring';

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
 * dependency-injection container, which is the instinct ADR 0016 records as
 * "do not manufacture a port or adapter seam when the dependency has one
 * in-process implementation". Each is spelled `| undefined` on purpose, so a
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
   * equal values with different identities; taking both is how production came
   * to resolve its opening Map against one and everything after it against
   * the other.
   */
  readonly spaceSession: SpaceSession;
  /** Which Map the Space opens in; the Space's own default when absent. */
  readonly selection?: MapId | undefined;
}

export interface ComposeAppDependencies extends ComposeCoreDependencies {
  /**
   * Mints the identity of every Resource, Map and Graph a completed Edit creates
   * (ADR 0016).
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
  readonly authoring: SpaceAuthoring;
}

export interface AppCore {
  /**
   * The validated aggregate behind a working snapshot.
   *
   * Returned as well as closed over, because the render path reads the snapshot
   * *React is rendering* while `currentSpace` reads the session's live one, and
   * sharing this one reader is what gives both the same `Space` identity to
   * memoize on.
   */
  readonly readWorkingSpace: (snapshot: SpaceSnapshot) => Space;
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
  readonly authoring: SpaceAuthoring;
  readonly adapter: RenderAdapter;
  /**
   * Where the finished Edit leaves the author.
   *
   * Composed before Edge Authoring because Edge Authoring publishes into it,
   * and answered here because the two React adapters that spend it mount on
   * opposite sides of `ReactFlowProvider` and each needs the same instance.
   */
  readonly continuation: Continuation;
  readonly edgeAuthoring: EdgeAuthoring;
  /** The Delete Resource confirmation interaction for this Space. */
  readonly resourceDeletion: ResourceDeletion;
  /**
   * The sink this composition reports through, answered as well as taken.
   *
   * A collaborator composed *over* a finished app rather than inside it — the
   * embedded canvas's own authoring (`embedded-authoring.ts`) is the one —
   * needs the same sink and holds nothing else that could name it. Answering
   * it is what lets that module take its reporter required, with no default of
   * its own: ADR 0016 puts the ambient `console.error` at the composition, and
   * a module mounted from a canvas gesture minting a second one is exactly the
   * invisible source the one owner exists to prevent. Resolved here when a
   * caller supplies none, so what is answered is always a function.
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
  // One validated aggregate per working snapshot, shared by the render path and
  // by Navigation. Both read the same reader, so in the steady state a snapshot
  // is parsed and indexed once rather than once per render.
  const readWorkingSpace = createWorkingSpaceReader();
  const currentSpace = (): Space => readWorkingSpace(spaceSession.getState().working);
  // Which Map this space opens in. It also answers which Graphs are drawn
  // and which of them opens active (ADR 0026), so it has to resolve before
  // anything that reads the canvas is built.
  const openingSelection = selection ?? requireDefaultMap(currentSpace());
  const navigation = createNavigation(currentSpace, openingSelection);
  return { readWorkingSpace, currentSpace, navigation, openingSelection };
}

/** The whole composition: Navigation, Space Authoring, the render adapter and Edge Authoring. */
export function composeApp(dependencies: ComposeAppDependencies): ComposedApp {
  const {
    spaceSession,
    newId = newUuid,
    reportObserverError,
    connections,
    spaceResources,
  } = dependencies;
  const core = composeCore(dependencies);
  const { currentSpace, navigation } = core;
  const authoring = createSpaceAuthoring({
    session: spaceSession,
    navigation,
    currentSpace,
    newId,
    reportObserverError,
  });
  const adapter = createRenderAdapter(authoring);
  const continuation = createContinuation({ authoring, reportObserverError });
  // The Edge lifecycle, composed once beside the two collaborators it consumes.
  // It owns neither: the render adapter stays authoritative for the projection
  // and the canvas selection, Space Authoring for eligibility and every Edit.
  const edgeAuthoring = createEdgeAuthoring({
    authoring,
    adapter,
    connections: (connections ?? createConnectionCompletion)({ adapter, authoring }),
    continuation,
    reportObserverError,
  });
  const resourceDeletion = createResourceDeletion({
    authoring,
    currentSpace,
    spaceResources,
    reportObserverError,
  });
  return {
    ...core,
    authoring,
    adapter,
    continuation,
    edgeAuthoring,
    resourceDeletion,
    reportObserverError:
      reportObserverError ?? ((error) => console.error('Space composition observer failed', error)),
  };
}

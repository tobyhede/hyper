import { newUuid, type SpaceSnapshot, type UUID } from '@project/core';
import { Placement, type Space } from '@project/graph';
import type { ObserverErrorReporter, SpaceSession } from '@project/persistence';
import { createConnectionCompletion, type ConnectionCompletion } from './connection-completion';
import { createEdgeAuthoring, type EdgeAuthoring } from './edge-authoring';
import { createNavigation, type Navigation } from './navigation';
import { createRenderAdapter, type RenderAdapter } from './render-adapter';
import {
  createRendererResolver,
  defaultLayout,
  type CanvasRendererId,
  type ResolvedRenderer,
  type ResolveRenderer,
} from './renderer';
import { createWorkingSpaceReader } from './snapshot';
import { createSpaceAuthoring, type SpaceAuthoring } from './space-authoring';

/**
 * What an opened Space is composed of.
 *
 * The order below is not free — the resolver exists before Navigation, the
 * resolved renderer before the opening placement, Authoring before the render
 * adapter, and both before Edge Authoring — and every collaborator closes over
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
   * There is deliberately no second `Space` argument. `createStoredSpaceOpener`
   * parses the stored snapshot and `openSpaceSession` then `structuredClone`s
   * it, so the Space a caller holds at open and the session's `working` are
   * equal values with different identities; taking both is how production came
   * to resolve its opening renderer against one and everything after it against
   * the other.
   */
  readonly spaceSession: SpaceSession;
  /** Which Layout the Space opens in; the Space's own default when absent. */
  readonly selection?: CanvasRendererId | undefined;
}

export interface ComposeAppDependencies extends ComposeCoreDependencies {
  /**
   * Mints the identity of every Card, Layout and Graph a completed Edit creates
   * (ADR 0016).
   *
   * Passed explicitly so `createSpaceAuthoring` cannot fall back to its own and
   * the composition always says where an Edit's identities came from.
   */
  readonly newId?: (() => UUID) | undefined;
  /**
   * The placement the Space opens on.
   *
   * Absent, the opening Layout supplies its already-authored, possibly sparse
   * map. An explicit `null` says "none", which is not the same statement.
   */
  readonly initialPlacement?: Placement | null | undefined;
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
  readonly resolveRenderer: ResolveRenderer;
  readonly navigation: Navigation;
  /**
   * The renderer selection this composition opened in.
   *
   * Answered rather than read back off Navigation: it is what `composeCore`
   * decided, and recovering it through `navigation.getState()` makes the
   * decision look like Navigation's when it is this module's.
   */
  readonly openingSelection: CanvasRendererId;
}

export interface ComposedApp extends AppCore {
  readonly authoring: SpaceAuthoring;
  readonly adapter: RenderAdapter;
  readonly edgeAuthoring: EdgeAuthoring;
}

/**
 * The placement a resolved renderer opens on (ADR 0025).
 *
 * Exported because selecting a renderer asks the same question again
 * (`App.tsx`), and a Space that opens on one placement while re-selecting the
 * same renderer installs another is two sources of truth for one rule.
 */
export const openingPlacement = (renderer: ResolvedRenderer): Placement | null =>
  Placement.fromLayout(renderer.resolvedLayout.layout);

/**
 * Navigation and everything it needs, over one reader and one resolver.
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
  // **One resolver for the whole composition**, handed to every collaborator
  // that needs one.
  const resolveRenderer = createRendererResolver();
  // Which renderer this space opens in. It also answers which graphs are drawn
  // and which of them opens active (ADR 0026), so it has to resolve before
  // anything that reads the canvas is built.
  const openingSelection = selection ?? defaultLayout(currentSpace());
  const navigation = createNavigation(currentSpace, resolveRenderer, openingSelection);
  return { readWorkingSpace, currentSpace, resolveRenderer, navigation, openingSelection };
}

/** The whole composition: Navigation, Space Authoring, the render adapter and Edge Authoring. */
export function composeApp(dependencies: ComposeAppDependencies): ComposedApp {
  const {
    spaceSession,
    newId = newUuid,
    initialPlacement,
    reportObserverError,
    connections,
  } = dependencies;
  const core = composeCore(dependencies);
  const { currentSpace, resolveRenderer, navigation, openingSelection } = core;
  // Live nodes hold whichever positions are on screen. Absent an argument, the
  // renderer the composition opened in answers what they start as; an explicit
  // one — `null` included — is the caller's own statement and stands.
  const placement =
    initialPlacement === undefined
      ? openingPlacement(resolveRenderer(currentSpace(), openingSelection))
      : initialPlacement;
  const authoring = createSpaceAuthoring({
    session: spaceSession,
    navigation,
    currentSpace,
    resolveRenderer,
    initialPlacement: placement,
    newId,
    reportObserverError,
  });
  const adapter = createRenderAdapter(authoring);
  // The Edge lifecycle, composed once beside the two collaborators it consumes.
  // It owns neither: the render adapter stays authoritative for the projection
  // and the canvas selection, Space Authoring for eligibility and every Edit.
  const edgeAuthoring = createEdgeAuthoring({
    authoring,
    adapter,
    connections: (connections ?? createConnectionCompletion)({ adapter, authoring }),
    reportObserverError,
  });
  return { ...core, authoring, adapter, edgeAuthoring };
}

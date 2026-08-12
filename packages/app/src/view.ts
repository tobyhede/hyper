import {
  isBuiltInViewId,
  type BuiltInViewId,
  type CardId,
  type Graph,
  type Layout,
  type GraphId,
  type UUID,
} from '@project/core';
import {
  getLayout,
  gridStrategy,
  Placement,
  positionedStrategy,
  type LayoutStrategy,
  type Space,
} from '@project/graph';
import { elkStrategy } from '@project/react-flow-adapter';
import { nextNumberedTitle } from './titles';

/**
 * Which view a space opens in, and what that means for arranging and editing.
 *
 * The chain is `space.defaultView` → viewer default → the graph-driven flow.
 * The middle link has no surface yet: a viewer-level preference is named in the
 * spec and deliberately not built, so today the chain is two links long.
 *
 * A view also answers which graphs it shows and which of them opens active
 * (ADR 0026). What it shows follows from its subject: a selected Layout draws
 * the graphs it owns, an Algorithmic View over the Space's cards draws the
 * flatten across every Layout (ADR 0040, ADR 0045). The active one is read off
 * the resolved Layout and falls back, so the answer exists for every space —
 * including one with no Layout, which is one with no graphs at all.
 *
 * This lives in `app` rather than `graph` because resolving a view means
 * choosing a strategy, and `elkStrategy` lives in the adapter — `graph` may not
 * reach for it. Composition is exactly this file's job.
 */

/** Where a space opens when it names no view of its own. */
export const DEFAULT_VIEW_ID: BuiltInViewId = 'flow';

const BUILT_IN_STRATEGIES: Record<BuiltInViewId, () => LayoutStrategy> = {
  flow: elkStrategy,
  grid: gridStrategy,
};

/**
 * The subject a view renders: its cards, and the graphs over them (ADR 0045).
 *
 * *Zero* or more graphs, deliberately — a new space is one card and no graphs
 * (ADR 0018) and still has to render. The asymmetry with {@link ConvertedLayout}
 * below, which requires one or more, is the whole cardinality rule.
 */
export interface ViewSubject {
  readonly cardIds: readonly CardId[];
  readonly graphs: readonly Graph[];
}

/**
 * What a view hands back on conversion: everything a Layout is made of.
 *
 * Both halves travel together because both obligations are stated over the
 * *returned* pair — an edge endpoint is checked against the cards this value
 * carries, not against the subject the view was given. A view that prunes its
 * subject is legal; one that prunes a card and keeps an edge into it is not.
 *
 * The graphs are a non-empty tuple rather than an array, so "one or more" is a
 * thing a view cannot get wrong rather than a thing the boundary has to catch.
 * The first is the one the new Layout opens active on, which is the same rule an
 * absent `activeGraph` is read by (ADR 0026).
 */
export interface ConvertedLayout {
  readonly positions: Placement;
  readonly graphs: readonly [Graph, ...Graph[]];
}

/**
 * A view's own conversion, before the boundary has checked it.
 *
 * What a view does between its two sides is its own business (ADR 0045): it may
 * return the graphs it was showing, a fresh empty one, or a pruned projection.
 * {@link convertView} is what holds every one of those to the two obligations.
 */
export type ViewConversion = (
  subject: ViewSubject,
  positions: Placement,
  newGraphId: () => GraphId,
) => ConvertedLayout;

/**
 * ADR 0045's conversion boundary: a view's own answer, held to the two
 * obligations that bind every view, present and future.
 *
 * **Closure.** Every edge endpoint of every returned graph is among the returned
 * cards. ADR 0040 states this as an invariant of a Layout; stating it here is
 * what makes it hold for Layouts nobody has designed a view for yet, and it
 * closes the gap review of PR #39 found — a view that selected a subset of its
 * source graph's cards and converted produced edges naming non-members.
 *
 * **Fresh identity.** No returned graph carries an identity already in use.
 * This is the mechanism ADR 0040's ownership claimed and did not supply: it is
 * what makes it impossible for any view to hand two Layouts one graph. It is
 * checked against the subject's graphs, which for a converting view is every
 * graph in the space — the flatten — so it is also what keeps a graph id unique
 * across the space (ADR 0045). Two returned graphs sharing one identity fail it
 * for the same reason; `graphsById` is a `new Map` and would drop one in
 * silence.
 *
 * Both throw rather than refusing. Neither is an author's mistake or a state
 * the product can reach — they are a view implementation that is wrong, and the
 * Edit that called it has nothing to fall back to.
 */
export function convertView(
  choose: ViewConversion,
  subject: ViewSubject,
  positions: Placement,
  newGraphId: () => GraphId,
): ConvertedLayout {
  const converted = choose(subject, positions, newGraphId);
  const taken = new Set<GraphId>(subject.graphs.map((graph) => graph.id));
  for (const graph of converted.graphs) {
    if (taken.has(graph.id)) {
      throw new Error(
        `A View returned the Graph ${graph.id}, which is not a fresh identity it may own.`,
      );
    }
    taken.add(graph.id);
    for (const edge of graph.edges) {
      if (!converted.positions.has(edge.from) || !converted.positions.has(edge.to)) {
        throw new Error(
          `A View returned the Graph ${graph.id} with an Edge from ${edge.from} to ${edge.to}, which is not closed over the Cards it returned.`,
        );
      }
    }
  }
  return converted;
}

/**
 * What an Algorithmic View returns on conversion: one fresh graph holding no
 * edges, numbered above the graphs it was showing.
 *
 * This is the **view's choice** among legal outputs and not a rule of the
 * boundary (ADR 0045) — a copy of the graph the author was emphasising would
 * satisfy both obligations just as well. It is not what this view does, because
 * a copy is how two graphs carrying one title begin diverging in silence. An
 * author surprised once by finding their edge in a new graph has been surprised;
 * an author whose two "Onboarding" graphs drifted apart over a month has been
 * harmed.
 */
const freshGraphConversion: ViewConversion = (subject, positions, newGraphId) => ({
  positions,
  graphs: [
    {
      id: newGraphId(),
      title: nextNumberedTitle(
        'Graph',
        subject.graphs.map((graph) => graph.title),
      ),
      edges: [],
    },
  ],
});

/**
 * Whether this view already has a Layout, or gets one by being edited.
 *
 * A union rather than two independent nullable fields, because exactly one of
 * the two holds and nothing should have to defend against the pair that cannot
 * happen. Neither side is a permission: every view is editable, and an automatic
 * one gets a Layout by being edited (ADR 0025). What this answers is whether
 * Edit completion updates a Layout the author named or creates one.
 */
export type ViewLayout =
  | {
      readonly layout: Layout;
      readonly convert: null;
    }
  | {
      readonly layout: null;
      /**
       * Convert this view into the content of a new Layout: the cards it was
       * showing with their positions, plus one or more graphs, each already held
       * to ADR 0045's two obligations by {@link convertView}.
       *
       * A selected Layout has no counterpart to this — it is not converted, it
       * is updated in place, and its graphs keep the identities it owns.
       *
       * The minter comes from the caller because `resolveView` is a free
       * function seven call sites reach, only one of which converts: the module
       * that mints — Space Authoring — took the dependency once when it was
       * composed, and hands it to the conversion it is already performing. A
       * parameter on `resolveView` instead would repeat it at six Navigation
       * call sites that never mint anything.
       */
      readonly convert: (positions: Placement, newGraphId: () => GraphId) => ConvertedLayout;
    };

interface ResolvedViewBase {
  /** A declared Layout's id, or a built-in view's. */
  id: string;
  /** Arranges the cards this renderer shows. */
  strategy: LayoutStrategy;
  /**
   * The cards of this view's subject: a selected Layout's own members, which
   * are its position keys, or every card in the Space under an Algorithmic View
   * (ADR 0040, ADR 0045).
   *
   * The Card half of what {@link ResolvedViewBase.visibleGraphIds} answers for
   * graphs, and the same argument for it being a field: which cards a view takes
   * from its space is the View's call (ADR 0005). The render path does not read
   * it yet — the omitted-Card fallback band still draws a card a Layout leaves
   * out, and package 5 of the handoff replaces the band and its readers together.
   */
  cardIds: readonly CardId[];
  /**
   * The graphs this view draws: the ones a selected Layout owns, or the Space
   * flatten under an Algorithmic View. It stays a field rather than collapsing
   * into `space.graphs` at each reader because which graphs a view shows is the
   * View's call (ADR 0005), and the two answers now differ.
   */
  visibleGraphIds: readonly GraphId[];
  /**
   * Which visible graph opens active, or `null` in a space with no graphs
   * (ADR 0015). The fallback to the first visible graph lives here rather than
   * in the store, so there is one place that answers it (ADR 0026).
   */
  activeGraphId: GraphId | null;
}

export type ResolvedView = ResolvedViewBase & ViewLayout;

/** The one renderer currently navigating a Space (ADR 0031). */
export type RendererSelection =
  | { readonly kind: 'view'; readonly view: BuiltInViewId }
  | { readonly kind: 'layout'; readonly layoutId: UUID };

/**
 * Which graphs a view draws and which of them opens active.
 *
 * A selected Layout draws the graphs **it owns** (ADR 0040); an Algorithmic
 * View, whose subject is the Space's cards, draws every graph in the Space —
 * the flatten across every Layout, which `Space.graphs` already is (ADR 0045).
 * Those are two subjects, not two kinds of view.
 *
 * A read, never a write: an author's space needs neither answer written down,
 * and both are computed rather than filled in. What the app *saves* names the
 * active graph outright, which is a different rule and lives in `snapshot.ts`
 * (ADR 0028).
 */
function resolveSubject(space: Space, layout: Layout | null): ViewSubject {
  return {
    // A Layout's position keys **are** its Card membership (ADR 0040); an
    // Algorithmic View's subject is the Space's Cards, which is what makes its
    // flatten closed for free — every endpoint of every Graph is one of them.
    cardIds:
      layout === null
        ? space.cards.map((card) => card.id)
        : [...Placement.fromLayout(layout).keys()],
    graphs: layout?.graphs ?? space.graphs,
  };
}

function resolveGraphs(
  space: Space,
  layout: Layout | null,
): Pick<ResolvedView, 'visibleGraphIds' | 'activeGraphId'> {
  const visibleGraphIds = (layout?.graphs ?? space.graphs).map((graph) => graph.id);
  return {
    visibleGraphIds,
    // `loadSpace` has already checked that a named `activeGraph` is one this
    // Layout owns, so the `??` is the absent case and not a repair of a bad
    // reference. The fallback runs over what the view draws — a Layout falling
    // back to the Space's first graph would open active on one it does not own.
    activeGraphId: layout?.activeGraph ?? visibleGraphIds[0] ?? null,
  };
}

/**
 * Whether a resolved view draws a Graph.
 *
 * The membership test for the set `resolveGraphs` answers, and it lives beside
 * it so the question and the one answer to it sit in the same module (ADR 0026).
 * It reads `visibleGraphIds` rather than deciding visibility a second time —
 * Navigation asks this, and a Navigation that computed its own answer would
 * disagree with the renderer the moment the two sets differ again.
 */
export const viewShowsGraph = (view: ResolvedView, graphId: GraphId): boolean =>
  view.visibleGraphIds.includes(graphId);

/** Resolve the Space default into the initial renderer selection. */
export function defaultRenderer(space: Space): RendererSelection {
  const requested = space.defaultView ?? DEFAULT_VIEW_ID;
  return isBuiltInViewId(requested)
    ? { kind: 'view', view: requested }
    : { kind: 'layout', layoutId: requested };
}

export function resolveView(
  space: Space,
  selection: RendererSelection = defaultRenderer(space),
): ResolvedView {
  if (selection.kind === 'layout') {
    const layout = getLayout(space, selection.layoutId);
    if (layout === undefined) {
      throw new Error(`The selected Layout ${selection.layoutId} does not exist.`);
    }
    return {
      id: layout.id,
      strategy: positionedStrategy(Placement.fromLayout(layout)),
      layout,
      cardIds: resolveSubject(space, layout).cardIds,
      convert: null,
      ...resolveGraphs(space, layout),
    };
  }

  const strategy = BUILT_IN_STRATEGIES[selection.view]();
  const subject = resolveSubject(space, null);
  // A built-in view carries no Layout, so it has no authored active graph to
  // read: every graph shows, and the first is active. Editing it converts it,
  // and the subject resolved here is what that conversion is over.
  return {
    id: selection.view,
    strategy,
    layout: null,
    cardIds: subject.cardIds,
    convert: (positions, newGraphId) =>
      convertView(freshGraphConversion, subject, positions, newGraphId),
    ...resolveGraphs(space, null),
  };
}

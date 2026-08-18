import {
  isBuiltInViewId,
  type BuiltInViewId,
  type Card,
  type CardId,
  type Graph,
  type GraphId,
  type UUID,
} from '@project/core';
import {
  gridStrategy,
  Placement,
  positionedStrategy,
  repeatedGraphEdges,
  type LayoutStrategy,
  type ResolvedLayout,
  type Space,
} from '@project/graph';
import { elkStrategy } from '@project/react-flow-adapter';
import { nextGraphColor } from './colors';
import { nextGraphTitle } from './titles';

/**
 * What is currently drawing a Space, and what editing it means.
 *
 * A renderer is one of two things and never both: an application-supplied
 * **View**, which computes placement and gains a Layout by being edited (ADR
 * 0025), or an authored **Layout**, which is updated in place. Discriminating
 * them is what removes the pair of nullable fields that used to encode it —
 * `layout` and `convert`, exactly one of which was ever non-null — and it is why
 * this module is not named after either variant.
 *
 * It lives in `app` rather than `graph` because resolving a renderer means
 * choosing a strategy, and `elkStrategy` lives in the adapter, which `graph` may
 * not reach. Composition is exactly this file's job.
 */

/** Where a space opens when it names no view of its own. */
export const DEFAULT_VIEW_ID: BuiltInViewId = 'flow';

/**
 * What a renderer draws: exact Cards and exact Graphs, taken from one Space.
 *
 * Values rather than ids, because every obligation stated over a subject is
 * about the things themselves — an Edge endpoint is checked against the Cards
 * this carries, and a conversion's freshness against the Graphs it carries. A
 * caller that needs an id reads one off; a caller handed ids could not go the
 * other way without a lookup, and would then be free to look one up in a
 * different Space.
 *
 * *Zero* or more Graphs, deliberately: a new Space is one Card and no Graphs
 * (ADR 0018) and still renders. The asymmetry with {@link ViewConversion}, which
 * carries one or more, is the whole cardinality rule of ADR 0045.
 *
 * Transparent and unbranded. It is a selection over a Space, checked where it is
 * produced; nothing downstream reconstructs one.
 */
export interface RendererSubject {
  readonly cards: readonly Card[];
  readonly graphs: readonly Graph[];
}

/**
 * What a View hands back on conversion: one or more Graphs, each already
 * carrying a fresh identity this module minted.
 *
 * Graphs and nothing else. The Placement conversion is given is the completed
 * one Space Authoring already holds, so returning it would hand the caller its
 * own value back and invite a second, disagreeing copy.
 *
 * A non-empty tuple rather than an array, so "one or more" is a thing a caller
 * cannot get wrong rather than a thing it has to check. The first is the one the
 * new Layout opens active on, which is the same rule an absent `activeGraph` is
 * read by (ADR 0026).
 */
export interface ViewConversion {
  readonly graphs: readonly [Graph, ...Graph[]];
}

/** An application-supplied View: it computes placement, and editing converts it. */
export interface ResolvedViewRenderer {
  readonly kind: 'view';
  readonly id: BuiltInViewId;
  readonly title: string;
  readonly subject: RendererSubject;
  readonly strategy: LayoutStrategy;
  /**
   * The Graph this View opens on when Navigation opens or explicitly selects it,
   * or `null` in a Space with no Graphs (ADR 0015).
   *
   * A default and not an answer about the current state: `continueInRenderer`
   * carries the Active Graph a completed Edit produced and must never quietly
   * replace it with this (ADR 0040). A Layout has no counterpart here because
   * `resolvedLayout.activeGraph` already is one.
   */
  readonly defaultActiveGraph: Graph | null;
  /**
   * Convert this View into the Graphs of a new Layout (ADR 0025, ADR 0045).
   *
   * Synchronous, and it takes the completed rendered Placement so the two
   * obligations can be checked against the Cards the Layout will actually hold.
   */
  readonly convert: (rendered: Placement) => ViewConversion;
}

/** An authored Layout: it is not converted, it is updated in place. */
export interface ResolvedLayoutRenderer {
  readonly kind: 'layout';
  /** The canonical value `space.lookup.layout` answers with, Active Graph included. */
  readonly resolvedLayout: ResolvedLayout;
  readonly subject: RendererSubject;
  readonly strategy: LayoutStrategy;
}

export type ResolvedRenderer = ResolvedViewRenderer | ResolvedLayoutRenderer;

/** The one renderer currently navigating a Space (ADR 0031). */
export type RendererSelection =
  | { readonly kind: 'view'; readonly view: BuiltInViewId }
  | { readonly kind: 'layout'; readonly layoutId: UUID };

/**
 * Why a renderer refused, and every one of them is a defect rather than an
 * author's mistake.
 *
 * A View that breaks an obligation is wrong, and the Edit that called it has
 * nothing to fall back to; a selection naming a Layout that is gone is a caller
 * that failed to check. So these throw, and Space Authoring must **not** turn
 * one into `unchanged` or `refused` — a refusal is a thing the author did, and
 * none of these is.
 */
export type RendererInvariantReason =
  | 'renderer-not-found'
  | 'invalid-subject'
  | 'placement-does-not-match-subject'
  | 'empty-graph-output'
  | 'graph-edge-outside-placement'
  | 'duplicate-graph-edge'
  | 'graph-id-not-fresh';

export class RendererInvariantError extends Error {
  readonly reason: RendererInvariantReason;

  constructor(reason: RendererInvariantReason, message: string) {
    super(message);
    this.name = 'RendererInvariantError';
    this.reason = reason;
  }
}

/**
 * A selection naming a Layout the Space does not hold.
 *
 * Two modules ask this — the resolver below, and `canvasChoice`, which lists
 * what may be selected — and they must not answer it two ways. Offered as a
 * constructor rather than a bare message so the reason travels with the words:
 * a copied string agrees only until someone rewords one of them, which is the
 * disagreement `canvas-choice.ts` exists to remove and would then have
 * reintroduced a layer down.
 */
export const layoutNotFound = (layoutId: UUID): RendererInvariantError =>
  new RendererInvariantError(
    'renderer-not-found',
    `The selected Layout ${layoutId} does not exist.`,
  );

/**
 * A Graph's content with no identity on it — what a View policy decides.
 *
 * Identity is the shared module's to mint, so a policy cannot return a source
 * Graph's id however plainly its author meant *that* Graph (ADR 0045). The
 * obligation ADR 0040 claimed and did not supply is here made unrepresentable
 * rather than checked: a future View may copy or prune Graph content freely, and
 * still cannot hand two Layouts one Graph.
 */
export type GraphWithoutId = Omit<Graph, 'id'>;

/**
 * A View's own choice of what a conversion produces, over its subject and the
 * Placement being converted. Pure, and identity-free.
 */
export type ViewGraphPolicy = (
  space: Space,
  subject: RendererSubject,
  placement: Placement,
) => readonly [GraphWithoutId, ...GraphWithoutId[]];

/** Everything one conversion is decided from. See {@link convertSubject}. */
export interface SubjectConversion {
  readonly space: Space;
  readonly subject: RendererSubject;
  readonly policy: ViewGraphPolicy;
  readonly placement: Placement;
  readonly newGraphId: () => GraphId;
  /**
   * Which renderer a refusal names, in the same closed vocabulary a selection
   * and `space.defaultView` are written in: a built-in View's id, or a Layout's.
   */
  readonly rendererId: BuiltInViewId | UUID;
}

/**
 * ADR 0045's conversion boundary, in the fixed order the obligations depend on.
 *
 * The Placement is checked against the subject *first*, because everything after
 * it is stated over the Cards the new Layout will hold and a Placement that is
 * not those Cards makes each later check answer a different question. The policy
 * runs next, its output is checked whole, and only then are identities minted —
 * so an output that was going to be refused consumes none. A minted id that
 * collides is reported rather than retried: a colliding identity source is a
 * fault, and silently drawing again would hide it.
 *
 * **It is exported so a View nobody has designed yet can be pushed through it.**
 * Flow and Grid are three lines each and could be read; what makes the
 * obligations mean anything is that they hold at the boundary, over policies
 * written to break them. `renderer.property.test.ts` generates exactly those.
 * The `createRendererResolver` below is the only caller in the app, and the
 * private registry is still the only way to select a View.
 */
export function convertSubject({
  space,
  subject,
  policy,
  placement,
  newGraphId,
  rendererId,
}: SubjectConversion): ViewConversion {
  if (
    placement.size !== subject.cards.length ||
    subject.cards.some((card) => !placement.has(card.id))
  ) {
    throw new RendererInvariantError(
      'placement-does-not-match-subject',
      `The renderer ${rendererId} was converted with a Placement of ${placement.size} Card(s) that is not its subject of ${subject.cards.length}.`,
    );
  }

  // Widened deliberately: the tuple is what a policy promises, and this is the
  // one place that does not take the promise on trust.
  const chosen: readonly GraphWithoutId[] = policy(space, subject, placement);
  const [head, ...tail] = chosen;
  if (head === undefined) {
    throw new RendererInvariantError(
      'empty-graph-output',
      `The renderer ${rendererId} returned no Graph, and a Layout owns at least one.`,
    );
  }

  for (const graph of chosen) {
    // What counts as the same Edge twice is the domain's answer and not this
    // module's (ADR 0032), so it is asked of `@project/graph` — the same call
    // intake makes when it refuses a document holding one. Read inside the loop
    // so the first thing wrong with an Edge is still what a View is told about,
    // in the order its own Edges are in.
    const repeats = repeatedGraphEdges(graph.edges);
    for (const [index, edge] of graph.edges.entries()) {
      if (!placement.has(edge.from) || !placement.has(edge.to)) {
        throw new RendererInvariantError(
          'graph-edge-outside-placement',
          `The renderer ${rendererId} returned an Edge from ${edge.from} to ${edge.to}, which is not closed over the Cards of the Layout it is creating.`,
        );
      }
      if (repeats.has(index)) {
        throw new RendererInvariantError(
          'duplicate-graph-edge',
          `The renderer ${rendererId} returned the Edge from ${edge.from} to ${edge.to} twice in one Graph.`,
        );
      }
    }
  }

  // Fresh against the whole Space, not merely against the subject: a Graph id is
  // unique across the Space although one Layout owns it (ADR 0045).
  const taken = new Set<GraphId>(space.graphs.map((graph) => graph.id));
  const identify = (graph: GraphWithoutId): Graph => {
    const graphId = newGraphId();
    if (taken.has(graphId)) {
      throw new RendererInvariantError(
        'graph-id-not-fresh',
        `The renderer ${rendererId} was given the Graph identity ${graphId}, which is already in use.`,
      );
    }
    taken.add(graphId);
    return { ...graph, id: graphId };
  };

  return { graphs: [identify(head), ...tail.map(identify)] };
}

interface BuiltInViewDefinition {
  readonly title: string;
  readonly selectSubject: (space: Space) => RendererSubject;
  readonly createStrategy: () => LayoutStrategy;
  readonly graphPolicy: ViewGraphPolicy;
}

/**
 * Every Card in the Space, and every Graph in it — the flatten across the
 * Layouts that own them (ADR 0045).
 *
 * This is what makes an Algorithmic View's Graph collection closed for free:
 * every Edge endpoint of every Graph is a Card of some Layout and therefore a
 * Card of the Space.
 */
const spaceSubject = (space: Space): RendererSubject => ({
  cards: space.cards,
  graphs: space.graphs,
});

/**
 * One fresh Graph holding no Edges, numbered and coloured above the Graphs being
 * shown.
 *
 * The **View's choice** among legal outputs and not a rule of the boundary (ADR
 * 0045) — a copy of the Graph the author was emphasising would satisfy every
 * obligation just as well. It is not what these Views do, because a copy is how
 * two Graphs carrying one title begin diverging in silence. An author surprised
 * once by finding their Edge in a new Graph has been surprised; an author whose
 * two "Onboarding" Graphs drifted apart over a month has been harmed.
 *
 * It needs no input Graph, which is what lets either View render a new Space
 * with none: the empty Graph exists only because an Edit is creating a Layout,
 * and a Layout's Graph collection is non-empty (ADR 0040).
 *
 * The stored colour is the same rule Graph management's Add Graph uses, so a
 * Graph does not come out with different properties according to whether the
 * author asked for it or drew the first connection that minted it. A conversion
 * creates the Layout, so this Graph occupies its first position and takes the
 * first palette colour, whatever the View was drawing.
 */
const freshEmptyGraph: ViewGraphPolicy = (_space, subject) => [
  { title: nextGraphTitle(subject.graphs), color: nextGraphColor(0), edges: [] },
];

/**
 * The built-in Views, closed.
 *
 * Private on purpose. Public View registration is future work — persisted View
 * ids and what happens when a plugin is missing are undecided — and a seam
 * exposed before either question is answered would be a guess. Two definitions
 * behind one internal shape is enough to keep the shape honest.
 */
const BUILT_IN_VIEWS: Readonly<Record<BuiltInViewId, BuiltInViewDefinition>> = {
  flow: {
    title: 'Flow',
    selectSubject: spaceSubject,
    createStrategy: elkStrategy,
    graphPolicy: freshEmptyGraph,
  },
  grid: {
    title: 'Grid',
    selectSubject: spaceSubject,
    createStrategy: gridStrategy,
    graphPolicy: freshEmptyGraph,
  },
};

/**
 * What a built-in View is called, for the chrome that lists every one of them.
 *
 * A lookup and not the registration seam the collection above declines to be:
 * the workspace sidebar draws one row per built-in View (ADR 0053) and needs a
 * title for each, where `ResolvedViewRenderer.title` answers only for the View
 * currently drawing. Titles stay defined once, beside the strategy and subject
 * they belong to.
 */
export const builtInViewTitle = (id: BuiltInViewId): string => BUILT_IN_VIEWS[id].title;

/**
 * A Layout's subject: its own Card members, and the Graphs it owns.
 *
 * Members are the Layout's position keys (ADR 0040), listed in `space.cards`
 * order rather than in the map's insertion order — the same stable order every
 * other Card list in the app is in, so two subjects over one Layout can never
 * disagree about sequence.
 *
 * The members are passed in rather than read again here, because the resolver
 * needs the very same map for `positionedStrategy` and building a Layout's
 * positions twice per resolve is work nothing asked for. Sharing it is safe in
 * the one direction that matters: a `Placement` is read-only, and this reads.
 */
function layoutSubject(
  space: Space,
  resolved: ResolvedLayout,
  members: Placement,
): RendererSubject {
  return {
    cards: space.cards.filter((card) => members.has(card.id)),
    graphs: resolved.layout.graphs,
  };
}

/**
 * Hold a subject to being a selection over the source Space, and answer it.
 *
 * Exact values, no duplicates. It is cheap and it is what stops a subject
 * selector — including one written for a View nobody has designed yet — from
 * synthesising an authored entity, cloning one, or listing a Card twice and
 * making every downstream count wrong.
 *
 * Exported for the same reason `convertSubject` is: Flow and Grid both select
 * the whole Space and could not break this if they tried, so a guard proved only
 * through them is not proved at all. `renderer.property.test.ts` pushes
 * generated subjects through it.
 */
export function checkSubject(
  space: Space,
  rendererId: BuiltInViewId | UUID,
  subject: RendererSubject,
): RendererSubject {
  const cardIds = new Set<CardId>();
  for (const card of subject.cards) {
    if (space.lookup.card(card.id) !== card) {
      throw new RendererInvariantError(
        'invalid-subject',
        `The renderer ${rendererId} selected a Card ${card.id} that is not the Space's own value.`,
      );
    }
    if (cardIds.has(card.id)) {
      throw new RendererInvariantError(
        'invalid-subject',
        `The renderer ${rendererId} selected the Card ${card.id} twice.`,
      );
    }
    cardIds.add(card.id);
  }

  const graphIds = new Set<GraphId>();
  for (const graph of subject.graphs) {
    if (space.lookup.graph(graph.id)?.graph !== graph) {
      throw new RendererInvariantError(
        'invalid-subject',
        `The renderer ${rendererId} selected a Graph ${graph.id} that is not the Space's own value.`,
      );
    }
    if (graphIds.has(graph.id)) {
      throw new RendererInvariantError(
        'invalid-subject',
        `The renderer ${rendererId} selected the Graph ${graph.id} twice.`,
      );
    }
    graphIds.add(graph.id);
  }

  return subject;
}

export interface RendererResolverDependencies {
  /**
   * Where a converted Graph's identity comes from.
   *
   * Injected at composition rather than taken per call, so the operation stays
   * in domain language and a test can compose a deterministic resolver instead
   * of mocking a global.
   */
  readonly newGraphId: () => GraphId;
}

export type ResolveRenderer = (space: Space, selection?: RendererSelection) => ResolvedRenderer;

/**
 * The identity of a renderer selection as one string.
 *
 * Chrome that lists every selection at once has to say which member of the list
 * is current, and comparing two selections field by field at each site is how
 * the list and the thing it reports on begin to disagree (ADR 0053).
 */
export const rendererSelectionKey = (selection: RendererSelection): string =>
  selection.kind === 'view' ? `view:${selection.view}` : `layout:${selection.layoutId}`;

/** Resolve the Space default into the initial renderer selection. */
export function defaultRenderer(space: Space): RendererSelection {
  const requested = space.defaultView ?? DEFAULT_VIEW_ID;
  return isBuiltInViewId(requested)
    ? { kind: 'view', view: requested }
    : { kind: 'layout', layoutId: requested };
}

/**
 * Compose the one resolver this app resolves renderers with.
 *
 * There is exactly one per composition, shared by App rendering, Navigation and
 * Space Authoring. A second would be a second source of minted identities, and
 * the whole point of taking `newGraphId` here is that a deterministic one can be
 * supplied in one place.
 */
export function createRendererResolver({
  newGraphId,
}: RendererResolverDependencies): ResolveRenderer {
  return (space, selection = defaultRenderer(space)) => {
    if (selection.kind === 'layout') {
      const resolvedLayout = space.lookup.layout(selection.layoutId);
      if (resolvedLayout === undefined) throw layoutNotFound(selection.layoutId);
      const members = Placement.fromLayout(resolvedLayout.layout);
      return {
        kind: 'layout',
        resolvedLayout,
        subject: checkSubject(
          space,
          resolvedLayout.layout.id,
          layoutSubject(space, resolvedLayout, members),
        ),
        strategy: positionedStrategy(members),
      };
    }

    const definition = BUILT_IN_VIEWS[selection.view];
    const subject = checkSubject(space, selection.view, definition.selectSubject(space));
    return {
      kind: 'view',
      id: selection.view,
      title: definition.title,
      subject,
      strategy: definition.createStrategy(),
      defaultActiveGraph: subject.graphs[0] ?? null,
      convert: (rendered) =>
        convertSubject({
          space,
          subject,
          policy: definition.graphPolicy,
          placement: rendered,
          newGraphId,
          rendererId: selection.view,
        }),
    };
  };
}

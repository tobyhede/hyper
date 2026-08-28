import type { Card, CardId, Graph, GraphId, Layout, UUID } from '@project/core';
import type { Space } from './space';

/**
 * Contextual entity resolution over a validated Space.
 *
 * A Layout owns its Graphs (ADR 0040) and `space.graphs` is a flatten across
 * every Layout (ADR 0045), so an id taken off that collection has lost the one
 * thing ownership adds — which Layout's Cards its Edges are closed over, and
 * which Layout an Edit to it belongs in. Every answer here therefore arrives
 * with its context already resolved, rather than as a bare value a caller has to
 * go looking for the rest of.
 *
 * The values are built once, during intake, and closed over by
 * {@link SpaceLookup}. Nothing outside this module can reach the Maps behind it,
 * which is what makes "the index" a thing a Space *has* rather than a set of
 * parallel collections every caller may read, index a second way, or disagree
 * with.
 */

/**
 * A Layout, and the Graph it opens active on.
 *
 * The Active Graph is resolved once, here, rather than at each reader: it is the
 * Graph the Layout names, or its first (ADR 0026). Resolving it does **not**
 * fill the authored optional — `layout` is the exact authored value, so a
 * snapshot or an export written from it preserves the absence.
 */
export interface ResolvedLayout {
  /** The exact authored value in `space.layouts`. */
  readonly layout: Layout;
  /** The exact owned Graph: the authored choice, or the first-Graph fallback. */
  readonly activeGraph: Graph;
}

/** A Graph, and the Layout that owns it. */
export interface OwnedGraph {
  /** The exact nested value, also present in `space.graphs`. */
  readonly graph: Graph;
  /** The canonical contextual value `lookup.layout` answers for its owner. */
  readonly owner: ResolvedLayout;
}

/**
 * The one interface for identity lookup over a Space. O(1), total over the
 * Space's own entities, and canonical: two calls with one id answer the same
 * value, and a Graph's `owner` is the very value its owning Layout's id resolves
 * to.
 */
export interface SpaceLookup {
  card(id: CardId): Card | undefined;
  layout(id: UUID): ResolvedLayout | undefined;
  graph(id: GraphId): OwnedGraph | undefined;
}

/** A card that owns content rather than pointing at another card's content. */
export type ResolvedContentCard = Extract<Card, { kind: 'markdown' }>;

/**
 * The card whose content `cardId` shows. A markdown card is its own content
 * card; an alias resolves to its target (ADR 0009). Aliasing is a single hop —
 * validation guarantees a target is never itself an alias — so this follows at
 * most one link. Returns `undefined` if the card or its target does not resolve.
 *
 * A domain operation rather than an identity lookup, which is why it stays a
 * function beside `SpaceLookup` rather than becoming a fourth method on it: what
 * it answers is *content*, and the hop it follows is Alias semantics.
 */
export function resolveContentCard(space: Space, cardId: CardId): ResolvedContentCard | undefined {
  const card = space.lookup.card(cardId);
  if (card?.kind === 'markdown') return card;
  if (card?.kind !== 'alias') return undefined;

  const target = space.lookup.card(card.target);
  return target?.kind === 'markdown' ? target : undefined;
}

/**
 * The one failure building the lookup can meet, and it is not one a document can
 * reach: `positionedLayoutSchema` requires at least one Graph, and every Space
 * arrives through that parse.
 *
 * It survives because `min(1)` does not reach the type — `noUncheckedIndexedAccess`
 * widens the first read to `| undefined` — so a total function needs an answer
 * for a state no document is in. Reporting it as a shape failure naming the
 * Layout says exactly what the schema would have, in the one place still able to
 * observe it, rather than inventing a Graph or asserting the read away.
 */
type SpaceLookupResult =
  | { readonly ok: true; readonly lookup: SpaceLookup }
  | { readonly ok: false; readonly layoutWithoutGraph: UUID };

/**
 * Build the lookup over an already reference-checked Space.
 *
 * Order matters: every `ResolvedLayout` is built first, so the `OwnedGraph`
 * values below can close over the *same* value the owner's id answers with. Two
 * passes rather than one is what makes `lookup.graph(id)?.owner ===
 * lookup.layout(ownerId)` hold as identity rather than as equality.
 */
export function buildSpaceLookup(input: {
  readonly cards: readonly Card[];
  readonly layouts: readonly Layout[];
}): SpaceLookupResult {
  const resolvedLayouts = new Map<UUID, ResolvedLayout>();
  for (const layout of input.layouts) {
    const activeGraph =
      layout.graphs.find((graph) => graph.id === layout.activeGraph) ?? layout.graphs[0];
    if (activeGraph === undefined) return { ok: false, layoutWithoutGraph: layout.id };
    resolvedLayouts.set(layout.id, { layout, activeGraph });
  }

  const ownedGraphs = new Map<GraphId, OwnedGraph>();
  for (const owner of resolvedLayouts.values()) {
    for (const graph of owner.layout.graphs) {
      ownedGraphs.set(graph.id, { graph, owner });
    }
  }

  const cards = new Map<CardId, Card>(input.cards.map((card) => [card.id, card]));
  return {
    ok: true,
    lookup: {
      card: (id) => cards.get(id),
      layout: (id) => resolvedLayouts.get(id),
      graph: (id) => ownedGraphs.get(id),
    },
  };
}

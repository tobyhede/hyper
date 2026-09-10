import type { Card, CardId, Graph, GraphId, Diagram, UUID } from '@project/core';
import type { Space } from './space';

/**
 * Contextual entity resolution over a validated Space.
 *
 * A Diagram owns its Graphs (ADR 0040) and `space.graphs` is a flatten across
 * every Diagram (ADR 0045), so an id taken off that collection has lost the one
 * thing ownership adds — which Diagram's Cards its Edges are closed over, and
 * which Diagram an Edit to it belongs in. Every answer here therefore arrives
 * with its context already resolved, rather than as a bare value a caller has to
 * go looking for the rest of.
 *
 * The values are built once, during intake, and closed over by
 * {@link SpaceLookup}. Nothing outside this module can reach the Maps behind it,
 * which is what makes "the index" something a Space *has* rather than a set of
 * parallel collections every caller may read, index a second way, or disagree
 * with.
 */

/**
 * A Diagram, and the Graph it opens active on.
 *
 * The Active Graph is resolved once, here, rather than at each reader: it is the
 * Graph the Diagram names, or its first (ADR 0026). Resolving it does **not**
 * fill the authored optional — `diagram` is the exact authored value, so a
 * snapshot or an export written from it preserves the absence.
 */
export interface ResolvedDiagram {
  /** The exact authored value in `space.diagrams`. */
  readonly diagram: Diagram;
  /** The exact owned Graph: the authored choice, or the first-Graph fallback. */
  readonly activeGraph: Graph;
}

/** A Graph, and the Diagram that owns it. */
export interface OwnedGraph {
  /** The exact nested value, also present in `space.graphs`. */
  readonly graph: Graph;
  /** The canonical contextual value `lookup.diagram` answers for its owner. */
  readonly owner: ResolvedDiagram;
}

/**
 * The one interface for identity lookup over a Space. O(1), total over the
 * Space's own entities, and canonical: two calls with one id answer the same
 * value, and a Graph's `owner` is the very value its owning Diagram's id resolves
 * to.
 */
export interface SpaceLookup {
  card(id: CardId): Card | undefined;
  diagram(id: UUID): ResolvedDiagram | undefined;
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
 * reach: `positionedDiagramSchema` requires at least one Graph, and every Space
 * arrives through that parse.
 *
 * It survives because `min(1)` does not reach the type — `noUncheckedIndexedAccess`
 * widens the first read to `| undefined` — so a total function needs an answer
 * for a state no document is in. Reporting it as a shape failure naming the
 * Diagram says exactly what the schema would have, in the one place still able to
 * observe it, rather than inventing a Graph or asserting the read away.
 */
type SpaceLookupResult =
  | { readonly ok: true; readonly lookup: SpaceLookup }
  | { readonly ok: false; readonly diagramWithoutGraph: UUID };

/**
 * Build the lookup over an already reference-checked Space.
 *
 * Order matters: every `ResolvedDiagram` is built first, so the `OwnedGraph`
 * values below can close over the *same* value the owner's id answers with. Two
 * passes rather than one is what makes `lookup.graph(id)?.owner ===
 * lookup.diagram(ownerId)` hold as identity rather than as equality.
 */
export function buildSpaceLookup(input: {
  readonly cards: readonly Card[];
  readonly diagrams: readonly Diagram[];
}): SpaceLookupResult {
  const resolvedDiagrams = new Map<UUID, ResolvedDiagram>();
  for (const diagram of input.diagrams) {
    const activeGraph =
      diagram.graphs.find((graph) => graph.id === diagram.activeGraph) ?? diagram.graphs[0];
    if (activeGraph === undefined) return { ok: false, diagramWithoutGraph: diagram.id };
    resolvedDiagrams.set(diagram.id, { diagram, activeGraph });
  }

  const ownedGraphs = new Map<GraphId, OwnedGraph>();
  for (const owner of resolvedDiagrams.values()) {
    for (const graph of owner.diagram.graphs) {
      ownedGraphs.set(graph.id, { graph, owner });
    }
  }

  const cards = new Map<CardId, Card>(input.cards.map((card) => [card.id, card]));
  return {
    ok: true,
    lookup: {
      card: (id) => cards.get(id),
      diagram: (id) => resolvedDiagrams.get(id),
      graph: (id) => ownedGraphs.get(id),
    },
  };
}

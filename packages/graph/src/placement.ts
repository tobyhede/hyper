import type { CardId, Layout } from '@project/core';
import type { LayoutGraph, LayoutPoint } from './layout';

/**
 * A **Placement** is the card→position map itself: which cards sit where, and
 * nothing more. A `Layout` is the authored thing a Space holds; the placement is
 * the map inside it. It is also what an automatic strategy computes and what
 * `positionedStrategy` reads, and it is the same value in both directions —
 * editing an Algorithmic View copies the computed placement into a new Layout,
 * which is the crossing ADR 0025 describes.
 *
 * Not the placement layer ADR 0004 rejected. That was an entity between a card
 * and its position that edges and routes referenced instead of the card, letting
 * one card occupy two positions. This is keyed by card and holds at most one
 * position for each.
 *
 * ## Sparse, and omission means something
 *
 * A placement may omit a card, and that card is **unplaced** — whoever renders it
 * places it themselves, which `positionedStrategy` does in a band below
 * everything authored. Omission is never the origin, and a position a renderer
 * supplied for an unplaced card is not a placement the author made. Promoting
 * one to authored is an Edit, so it happens through `next` with the cards a
 * completed gesture actually placed, never by adopting whatever is on screen.
 *
 * ## Branded, because ad-hoc construction is the bug this module exists for
 *
 * `Placement` is a `ReadonlyMap` the type system will not let you build with
 * `new Map()`. Every read works unchanged; only construction is closed. The
 * rendered geometry of an existing Layout was twice copied wholesale into the
 * authored map by code that built one by hand, which persisted every card the
 * Layout deliberately omitted. Routing construction through `fromEntries` and
 * merging through `next` is what makes that unrepresentable rather than a rule
 * each new caller has to remember.
 */
declare const PLACEMENT: unique symbol;

export type Placement = ReadonlyMap<CardId, LayoutPoint> & {
  readonly [PLACEMENT]: true;
};

/**
 * The one place a `CardId` key is asserted rather than parsed.
 *
 * Every key reaching a constructor has already been branded: `layoutSchema`
 * declares `positions` as `z.record(idSchema, …)`, so Zod rejects a non-UUID key
 * at parse, and every Space arrives through `loadSpace` or `loadSpaceSnapshot`.
 * A rendered position's key is a React Flow node id, and those are set from
 * `space.cards` by the one function that builds nodes. The brand is lost only to
 * `Object.entries`, which widens keys to `string`, and to React Flow typing
 * `Node.id` as `string` — both erasures in the type system, neither a runtime
 * possibility. Re-parsing here would declare a failure mode nothing can reach
 * and force callers to handle it.
 */
const brand = (positions: ReadonlyMap<CardId, LayoutPoint>): Placement => positions as Placement;

const point = (at: LayoutPoint): LayoutPoint => ({ x: at.x, y: at.y });

/** The placement a Layout holds. */
function fromLayout(layout: Layout): Placement {
  const positions = new Map<CardId, LayoutPoint>();
  for (const [cardId, at] of Object.entries(layout.positions)) {
    if (at !== undefined) positions.set(cardId as CardId, point(at));
  }
  return brand(positions);
}

/**
 * The placement a laid-out graph describes — `positionedStrategy` run backwards,
 * and the ADR 0025 crossing from computed to authored.
 *
 * A card the strategy left unplaced is omitted rather than defaulted, because
 * collapsing that to `(0, 0)` would assert a placement no strategy made.
 */
function fromLayoutGraph(graph: LayoutGraph): Placement {
  const positions = new Map<CardId, LayoutPoint>();
  for (const card of graph.cards) {
    if (card.x === undefined || card.y === undefined) continue;
    positions.set(card.id, { x: card.x, y: card.y });
  }
  return brand(positions);
}

/**
 * The placement a renderer is reporting, from whatever it draws with.
 *
 * Total by nature — a rendered card always has coordinates — which is why this
 * is never installed directly over an authored placement. `next` decides what
 * any of it is allowed to author.
 */
function fromEntries(entries: Iterable<readonly [string, LayoutPoint]>): Placement {
  const positions = new Map<CardId, LayoutPoint>();
  for (const [cardId, at] of entries) positions.set(cardId as CardId, point(at));
  return brand(positions);
}

/** Value equality: the same cards, each at the same coordinates. */
function equals(a: Placement | null, b: Placement | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a.size !== b.size) return false;
  for (const [cardId, at] of a) {
    const other = b.get(cardId);
    if (other === undefined) return false;
    if (other.x !== at.x || other.y !== at.y) return false;
  }
  return true;
}

/**
 * The placement after a renderer reports its geometry, given the cards a
 * completed gesture actually placed.
 *
 * With nothing authored yet the whole rendered map is adopted: an Algorithmic
 * View authors nothing, and conversion copies every card already on screen so
 * that nothing moves at the moment it happens (ADR 0025).
 *
 * With an authored placement, the rendered geometry is a **report, not an
 * authorship claim**, and `placed` is the whole of what may be read out of it —
 * refreshing a card that was dragged and admitting one that was not in the map
 * before. Every other card keeps the coordinate it had, so a card the Layout
 * omits stays unplaced no matter how many times it is drawn in the fallback
 * band, and a card the report caught **in flight** keeps the place the author
 * last left it.
 *
 * That last one is why refreshing every authored card from the report is wrong
 * rather than merely broader. A reprojection can land mid-gesture — an activated
 * Route or a selection redraws the graph without the drag ending — and it
 * reports the live position, which no gesture has settled on. Reading it would
 * author a coordinate the author never chose and re-run the strategy underneath
 * a drag still in progress. A card that really moved arrives in `placed`, so
 * nothing legitimate needs the wider read.
 *
 * Returns `authored` itself when nothing changes, so an unchanged placement
 * keeps its identity and a settled graph is not re-arranged by the projection
 * that reports it.
 */
function next(
  authored: Placement | null,
  rendered: Placement,
  placed: readonly CardId[],
): Placement {
  if (authored === null) return rendered;

  const merged = new Map<CardId, LayoutPoint>(authored);
  for (const cardId of placed) {
    const at = rendered.get(cardId);
    if (at !== undefined) merged.set(cardId, point(at));
  }

  const nextPlacement = brand(merged);
  return equals(authored, nextPlacement) ? authored : nextPlacement;
}

/**
 * The placement with one more card authored at a named point.
 *
 * The atomic create-and-connect Edit places its new Card where the author
 * dropped it, which is authorship rather than a report — no renderer has drawn
 * that Card yet, so it cannot come through `next`.
 */
function place(placement: Placement, cardId: CardId, at: LayoutPoint): Placement {
  const placed = new Map(placement);
  placed.set(cardId, point(at));
  return brand(placed);
}

/** The record a Layout stores. Keys are already card ids; this only widens them. */
function toPositions(placement: Placement): Record<CardId, LayoutPoint> {
  return Object.fromEntries([...placement].map(([cardId, at]) => [cardId, point(at)]));
}

/** Empty: a Layout that authors no card yet. Distinct from having no Layout. */
const empty: Placement = brand(new Map());

export const Placement = {
  empty,
  fromLayout,
  fromLayoutGraph,
  fromEntries,
  equals,
  next,
  place,
  toPositions,
} as const;

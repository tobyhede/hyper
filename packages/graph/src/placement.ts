import {
  COLLAPSED_CARD_SIZE,
  type CardId,
  type CardPlacement,
  type Layout,
  type LayoutPosition,
} from '@project/core';
import type { LayoutStrategyGraph } from './layout';

/** The brand's carrier. See `Placement` below for what the type means. */
declare const PLACEMENT: unique symbol;

/**
 * A **Placement** is the card→position map itself: which cards sit where, and
 * nothing more. A `Layout` is the authored thing a Space holds; the placement is
 * the map inside it. It is also what an automatic strategy computes and what
 * `positionedStrategy` reads, and it is the same value in both directions —
 * editing an Algorithmic View copies the computed placement into a new Layout,
 * which is the crossing ADR 0025 describes.
 *
 * Not the placement layer ADR 0004 rejected. That was an entity between a card
 * and its position that edges and graphs referenced instead of the card, letting
 * one card occupy two positions. This is keyed by card and holds at most one
 * position for each.
 *
 * ## Sparse, and omission means something
 *
 * A placement may omit a card, and that Card is not a member of the Layout.
 * `positionedStrategy` consequently omits it from the canvas; adding membership
 * and its authored position is an explicit Edit rather than a rendering concern.
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
 *
 * ## Every value here is its caller's alone
 *
 * `SpaceAuthoring.install` retains the Placement it is handed rather than
 * copying it, so no member of this module may mutate an argument or hand back a
 * value another caller also holds — `empty` is a function for that reason, and
 * the points are copied on the way in. Reading is closed too: nothing outside
 * this file can construct one, so this invariant only has to hold here.
 *
 * The points go back out `Readonly` for the same reason read the other way:
 * construction being closed says nothing about the values already inside, and
 * `placement.get(id)!.x = 1` would author a position past `next` and `place`
 * both — the only two things allowed to decide what a placement authors.
 */
export type Placement = ReadonlyMap<CardId, Readonly<CardPlacement>> & {
  readonly [PLACEMENT]: true;
};

/**
 * The one place a `CardId` key is asserted rather than parsed.
 *
 * SAFETY: a single erasure reaches this module: `Object.entries` widens the keys of a
 * `Layout`'s `positions` to `string`. They have already been branded —
 * `layoutSchema` declares `positions` as `z.record(idSchema, …)`, so Zod rejects
 * a non-UUID key at parse, and every Space arrives through `loadSpace` or
 * `loadSpaceSnapshot`. Re-parsing here would declare a failure mode nothing can
 * reach and force callers to handle it.
 *
 * React Flow typing `Node.id` as `string` is the other erasure, and it is
 * repaired at the adapter that owns it rather than here. `fromEntries` takes
 * `CardId` keys, because a constructor open to plain strings would re-open the
 * seam the brand exists to hold — pinned by `identity-types.test.ts`.
 */
const brand = (positions: ReadonlyMap<CardId, Readonly<CardPlacement>>): Placement =>
  positions as Placement;

type PlacementPoint = CardPlacement | (LayoutPosition & { readonly open?: never });

const point = (at: PlacementPoint): CardPlacement => {
  if (at.open === undefined) return { x: at.x, y: at.y, open: false };
  if (at.open) {
    return {
      x: at.x,
      y: at.y,
      open: true,
      openSize: { width: at.openSize.width, height: at.openSize.height },
    };
  }
  return at.openSize === undefined
    ? { x: at.x, y: at.y, open: false }
    : {
        x: at.x,
        y: at.y,
        open: false,
        openSize: { width: at.openSize.width, height: at.openSize.height },
      };
};

/** The placement a Layout holds. */
function fromLayout(layout: Layout): Placement {
  const positions = new Map<CardId, CardPlacement>();
  for (const [cardId, at] of Object.entries(layout.positions)) {
    if (at !== undefined) {
      // SAFETY: `Object.entries` widens this key to `string`, but it was
      // already branded — `layoutSchema` declares `positions` as
      // `z.record(idSchema, …)`, so every key reaching here already passed
      // through `loadSpace`/`loadSpaceSnapshot` (see the module docstring
      // above `brand`).
      positions.set(cardId as CardId, point(at));
    }
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
function fromLayoutStrategyGraph(strategyGraph: LayoutStrategyGraph): Placement {
  const positions = new Map<CardId, CardPlacement>();
  for (const card of strategyGraph.cards) {
    if (card.x === undefined || card.y === undefined) continue;
    positions.set(card.id, { x: card.x, y: card.y, open: false });
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
function fromEntries(entries: Iterable<readonly [CardId, PlacementPoint]>): Placement {
  const positions = new Map<CardId, CardPlacement>();
  for (const [cardId, at] of entries) positions.set(cardId, point(at));
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
    if (other.open !== at.open) return false;
    if (other.openSize?.width !== at.openSize?.width) return false;
    if (other.openSize?.height !== at.openSize?.height) return false;
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
 * before. Every other card keeps the coordinate it had, and a card the report
 * caught **in flight** keeps the place the author last left it.
 *
 * That last one is why refreshing every authored card from the report is wrong
 * rather than merely broader. A reprojection can land mid-gesture — an activated
 * Graph or a selection redraws the graph without the drag ending — and it
 * reports the live position, which no gesture has settled on. Reading it would
 * author a coordinate the author never chose and re-run the strategy underneath
 * a drag still in progress. A card that really moved arrives in `placed`, so
 * nothing legitimate needs the wider read.
 *
 * Returns `authored` itself when nothing changes, so an unchanged placement
 * keeps its identity and a settled graph is not re-arranged by the projection
 * that reports it. A report that names no card is the common one — every
 * projection sync makes one — and answers without walking anything.
 */
function next(
  authored: Placement | null,
  rendered: Placement,
  placed: readonly CardId[],
): Placement {
  if (authored === null) return rendered;
  if (placed.length === 0) return authored;

  const merged = new Map<CardId, CardPlacement>(authored);
  for (const cardId of placed) {
    const at = rendered.get(cardId);
    const original = authored.get(cardId);
    if (at !== undefined) {
      const authoredAt = authoredPoint(authored, at, cardId);
      merged.set(
        cardId,
        point({
          ...at,
          ...original,
          x: authoredAt.x,
          y: authoredAt.y,
        }),
      );
    }
  }

  const nextPlacement = brand(merged);
  return equals(authored, nextPlacement) ? authored : nextPlacement;
}

/**
 * Convert one point from drawn canvas coordinates back to Layout authorship.
 *
 * Each Expanded Card creates a step after its authored origin. In drawn space
 * that step ends after the accumulated growth before it, so iterating origins in
 * order identifies exactly the growth already present in a reachable drawn
 * coordinate. `movingCardId` excludes the Card being moved: a Card never
 * displaces itself, even when it is Expanded.
 *
 * Coordinates inside a step's unreachable gap stay on its near side. That is
 * ADR 0064's accepted step boundary; every coordinate produced by `drawn`
 * remains an exact inverse.
 */
function authoredPoint(
  placement: Placement,
  at: LayoutPosition,
  movingCardId?: CardId,
): LayoutPosition {
  const expanded = [...placement]
    .filter(([cardId, point]) => cardId !== movingCardId && point.open)
    .map(([, point]) => point);

  const invert = (coordinate: 'x' | 'y', size: 'width' | 'height', collapsed: number): number => {
    const ordered = [...expanded].sort((left, right) => left[coordinate] - right[coordinate]);
    let growth = 0;
    let authored = at[coordinate];
    for (const point of ordered) {
      if (!point.open) continue;
      const rect = point.openSize;
      // Floored for the same reason `drawn` floors it: a rect smaller than the
      // collapsed constant would otherwise displace backwards, and an inverse
      // of a backwards step is not one.
      const step = Math.max(0, rect[size] - collapsed);
      const drawnOrigin = point[coordinate] + growth;
      growth += step;
      if (at[coordinate] > point[coordinate] + growth) {
        authored -= step;
      } else if (at[coordinate] > drawnOrigin) {
        // Inside the step's unreachable gap, which is the Expanded Card's own
        // drawn box. Authoring the near side is what makes the drop settle where
        // it was released instead of jumping the full growth one frame later.
        authored = point[coordinate];
      }
    }
    return authored;
  };

  return {
    x: invert('x', 'width', COLLAPSED_CARD_SIZE.width),
    y: invert('y', 'height', COLLAPSED_CARD_SIZE.height),
  };
}

/**
 * The placement with one more card authored at a named point.
 *
 * The atomic create-and-connect Edit places its new Card where the author
 * dropped it, which is authorship rather than a report — no renderer has drawn
 * that Card yet, so it cannot come through `next`.
 */
function place(placement: Placement, cardId: CardId, at: PlacementPoint): Placement {
  const placed = new Map(placement);
  placed.set(cardId, point(at));
  return brand(placed);
}

/**
 * The placement without one card.
 *
 * A layout's position keys **are** its card membership (ADR 0040), so removing a
 * card from a layout is exactly this — and, like `place`, it is authorship
 * rather than a report, which is why it belongs here beside the closed
 * constructors rather than being done with a `new Map` at the call site.
 *
 * Answers the placement it was given when the card was not in it, so an
 * unchanged placement keeps its identity and the positioned strategy is not
 * rebuilt for an edit that moved nothing.
 */
function remove(placement: Placement, cardId: CardId): Placement {
  if (!placement.has(cardId)) return placement;
  const remaining = new Map(placement);
  remaining.delete(cardId);
  return brand(remaining);
}

/** The record a Layout stores. Keys are already card ids; this only widens them. */
function toPositions(placement: Placement): Record<CardId, CardPlacement> {
  return Object.fromEntries([...placement].map(([cardId, at]) => [cardId, point(at)]));
}

/**
 * Empty: a Layout that authors no card yet. Distinct from having no Layout.
 *
 * A function rather than a constant so no two callers are handed the same map.
 */
const empty = (): Placement => brand(new Map());

/** The derived rects drawn on the canvas, including displacement from Expanded Cards. */
function drawn(placement: Placement): Placement {
  const result = new Map<CardId, CardPlacement>();
  for (const [cardId, at] of placement) {
    let x = at.x;
    let y = at.y;
    for (const [otherId, other] of placement) {
      if (otherId === cardId || !other.open) continue;
      // Floored: an Expanded rect smaller than the collapsed constant is not a
      // shrink of its neighbours. Nothing authors one today — the resizer's
      // minimum is the collapsed size — but a stored Space is bytes, and a
      // negative step would displace neighbours backwards over the Card that
      // caused it and leave `authoredPoint` with no inverse to compute.
      if (at.x > other.x) x += Math.max(0, other.openSize.width - COLLAPSED_CARD_SIZE.width);
      if (at.y > other.y) y += Math.max(0, other.openSize.height - COLLAPSED_CARD_SIZE.height);
    }
    result.set(cardId, point({ ...at, x, y }));
  }
  return brand(result);
}

export const Placement = {
  empty,
  fromLayout,
  fromLayoutStrategyGraph,
  fromEntries,
  equals,
  drawn,
  authoredPoint,
  next,
  place,
  remove,
  toPositions,
} as const;

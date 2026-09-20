import {
  COLLAPSED_RESOURCE_SIZE,
  type ResourceId,
  type ResourcePlacement,
  type Map,
  type MapPosition,
} from '@project/core';
import type { LayoutStrategyGraph } from './layout';

/** The brand's carrier. See `Placement` below for what the type means. */
declare const PLACEMENT: unique symbol;

/**
 * A **Placement** is the resource→position map itself: which resources sit where, and
 * nothing more. A `Map` is the authored entity a Space holds; the placement is
 * the map inside it. It is also what an automatic strategy computes and what
 * `positionedStrategy` reads.
 *
 * Not the placement layer ADR 0004 rejected. That was an entity between a resource
 * and its position that edges and graphs referenced instead of the resource, letting
 * one resource occupy two positions. This is keyed by resource and holds at most one
 * position for each.
 *
 * ## Sparse, and omission means something
 *
 * A placement may omit a resource, and that Resource is not a member of the Map.
 * `positionedStrategy` consequently omits it from the canvas; adding membership
 * and its authored position is an explicit Edit rather than a rendering concern.
 *
 * ## Branded, because ad-hoc construction is the bug this module exists for
 *
 * `Placement` is a `ReadonlyMap` the type system will not let you build with
 * `new Map()`. Every read works unchanged; only construction is closed. The
 * rendered geometry of an existing Map was twice copied wholesale into the
 * authored map by code that built one by hand, which persisted every resource the
 * Map deliberately omitted. Routing construction through `fromEntries` and
 * merging through `next` is what makes that unrepresentable rather than a rule
 * each new caller has to remember.
 *
 * ## Every value here is its caller's alone
 *
 * A caller keeps whatever `Placement` it derives rather than being handed a
 * copy, so no member of this module may mutate an argument or hand back a
 * value another caller also holds — `empty` is a function for that reason, and
 * the points are copied on the way in. Reading is closed too: nothing outside
 * this file can construct one, so this invariant only has to hold here.
 *
 * The points go back out `Readonly` for the same reason read the other way:
 * construction being closed says nothing about the values already inside, and
 * `placement.get(id)!.x = 1` would author a position past `next` and `place`
 * both — the only two operations allowed to decide what a placement authors.
 */
export type Placement = ReadonlyMap<ResourceId, Readonly<ResourcePlacement>> & {
  readonly [PLACEMENT]: true;
};

/**
 * The one place a `ResourceId` key is asserted rather than parsed.
 *
 * SAFETY: a single erasure reaches this module: `Object.entries` widens the keys of a
 * `Map`'s `positions` to `string`. They have already been branded —
 * `mapSchema` declares `positions` as `z.record(idSchema, …)`, so Zod rejects
 * a non-UUID key at parse, and every Space arrives through `loadSpace` or
 * `loadSpaceSnapshot`. Re-parsing here would declare a failure mode nothing can
 * reach and force callers to handle it.
 *
 * React Flow typing `Node.id` as `string` is the other erasure, and it is
 * repaired at the adapter that owns it rather than here. `fromEntries` takes
 * `ResourceId` keys, because a constructor open to plain strings would re-open the
 * seam the brand exists to hold — pinned by `identity-types.test.ts`.
 */
const brand = (positions: ReadonlyMap<ResourceId, Readonly<ResourcePlacement>>): Placement =>
  positions as Placement;

type PlacementPoint = ResourcePlacement | (MapPosition & { readonly open?: never });

const point = (at: PlacementPoint): ResourcePlacement => {
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

/** The placement a Map holds. */
function fromMap(map: Map): Placement {
  const positions = new Map<ResourceId, ResourcePlacement>();
  for (const [resourceId, at] of Object.entries(map.positions)) {
    if (at !== undefined) {
      // SAFETY: `Object.entries` widens this key to `string`, but it was
      // already branded — `mapSchema` declares `positions` as
      // `z.record(idSchema, …)`, so every key reaching here already passed
      // through `loadSpace`/`loadSpaceSnapshot` (see the module docstring
      // above `brand`).
      positions.set(resourceId as ResourceId, point(at));
    }
  }
  return brand(positions);
}

/**
 * The placement a laid-out strategy graph describes — `positionedStrategy`
 * run backwards.
 *
 * A resource the strategy left unplaced is omitted rather than defaulted, because
 * collapsing that to `(0, 0)` would assert a placement no strategy made.
 */
function fromLayoutStrategyGraph(strategyGraph: LayoutStrategyGraph): Placement {
  const positions = new Map<ResourceId, ResourcePlacement>();
  for (const resource of strategyGraph.resources) {
    if (resource.x === undefined || resource.y === undefined) continue;
    positions.set(resource.id, { x: resource.x, y: resource.y, open: false });
  }
  return brand(positions);
}

/**
 * The placement a renderer is reporting, from whatever it draws with.
 *
 * Total by nature — a rendered resource always has coordinates — which is why this
 * is never installed directly over an authored placement. `next` decides what
 * any of it is allowed to author.
 */
function fromEntries(entries: Iterable<readonly [ResourceId, PlacementPoint]>): Placement {
  const positions = new Map<ResourceId, ResourcePlacement>();
  for (const [resourceId, at] of entries) positions.set(resourceId, point(at));
  return brand(positions);
}

/** Value equality: the same resources, each at the same coordinates. */
function equals(a: Placement | null, b: Placement | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a.size !== b.size) return false;
  for (const [resourceId, at] of a) {
    const other = b.get(resourceId);
    if (other === undefined) return false;
    if (other.x !== at.x || other.y !== at.y) return false;
    if (other.open !== at.open) return false;
    if (other.openSize?.width !== at.openSize?.width) return false;
    if (other.openSize?.height !== at.openSize?.height) return false;
  }
  return true;
}

/**
 * The placement after a renderer reports its geometry, given the resources a
 * completed gesture actually placed.
 *
 * With nothing authored yet the whole rendered map is adopted: an automatic
 * strategy authors nothing, and conversion copies every resource already on screen
 * so that nothing moves at the moment it happens (ADR 0025).
 *
 * With an authored placement, the rendered geometry is a **report, not an
 * authorship claim**, and `placed` is the whole of what may be read out of it —
 * refreshing a resource that was dragged and admitting one that was not in the map
 * before. Every other resource keeps the coordinate it had, and a resource the report
 * caught **in flight** keeps the place the author last left it.
 *
 * That last one is why refreshing every authored resource from the report is wrong
 * rather than merely broader. A reprojection can land mid-gesture — an activated
 * Graph or a selection redraws the graph without the drag ending — and it
 * reports the live position, which no gesture has settled on. Reading it would
 * author a coordinate the author never chose and re-run the strategy underneath
 * a drag still in progress. A resource that really moved arrives in `placed`, so
 * nothing legitimate needs the wider read.
 *
 * What the report says is taken **as it stands**. Nothing sits between the
 * Map's positions and the canvas any more — displacement is applied by the
 * Edit that causes it (ADR 0084), so a canvas coordinate already is an authored
 * one and there is no derivation left to invert. A settled drag therefore
 * authors the drop point exactly, whatever is Open and wherever it sits. The
 * conversion this used to run could not be total, and the band it could not
 * cover was the room the derivation itself invented.
 *
 * The resource's own Open/Closed state and Open Size survive the merge: a renderer
 * reports React Flow node positions and nothing else, so only `x` and `y` are
 * read out of it.
 *
 * Returns `authored` itself when nothing changes, so an unchanged placement
 * keeps its identity and a settled graph is not re-arranged by the projection
 * that reports it. A report that names no resource is the common one — every
 * projection sync makes one — and answers without walking anything.
 */
function next(
  authored: Placement | null,
  rendered: Placement,
  placed: readonly ResourceId[],
): Placement {
  if (authored === null) return rendered;
  if (placed.length === 0) return authored;

  const merged = new Map<ResourceId, ResourcePlacement>(authored);
  for (const resourceId of placed) {
    const at = rendered.get(resourceId);
    const original = authored.get(resourceId);
    if (at !== undefined) {
      merged.set(
        resourceId,
        point({
          ...at,
          ...original,
          x: at.x,
          y: at.y,
        }),
      );
    }
  }

  const nextPlacement = brand(merged);
  return equals(authored, nextPlacement) ? authored : nextPlacement;
}

/**
 * The placement with one more resource authored at a named point.
 *
 * The atomic create-and-connect Edit places its new Resource where the author
 * dropped it, which is authorship rather than a report — no renderer has drawn
 * that Resource yet, so it cannot come through `next`.
 */
function place(placement: Placement, resourceId: ResourceId, at: PlacementPoint): Placement {
  const placed = new Map(placement);
  placed.set(resourceId, point(at));
  return brand(placed);
}

/**
 * The placement without one resource.
 *
 * A map's position keys **are** its resource membership (ADR 0040), so removing a
 * resource from a map is exactly this — and, like `place`, it is authorship
 * rather than a report, which is why it belongs here beside the closed
 * constructors rather than being done with a `new Map` at the call site.
 *
 * Answers the placement it was given when the resource was not in it, so an
 * unchanged placement keeps its identity and the positioned strategy is not
 * rebuilt for an edit that moved nothing.
 */
function remove(placement: Placement, resourceId: ResourceId): Placement {
  if (!placement.has(resourceId)) return placement;
  const remaining = new Map(placement);
  remaining.delete(resourceId);
  return brand(remaining);
}

/** The record a Map stores. Keys are already resource ids; this only widens them. */
function toPositions(placement: Placement): Record<ResourceId, ResourcePlacement> {
  return Object.fromEntries([...placement].map(([resourceId, at]) => [resourceId, point(at)]));
}

/**
 * Empty: a Map that authors no resource yet. Distinct from having no Map.
 *
 * A function rather than a constant so no two callers are handed the same map.
 */
const empty = (): Placement => brand(new Map());

/**
 * A width and a height together: the shape an Open Size, the collapsed constant
 * and a growth all share. Local, because none of the three is a domain entity —
 * they are the two numbers displacement is arithmetic over.
 */
type Extent = { readonly width: number; readonly height: number };

/**
 * The growth an Open Resource displaces its neighbours by: its Open rect less the
 * collapsed one, floored at zero on each axis independently.
 *
 * The conversion sits beside `displace` because the floor is part of the rule
 * rather than a caller's precaution, and a rule with two owners has none. Open
 * passes this, Close passes its negation and Resize passes the difference
 * between two of them, so every growth that reaches `displace` in production has
 * come through here.
 *
 * The floor is not defensive arithmetic. Nothing authors a rect below
 * `COLLAPSED_RESOURCE_SIZE` — the resizer's minimum is exactly that, and
 * `resourcePlacementSchema` refuses a smaller one — but a stored Space is bytes, and
 * a negative growth would pull neighbours backwards over the Resource that caused
 * it, past the subject, where the negating Close can no longer find them. So the
 * floor is also what makes the Open/Close round trip below hold. A rect smaller
 * than a collapsed Resource displaces nobody, which is the honest reading of it: it
 * is not a shrink of its neighbours.
 */
function growth(openSize: Extent): Extent {
  return {
    width: Math.max(0, openSize.width - COLLAPSED_RESOURCE_SIZE.width),
    height: Math.max(0, openSize.height - COLLAPSED_RESOURCE_SIZE.height),
  };
}

/**
 * The axis a Resource makes room on when a subject grows, or `null` for none.
 *
 * A Resource is **clear** of the subject on an axis when it starts at or past the
 * far edge of the subject's *collapsed* rect on that axis — past where the
 * subject ends before it grows (ADR 0093). A Resource clear on `x` takes the width
 * growth and nothing else; failing that, a Resource clear on `y` takes the height
 * growth; a Resource clear on neither already overlaps the collapsed subject and
 * moves on neither.
 *
 * **One axis, and `x` first**, because the half-plane rule ADR 0084 stated —
 * any Resource strictly past the subject's origin on an axis takes that axis's
 * growth — moved a Resource beside the subject by the whole height growth for
 * being one unit lower than it. Read memorylessly at Close, a Resource the author
 * nudged below the Open subject's top while it stood beside it was pulled up by
 * the full height the Open never pushed it down by. A Resource clear on `x` is
 * clear of the grown rect after taking the width alone, so it has no need of
 * the height, and a Resource clear on both is the same case.
 *
 * **The collapsed rect and not the Open one**, because the membership has to
 * be the same at every Edit in a sequence for Open and Close to be a pair. The
 * collapsed size is a constant, and a nonnegative growth only carries a clear
 * Resource further clear on the axis it moved on while leaving the other axis
 * untouched, so what Open selects Close selects again. A shrinking Resize moves
 * a Resource back by no more than the growth still held, which leaves it at least
 * at the collapsed edge, so it too stays in the set.
 */
function roomAxis(at: MapPosition, subject: MapPosition): 'x' | 'y' | null {
  if (at.x >= subject.x + COLLAPSED_RESOURCE_SIZE.width) return 'x';
  if (at.y >= subject.y + COLLAPSED_RESOURCE_SIZE.height) return 'y';
  return null;
}

/**
 * The placement with every Resource clear of a subject moved by a growth.
 *
 * This is the whole of displacement (ADR 0084, ADR 0093). Opening a Resource
 * applies its growth here as part of the Open Edit, and the coordinates it
 * writes are authored ones with the same standing as any other — the author
 * opened the Resource, and opening is a Map decision. Closing applies the
 * negation, and resizing the difference. Between those Edits nothing derives
 * anything: the Map's positions are what the canvas draws.
 *
 * Which Resources move, and on which one axis, is {@link roomAxis}. The subject is
 * never clear of itself, so it never moves.
 *
 * A negative growth is how Close is expressed and nothing here special-cases it,
 * because the round trip is what makes Open and Close a pair:
 * `displace(displace(p, c, g), c, negate(g))` is `p` for every **nonnegative**
 * `g`. The bound is load-bearing rather than a convenience. Applying a negative
 * growth *first* can carry a Resource back inside the subject's collapsed extent,
 * and the negation then skips it as no longer clear — subject at `x = 0`,
 * neighbour at `x = 260`, `growth.width = -2`. `growth` above floors Open's at
 * zero, so no Open reaches it — but Close and a shrinking Resize both apply a
 * negative growth, and the Resources they reach are whichever ones are clear of
 * the subject *now*, not the ones the Open pushed. A Resource the author dropped
 * inside an Open Resource's rect, past its collapsed edge, is clear of it and was
 * never displaced by it, so closing carries that Resource back over the subject
 * and the reopen leaves it there. The asymmetry is therefore stated rather than
 * repaired — clamping it, or remembering which Resources a particular Open pushed,
 * is the per-Resource history ADR 0084 rejected for making two identical Maps
 * behave differently.
 *
 * The same memorylessness read from the subject's side: a subject the author
 * has dragged past the neighbours its own Open displaced finds nobody clear of
 * it and gives nothing back, so that room stays where it is and a further
 * Open/drag/Close cycle adds more. ADR 0084 states this face for a moved
 * *neighbour*; it is one rule, and the subject is not exempt from it, because
 * this compares against wherever the subject now sits rather than wherever it
 * was when it Opened.
 *
 * Open/Closed state and the remembered Open Size ride through untouched; only
 * `x` and `y` move (ADR 0066). Answers the placement it was given whenever no
 * Resource actually moves — a subject the map does not hold, a growth that is zero
 * on both axes, and the case neither of those catches: a nonzero growth with
 * nothing clear of the subject, which `reclaim` reaches for a subject the
 * author dragged past its own displaced neighbours. Like `remove`, so an Edit
 * that moves nothing keeps the placement's identity and a settled graph is not
 * laid out again.
 */
function displace(placement: Placement, subjectId: ResourceId, growth: Extent): Placement {
  const subject = placement.get(subjectId);
  if (subject === undefined) return placement;
  if (growth.width === 0 && growth.height === 0) return placement;

  const displaced = new Map<ResourceId, ResourcePlacement>();
  let moved = false;
  for (const [resourceId, at] of placement) {
    const axis = roomAxis(at, subject);
    const x = axis === 'x' ? at.x + growth.width : at.x;
    const y = axis === 'y' ? at.y + growth.height : at.y;
    if (x !== at.x || y !== at.y) moved = true;
    displaced.set(resourceId, point({ ...at, x, y }));
  }
  return moved ? brand(displaced) : placement;
}

/**
 * The placement with the room an Open Resource holds given back to every Resource
 * beyond it, the Resource's own entry left exactly as it was.
 *
 * The displacement half of every way an Open Resource stops holding its room, and
 * the one statement of it (ADR 0084). A Resource closes, leaves a Map, or is
 * deleted from the Space, and all three owe the same negation of the growth of
 * the size it is Open at — the size read off its own entry, not off whatever
 * rect the gesture is proposing. That is why this is a member here beside
 * `growth` and `displace` rather than a line each caller writes: the third
 * caller is how a Resource deleted from a Map the Edit was not drawing came to
 * strand its room permanently, and a rule with three owners has none.
 *
 * Answers the placement it was given for a Resource that is Closed or not a member,
 * neither of which holds any room. A Closed Resource's remembered Open Size is not
 * room it holds — nothing was displaced for it — so it is deliberately not read
 * here (ADR 0066).
 *
 * Separate from `remove` rather than folded into it, because removing a key is
 * also how a placement is reconciled against a Map that has already
 * reclaimed, and reclaiming there would give the room back twice.
 */
function reclaim(placement: Placement, resourceId: ResourceId): Placement {
  const at = placement.get(resourceId);
  if (at?.open !== true) return placement;
  const held = growth(at.openSize);
  return displace(placement, resourceId, { width: -held.width, height: -held.height });
}

export const Placement = {
  empty,
  fromMap,
  fromLayoutStrategyGraph,
  fromEntries,
  equals,
  growth,
  displace,
  reclaim,
  next,
  place,
  remove,
  toPositions,
} as const;

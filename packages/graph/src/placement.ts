import { type ResourceId, type ResourcePlacement, type Map, type MapPosition } from '@project/core';
import type { LayoutStrategyGraph } from './layout';

/** The brand's carrier. See `Placement` below for what the type means. */
declare const PLACEMENT: unique symbol;

/**
 * A **Placement** is the resource→position map itself: which resources sit where, and
 * nothing more. A `Map` is the authored entity a Space holds; the placement is
 * the map inside it. It is also what an automatic strategy computes and what
 * `positionedStrategy` reads.
 *
 * It is keyed by resource and holds at most one position for each. Do not make a
 * placement entry something edges and graphs reference instead of the resource:
 * that would let one resource occupy two positions (ADR 0004).
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
 * `new Map()`. Every read works unchanged; only construction is closed. Code that
 * builds one by hand can copy the rendered geometry of an existing Map wholesale
 * into the authored map, persisting every resource the Map deliberately omits.
 * Routing construction through `fromEntries` and merging through `next` is what
 * makes that unrepresentable rather than a rule each new caller has to remember.
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

/**
 * A copy of an entry, keeping exactly the optional fields it stores: an absent
 * `open`, `size` or `shape` stays absent, so the application's default is read
 * for it (`resourceOpen`, `resourceSize`, `resourceShape`) rather than written.
 */
const point = (at: ResourcePlacement): ResourcePlacement => {
  let entry: ResourcePlacement = { x: at.x, y: at.y };
  if (at.open !== undefined) entry = { ...entry, open: at.open };
  if (at.size !== undefined)
    entry = { ...entry, size: { width: at.size.width, height: at.size.height } };
  if (at.shape !== undefined) entry = { ...entry, shape: at.shape };
  return entry;
};

/** The placement a Map holds. */
function fromMap(m: Map): Placement {
  const positions = new Map<ResourceId, ResourcePlacement>();
  for (const [resourceId, at] of Object.entries(m.positions)) {
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
 * any of it is allowed to author. A bare point joins Closed, at the Closed Size,
 * with no Shape stored.
 */
function fromEntries(entries: Iterable<readonly [ResourceId, ResourcePlacement]>): Placement {
  const positions = new Map<ResourceId, ResourcePlacement>();
  for (const [resourceId, at] of entries)
    positions.set(resourceId, at.open === undefined ? point({ ...at, open: false }) : point(at));
  return brand(positions);
}

/** Value equality: the same resources, each with the same coordinates and the same stored state, size and Shape. */
function equals(a: Placement | null, b: Placement | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a.size !== b.size) return false;
  for (const [resourceId, at] of a) {
    const other = b.get(resourceId);
    if (other === undefined) return false;
    if (other.x !== at.x || other.y !== at.y) return false;
    if (other.open !== at.open) return false;
    if (other.size?.width !== at.size?.width) return false;
    if (other.size?.height !== at.size?.height) return false;
    if (other.shape !== at.shape) return false;
  }
  return true;
}

/**
 * The placement after a renderer reports its geometry, given the resources a
 * completed gesture actually placed.
 *
 * With nothing authored yet the whole rendered map is adopted: an automatic
 * strategy authors nothing, and adopting it copies every resource already on screen
 * so that nothing moves at the moment it happens.
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
 * Map's positions and the canvas — displacement is applied by the Edit that
 * causes it (ADR 0084), so a canvas coordinate already is an authored one and
 * there is no derivation to invert. A settled drag therefore authors the drop
 * point exactly, whatever is Open and wherever it sits.
 *
 * The resource's own Open/Closed state, size and Shape survive the merge: a
 * renderer reports React Flow node positions and nothing else, so only `x` and
 * `y` are read out of it.
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
        original === undefined ? at : point({ ...original, x: at.x, y: at.y }),
      );
    }
  }

  const nextPlacement = brand(merged);
  return equals(authored, nextPlacement) ? authored : nextPlacement;
}

/**
 * The placement with one more resource authored at a named point.
 *
 * Add Resource and Add to Map place a Resource where the author aimed it, which
 * is authorship rather than a report — no renderer has drawn that Resource yet,
 * so it cannot come through `next`. The entry is written as given: a Resource
 * joining a Map is given `open: false` and nothing else by its caller.
 */
function place(placement: Placement, resourceId: ResourceId, at: ResourcePlacement): Placement {
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

/** A width and a height together: a Resource's size before and after a Resize. */
type Extent = { readonly width: number; readonly height: number };

/**
 * The axis a Resource makes room on when a subject is resized, or `null` for
 * none.
 *
 * A Resource is **clear** of the subject on an axis when it starts at or past
 * the far edge of the subject's rect *before* the Resize on that axis. A
 * Resource clear on `x` takes the width change and nothing else; failing that,
 * a Resource clear on `y` takes the height change; a Resource clear on neither
 * overlaps the subject and moves on neither (ADR 0093).
 *
 * **One axis, and `x` first.** A Resource clear on `x` is clear of the resized
 * rect after taking the width alone, and a Resource clear on both is the same
 * case. Do not also move it on `y`: a Resource beside the subject and one unit
 * lower would take the whole height change.
 *
 * **The rect before the Resize**, so a grow followed by the shrink back selects
 * the same Resources: a grow carries every clear Resource clear of the grown
 * rect, which is the rect the shrink measures from.
 */
function roomAxis(at: MapPosition, subject: MapPosition, before: Extent): 'x' | 'y' | null {
  if (at.x >= subject.x + before.width) return 'x';
  if (at.y >= subject.y + before.height) return 'y';
  return null;
}

/**
 * The placement with every Resource clear of a subject moved by the change in
 * its size from `before` to `after`.
 *
 * This is the whole of displacement (ADR 0084, ADR 0093). Resizing a Resource
 * applies it as part of the Resize Edit, and the coordinates it writes are
 * authored ones with the same standing as any other. Between Edits nothing
 * derives anything: the Map's positions are what the canvas draws. Open, Close,
 * a Shape and removal change no size, so they displace nobody.
 *
 * Which Resources move, and on which one axis, is {@link roomAxis}. The subject is
 * never clear of itself, so it never moves, and its own entry is not written
 * here: the caller writes its new size.
 *
 * A shrink is a negative change and nothing here special-cases it. A grow then
 * the shrink back restores every position, because the grow carries each clear
 * Resource clear of the grown rect. The other order is not an involution: a
 * Resource overlapping the larger rect but clear of the smaller one is not moved
 * by the shrink and is pushed by the grow back. That asymmetry is stated rather
 * than repaired — remembering which Resources a Resize pushed is the
 * per-Resource history ADR 0084 rejected for making two identical Maps behave
 * differently.
 *
 * Answers the placement it was given whenever no Resource actually moves — a
 * subject the map does not hold, a change of zero on both axes, or nothing
 * clear of the subject — so an Edit that moves nothing keeps the placement's
 * identity and a settled graph is not laid out again.
 */
function displace(
  placement: Placement,
  subjectId: ResourceId,
  before: Extent,
  after: Extent,
): Placement {
  const subject = placement.get(subjectId);
  if (subject === undefined) return placement;
  const room = { width: after.width - before.width, height: after.height - before.height };
  if (room.width === 0 && room.height === 0) return placement;

  const displaced = new Map<ResourceId, ResourcePlacement>();
  let moved = false;
  for (const [resourceId, at] of placement) {
    const axis = roomAxis(at, subject, before);
    const x = axis === 'x' ? at.x + room.width : at.x;
    const y = axis === 'y' ? at.y + room.height : at.y;
    if (x !== at.x || y !== at.y) moved = true;
    displaced.set(resourceId, point({ ...at, x, y }));
  }
  return moved ? brand(displaced) : placement;
}

export const Placement = {
  empty,
  fromMap,
  fromLayoutStrategyGraph,
  fromEntries,
  equals,
  displace,
  next,
  place,
  remove,
  toPositions,
} as const;

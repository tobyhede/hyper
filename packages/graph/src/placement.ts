import {
  COLLAPSED_THING_SIZE,
  type ThingId,
  type ThingPlacement,
  type Diagram,
  type DiagramPosition,
} from '@project/core';
import type { LayoutStrategyGraph } from './layout';

/** The brand's carrier. See `Placement` below for what the type means. */
declare const PLACEMENT: unique symbol;

/**
 * A **Placement** is the thing→position map itself: which things sit where, and
 * nothing more. A `Diagram` is the authored entity a Space holds; the placement is
 * the map inside it. It is also what an automatic strategy computes and what
 * `positionedStrategy` reads.
 *
 * Not the placement layer ADR 0004 rejected. That was an entity between a thing
 * and its position that edges and graphs referenced instead of the thing, letting
 * one thing occupy two positions. This is keyed by thing and holds at most one
 * position for each.
 *
 * ## Sparse, and omission means something
 *
 * A placement may omit a thing, and that Thing is not a member of the Diagram.
 * `positionedStrategy` consequently omits it from the canvas; adding membership
 * and its authored position is an explicit Edit rather than a rendering concern.
 *
 * ## Branded, because ad-hoc construction is the bug this module exists for
 *
 * `Placement` is a `ReadonlyMap` the type system will not let you build with
 * `new Map()`. Every read works unchanged; only construction is closed. The
 * rendered geometry of an existing Diagram was twice copied wholesale into the
 * authored map by code that built one by hand, which persisted every thing the
 * Diagram deliberately omitted. Routing construction through `fromEntries` and
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
export type Placement = ReadonlyMap<ThingId, Readonly<ThingPlacement>> & {
  readonly [PLACEMENT]: true;
};

/**
 * The one place a `ThingId` key is asserted rather than parsed.
 *
 * SAFETY: a single erasure reaches this module: `Object.entries` widens the keys of a
 * `Diagram`'s `positions` to `string`. They have already been branded —
 * `diagramSchema` declares `positions` as `z.record(idSchema, …)`, so Zod rejects
 * a non-UUID key at parse, and every Space arrives through `loadSpace` or
 * `loadSpaceSnapshot`. Re-parsing here would declare a failure mode nothing can
 * reach and force callers to handle it.
 *
 * React Flow typing `Node.id` as `string` is the other erasure, and it is
 * repaired at the adapter that owns it rather than here. `fromEntries` takes
 * `ThingId` keys, because a constructor open to plain strings would re-open the
 * seam the brand exists to hold — pinned by `identity-types.test.ts`.
 */
const brand = (positions: ReadonlyMap<ThingId, Readonly<ThingPlacement>>): Placement =>
  positions as Placement;

type PlacementPoint = ThingPlacement | (DiagramPosition & { readonly open?: never });

const point = (at: PlacementPoint): ThingPlacement => {
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

/** The placement a Diagram holds. */
function fromDiagram(diagram: Diagram): Placement {
  const positions = new Map<ThingId, ThingPlacement>();
  for (const [thingId, at] of Object.entries(diagram.positions)) {
    if (at !== undefined) {
      // SAFETY: `Object.entries` widens this key to `string`, but it was
      // already branded — `diagramSchema` declares `positions` as
      // `z.record(idSchema, …)`, so every key reaching here already passed
      // through `loadSpace`/`loadSpaceSnapshot` (see the module docstring
      // above `brand`).
      positions.set(thingId as ThingId, point(at));
    }
  }
  return brand(positions);
}

/**
 * The placement a laid-out strategy graph describes — `positionedStrategy`
 * run backwards.
 *
 * A thing the strategy left unplaced is omitted rather than defaulted, because
 * collapsing that to `(0, 0)` would assert a placement no strategy made.
 */
function fromLayoutStrategyGraph(strategyGraph: LayoutStrategyGraph): Placement {
  const positions = new Map<ThingId, ThingPlacement>();
  for (const thing of strategyGraph.things) {
    if (thing.x === undefined || thing.y === undefined) continue;
    positions.set(thing.id, { x: thing.x, y: thing.y, open: false });
  }
  return brand(positions);
}

/**
 * The placement a renderer is reporting, from whatever it draws with.
 *
 * Total by nature — a rendered thing always has coordinates — which is why this
 * is never installed directly over an authored placement. `next` decides what
 * any of it is allowed to author.
 */
function fromEntries(entries: Iterable<readonly [ThingId, PlacementPoint]>): Placement {
  const positions = new Map<ThingId, ThingPlacement>();
  for (const [thingId, at] of entries) positions.set(thingId, point(at));
  return brand(positions);
}

/** Value equality: the same things, each at the same coordinates. */
function equals(a: Placement | null, b: Placement | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a.size !== b.size) return false;
  for (const [thingId, at] of a) {
    const other = b.get(thingId);
    if (other === undefined) return false;
    if (other.x !== at.x || other.y !== at.y) return false;
    if (other.open !== at.open) return false;
    if (other.openSize?.width !== at.openSize?.width) return false;
    if (other.openSize?.height !== at.openSize?.height) return false;
  }
  return true;
}

/**
 * The placement after a renderer reports its geometry, given the things a
 * completed gesture actually placed.
 *
 * With nothing authored yet the whole rendered map is adopted: an Algorithmic
 * View authors nothing, and conversion copies every thing already on screen so
 * that nothing moves at the moment it happens (ADR 0025).
 *
 * With an authored placement, the rendered geometry is a **report, not an
 * authorship claim**, and `placed` is the whole of what may be read out of it —
 * refreshing a thing that was dragged and admitting one that was not in the map
 * before. Every other thing keeps the coordinate it had, and a thing the report
 * caught **in flight** keeps the place the author last left it.
 *
 * That last one is why refreshing every authored thing from the report is wrong
 * rather than merely broader. A reprojection can land mid-gesture — an activated
 * Graph or a selection redraws the graph without the drag ending — and it
 * reports the live position, which no gesture has settled on. Reading it would
 * author a coordinate the author never chose and re-run the strategy underneath
 * a drag still in progress. A thing that really moved arrives in `placed`, so
 * nothing legitimate needs the wider read.
 *
 * What the report says is taken **as it stands**. Nothing sits between the
 * Diagram's positions and the canvas any more — displacement is applied by the
 * Edit that causes it (ADR 0084), so a canvas coordinate already is an authored
 * one and there is no derivation left to invert. A settled drag therefore
 * authors the drop point exactly, whatever is Open and wherever it sits. The
 * conversion this used to run could not be total, and the band it could not
 * cover was the room the derivation itself invented.
 *
 * The thing's own Open/Closed state and Open Size survive the merge: a renderer
 * reports React Flow node positions and nothing else, so only `x` and `y` are
 * read out of it.
 *
 * Returns `authored` itself when nothing changes, so an unchanged placement
 * keeps its identity and a settled graph is not re-arranged by the projection
 * that reports it. A report that names no thing is the common one — every
 * projection sync makes one — and answers without walking anything.
 */
function next(
  authored: Placement | null,
  rendered: Placement,
  placed: readonly ThingId[],
): Placement {
  if (authored === null) return rendered;
  if (placed.length === 0) return authored;

  const merged = new Map<ThingId, ThingPlacement>(authored);
  for (const thingId of placed) {
    const at = rendered.get(thingId);
    const original = authored.get(thingId);
    if (at !== undefined) {
      merged.set(
        thingId,
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
 * The placement with one more thing authored at a named point.
 *
 * The atomic create-and-connect Edit places its new Thing where the author
 * dropped it, which is authorship rather than a report — no renderer has drawn
 * that Thing yet, so it cannot come through `next`.
 */
function place(placement: Placement, thingId: ThingId, at: PlacementPoint): Placement {
  const placed = new Map(placement);
  placed.set(thingId, point(at));
  return brand(placed);
}

/**
 * The placement without one thing.
 *
 * A diagram's position keys **are** its thing membership (ADR 0040), so removing a
 * thing from a diagram is exactly this — and, like `place`, it is authorship
 * rather than a report, which is why it belongs here beside the closed
 * constructors rather than being done with a `new Map` at the call site.
 *
 * Answers the placement it was given when the thing was not in it, so an
 * unchanged placement keeps its identity and the positioned strategy is not
 * rebuilt for an edit that moved nothing.
 */
function remove(placement: Placement, thingId: ThingId): Placement {
  if (!placement.has(thingId)) return placement;
  const remaining = new Map(placement);
  remaining.delete(thingId);
  return brand(remaining);
}

/** The record a Diagram stores. Keys are already thing ids; this only widens them. */
function toPositions(placement: Placement): Record<ThingId, ThingPlacement> {
  return Object.fromEntries([...placement].map(([thingId, at]) => [thingId, point(at)]));
}

/**
 * Empty: a Diagram that authors no thing yet. Distinct from having no Diagram.
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
 * The growth an Open Thing displaces its neighbours by: its Open rect less the
 * collapsed one, floored at zero on each axis independently.
 *
 * The conversion sits beside `displace` because the floor is part of the rule
 * rather than a caller's precaution, and a rule with two owners has none. Open
 * passes this, Close passes its negation and Resize passes the difference
 * between two of them, so every growth that reaches `displace` in production has
 * come through here.
 *
 * The floor is not defensive arithmetic. Nothing authors a rect below
 * `COLLAPSED_THING_SIZE` — the resizer's minimum is exactly that, and
 * `thingPlacementSchema` refuses a smaller one — but a stored Space is bytes, and
 * a negative growth would pull neighbours backwards over the Thing that caused
 * it, past the subject, where the negating Close can no longer find them. So the
 * floor is also what makes the Open/Close round trip below hold. A rect smaller
 * than a collapsed Thing displaces nobody, which is the honest reading of it: it
 * is not a shrink of its neighbours.
 */
function growth(openSize: Extent): Extent {
  return {
    width: Math.max(0, openSize.width - COLLAPSED_THING_SIZE.width),
    height: Math.max(0, openSize.height - COLLAPSED_THING_SIZE.height),
  };
}

/**
 * The placement with every Thing beyond a subject moved by a growth.
 *
 * This is the whole of displacement (ADR 0084). Opening a Thing applies its
 * growth here as part of the Open Edit, and the coordinates it writes are
 * authored ones with the same standing as any other — the author opened the
 * Thing, and opening is a Diagram decision. Closing applies the negation, and
 * resizing the difference. Between those Edits nothing derives anything: the
 * Diagram's positions are what the canvas draws.
 *
 * The comparison is **strict and per-axis**. A Thing whose authored `x` is
 * strictly greater than the subject's takes `growth.width`, and its `y` is
 * decided separately against `growth.height`, so a Thing below the subject and
 * level with it moves down and not right. A Thing sharing the subject's
 * coordinate on an axis does not move on that axis, and the subject itself never
 * moves on either: a Thing does not displace itself.
 *
 * A negative growth is how Close is expressed and nothing here special-cases it,
 * because the round trip is what makes Open and Close a pair:
 * `displace(displace(p, c, g), c, negate(g))` is `p` for every **nonnegative**
 * `g`. The bound is load-bearing rather than a convenience. Applying a negative
 * growth *first* can carry a Thing back across the subject, and the negation then
 * skips it as no longer beyond — subject at `x = 0`, neighbour at `x = 1`,
 * `growth.width = -2`. `growth` above floors Open's at zero, so no Open reaches
 * it — but Close and a shrinking Resize both apply a negative growth, and the
 * Things they reach are whichever ones are beyond the subject *now*, not the
 * ones the Open pushed. A Thing the author dropped inside an Open Thing's rect is
 * beyond it and was never displaced by it, so closing carries that Thing back
 * across the subject and the reopen leaves it there. The asymmetry is therefore
 * stated rather than repaired — clamping it, or remembering which Things a
 * particular Open pushed, is the per-Thing history ADR 0084 rejected for making
 * two identical Diagrams behave differently.
 *
 * The same memorylessness read from the subject's side: a subject the author
 * has dragged past the neighbours its own Open displaced finds nobody beyond it
 * and gives nothing back, so that room stays where it is and a further
 * Open/drag/Close cycle adds more. ADR 0084 states this face for a moved
 * *neighbour*; it is one rule, and the subject is not exempt from it, because
 * this compares against wherever the subject now sits rather than wherever it
 * was when it Opened.
 *
 * Open/Closed state and the remembered Open Size ride through untouched; only
 * `x` and `y` move (ADR 0066). Answers the placement it was given whenever no
 * Thing actually moves — a subject the map does not hold, a growth that is zero
 * on both axes, and the case neither of those catches: a nonzero growth with
 * nothing beyond the subject on either axis, which `reclaim` reaches for a
 * subject the author dragged past its own displaced neighbours. Like `remove`,
 * so an Edit that moves nothing keeps the placement's identity and a settled
 * graph is not laid out again.
 */
function displace(placement: Placement, subjectId: ThingId, growth: Extent): Placement {
  const subject = placement.get(subjectId);
  if (subject === undefined) return placement;
  if (growth.width === 0 && growth.height === 0) return placement;

  const displaced = new Map<ThingId, ThingPlacement>();
  let moved = false;
  for (const [thingId, at] of placement) {
    const x = at.x > subject.x ? at.x + growth.width : at.x;
    const y = at.y > subject.y ? at.y + growth.height : at.y;
    if (x !== at.x || y !== at.y) moved = true;
    displaced.set(thingId, point({ ...at, x, y }));
  }
  return moved ? brand(displaced) : placement;
}

/**
 * The placement with the room an Open Thing holds given back to every Thing
 * beyond it, the Thing's own entry left exactly as it was.
 *
 * The displacement half of every way an Open Thing stops holding its room, and
 * the one statement of it (ADR 0084). A Thing closes, leaves a Diagram, or is
 * deleted from the Space, and all three owe the same negation of the growth of
 * the size it is Open at — the size read off its own entry, not off whatever
 * rect the gesture is proposing. That is why this is a member here beside
 * `growth` and `displace` rather than a line each caller writes: the third
 * caller is how a Thing deleted from a Diagram the Edit was not drawing came to
 * strand its room permanently, and a rule with three owners has none.
 *
 * Answers the placement it was given for a Thing that is Closed or not a member,
 * neither of which holds any room. A Closed Thing's remembered Open Size is not
 * room it holds — nothing was displaced for it — so it is deliberately not read
 * here (ADR 0066).
 *
 * Separate from `remove` rather than folded into it, because removing a key is
 * also how a placement is reconciled against a Diagram that has already
 * reclaimed, and reclaiming there would give the room back twice.
 */
function reclaim(placement: Placement, thingId: ThingId): Placement {
  const at = placement.get(thingId);
  if (at?.open !== true) return placement;
  const held = growth(at.openSize);
  return displace(placement, thingId, { width: -held.width, height: -held.height });
}

export const Placement = {
  empty,
  fromDiagram,
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

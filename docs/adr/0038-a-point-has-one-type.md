# A point has one type

Status: accepted
Refines: 0014
Related: 0005, 0025

`core`'s schema-derived `LayoutPosition` is the one representation of a point. `graph`'s `LayoutPoint` is deleted, and the strategy contract's routed edge sections and the `Placement` map both carry `LayoutPosition`. This is about the type a point is *declared* as, not about where geometry sits: `LayoutCard` and `LayoutPort` keep their loose optional `x`/`y`, because ADR 0005 has geometry ride as optional fields on the elements and the title is not a mandate to collapse those into one.

ADR 0014 recorded the duplication as **structural, not an oversight**, on the ground that `core` cannot import `graph`. The premise is true and it settles nothing: the point never needed to travel that way. `graph` already imports `CardId` and `Layout` from `core`, and `layoutPositionSchema` is where the shape is written down. What 0014 read as a package boundary was one type declared twice on the same side of it.

## What this costs

Authored placement and computed geometry now share a type, and they are not the same thing: a Layout's positions are content an author wrote, while an edge's bend points are output a strategy produced and nothing validates against the schema. `layoutPositionSchema` is bare `{x, y}` today, so the two agree. A constraint added for authored positions — a bound, an integer, a non-negative axis — would type ELK's bend points too, at a distance, in a package that never sees the schema.

The answer when that day comes is to constrain authored positions where only authored positions pass, which is intake, or to split the two again deliberately and say so here. It is not to leave a constraint sitting on a shared type. `packages/graph/src/layout.ts` carries this note at the type.

## The negative to remember

A future review will read a Zod-derived type used for ELK's bend points and propose re-splitting it for purity. The split has been paid for once already, on a premise that did not hold. Split it when a constraint actually lands on the authored schema, and not before.

# A lane keeps its distance along the whole curve

Status: ready-for-agent

## Problem Statement

Where more than one Graph joins the same pair of Resources, each Graph's Edge runs in its own lane beside the Active Graph's (ADR 0100). On a level Edge the lanes read as parallel lines. But as an Edge's curve turns steep — Resources far apart vertically joined through left and right handles, or far apart horizontally through top and bottom — another Graph's lane closes in on the Active Graph's line: full spacing where the curve leaves its handles, nearly touching in the steep middle. Two Graphs' lines that should read as one connection carried by several Graphs instead read as lines drifting into each other.

The cause is the decision ADR 0100 took on purpose: a lane is the lone Edge's curve moved whole by one vector. A translate keeps separation only where the curve is perpendicular to that vector; the separation seen is the spacing times the cosine of the curve's angle, so it collapses toward zero as the curve turns toward the direction of the move. With the current strokes, the lines touch once the curve is steeper than about 72°.

## Solution

A lane is drawn at a constant distance from the Active Graph's curve along its whole length: the curve offset along its own normal rather than translated. The lane still starts and ends where it does now, beside the anchors on the side of the Resource they sit on, so anchors and arrowheads do not move. A level Edge's lanes stay straight lines beside it. Lanes stay parallel — never fanned by curvature — and a detached lane still leaves a fifth of its length undrawn at each end.

## User Stories

1. As an author viewing a Map overview, I want another Graph's Edge to stay the same distance from the Active Graph's Edge along its whole length, so that I read them as one connection carried by several Graphs.
2. As an author, I want lanes between Resources stacked far apart vertically to stay separated in their steep middle, so that two Graphs' lines never touch or overlap.
3. As an author, I want lanes between Resources side by side far apart horizontally, joined through top and bottom handles, to stay separated in their flat middle, so that the rule holds on both axes.
4. As an author, I want a level Edge's lanes to remain straight lines beside it, so that nothing that reads well today changes.
5. As an author, I want the Active Graph's Edge to still start and end exactly where a lone Edge would, so that its connection to each Resource is unchanged.
6. As an author, I want an Active Graph holding both directions of a pair to still split the centre half a spacing either side, at a constant distance along the curve, so that both directions read as parallel.
7. As an author, I want each further Graph's lane one spacing further out at every point of the curve, so that three or four Graphs between one pair read as evenly spaced lines.
8. As an author, I want the arrowhead of a connecting Edge to land where it does now, so that the direction of the connection is unchanged.
9. As an author, I want a detached lane to still leave a fifth of its length undrawn at each end, measured along the curve, so that it still reads as not connecting.
10. As an author dragging a Resource, I want lanes to keep their constant spacing through every frame of the drag, so that the lanes follow the Resources as they do today.
11. As an author activating a different Graph, I want the newly active Graph to take the centre and the rest to redraw at constant spacing, so that switching Graphs behaves as it does today.
12. As an author, I want a self-Edge's lanes to behave as they do today, so that this change touches only Edges between two Resources.
13. As an author with Resources very close together, I want a lane to still draw forwards between them, so that a short Edge does not fold back on itself.
14. As an author, I want the Edge's label to stay at the midpoint of its curve, so that labels do not move.

## Implementation Decisions

- The change is entirely inside the lane geometry of the React Flow adapter: the function that turns an Edge attachment, a lane offset and an end trim into a path and label position. Its interface does not change. The lane assignment (`graphLanes`), the projection, and the data carried on the Edge (`laneOffset`, `endTrim`) are unchanged.
- React Flow remains the one author of the centre curve's shape: the centre curve is `getBezierPath` over the unmoved anchors, read back as one cubic as today.
- The lane is the offset of that cubic at the signed lane distance, computed as a single cubic by the Tiller–Hanson construction: move each of the three legs of the control polygon along its own normal by the distance, intersect adjacent moved legs to find the new inner control points, and move the end points along the end normals. At a left/right or top/bottom handle the end tangent is along the handle's facing axis, so the end normal is the same move the lane applies today and the ends stay put. Degenerate legs (zero length, or adjacent legs parallel so the intersection does not exist) fall back to moving the control point along the neighbouring normal. The sign convention is unchanged: positive runs below an Edge whose sides are left and right, and right of one whose sides are top and bottom.
- If a single-cubic offset does not hold the spacing within the tested tolerance on strongly S-shaped Edges, split the centre cubic (at t = 0.5, or adaptively) and offset each piece, emitting one path of joined cubics. The trim then needs to operate on the centre curve in parameter space before offsetting, or over the joined pieces; either is acceptable if the arc-length-equal trim still holds.
- Self-Edges keep their current rule: each anchor moves along its own side away from the corner, and the lane is a loop of its own. ADR 0100 already accepts that those lanes may cross.
- The trim is applied to the offset curve as today, measured along it, so both ends lose the same length.
- A new ADR (0103; 0102 is taken on the edge-toolbar branch) refines ADR 0100: a lane is the Edge's curve offset along its normal at a constant distance, not a whole-curve translate. It records why the translate was dropped (spacing times the cosine of the curve angle, touching past ~72°), and restates that lanes remain parallel and not fanned. ADR 0100's status block gains `Refined by: 0103` and nothing else. The lane function's doc comment is updated to describe the offset rather than "an exact translate".

## Testing Decisions

- One seam: the lane geometry function (`laneBezier`) in the React Flow adapter. It is pure, so every test runs in the node environment. Tests assert on the path it answers — sampled geometry — never on how the control points are computed.
- A new fast-check property, written red first against the current code: for random attachments on left/right and top/bottom sides, including steep ones where the Resources are far apart across the facing axis, and lane offsets of one to several spacings of either sign, every sample of the lane (untrimmed) lies within a small tolerance (about half a flow unit) of |offset| from the centre curve. The current translate fails this on steep attachments.
- A property that a lane's end points lie on the line through their anchor along the side the anchor sits on, at the lane offset from it — so anchors and arrowheads stay where they are.
- The existing example tests stay and must pass unchanged: a lone Edge is React Flow's own bezier; a level Edge's lanes are straight; a fifth of a level Edge is left undrawn at each end and it stays level; a self-Edge's anchors stay on their sides away from the corner; a short Edge draws forwards between Resources close together.
- Prior art: the existing lane tests alongside this function, and the adapter's projection property test for fast-check style.
- The projection tests and e2e suite are expected to pass unchanged; they prove nothing above the seam moved.

## Out of Scope

- Lane assignment: which Graph takes which lane, the centre split, paint order and opacity.
- Lane spacing (8 flow units), stroke widths and the trim fraction.
- Self-Edge lane geometry.
- Anchor choice and the facing rule (ADR 0087).
- Edge labels beyond keeping them at the curve midpoint.

## Further Notes

- The branch `edge-toolbar` also edits the lane tests; expect a small merge there.
- The investigation that found this is summarised in the Problem Statement; the arithmetic: separation = spacing × |cos θ|, θ the curve's angle to the facing axis; with 3 and 2 unit strokes the visible gap is about 8·cos θ − 2.5.

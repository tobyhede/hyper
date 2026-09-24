# 04 — A lane keeps its distance along the whole curve

Status: resolved
Blocked by: none

Spec: `.scratch/graph-lanes/spec-constant-lane-distance.md`

**What to build:** Another Graph's lane stays a constant distance from the Active Graph's Edge along its whole curve, instead of closing in where the curve turns steep. Today a lane is the lone Edge's curve translated whole by one vector, so its separation is the spacing times the cosine of the curve's angle and collapses toward zero in the steep middle of an Edge between Resources far apart across the facing axis. Draw the lane as the centre curve offset along its normal (Tiller–Hanson offset of the cubic, splitting if needed to hold the tolerance), with its ends where they are today so anchors and arrowheads do not move. Self-Edges keep their current rule. Record the change as ADR 0103 refining ADR 0100, and add `Refined by: 0103` to ADR 0100's status block.

- [x] A fast-check property over left/right and top/bottom attachments, steep ones included, holds every sample of a lane within about half a flow unit of |offset| from the centre curve; it was seen failing on the current code first.
- [x] A lane's end points sit beside their anchors on the side the anchor is on, at the lane offset — anchors and arrowheads unchanged.
- [x] The existing lane tests pass unchanged: lone Edge is React Flow's bezier, level lanes straight, a fifth trimmed each end and level, self-Edge anchors on their sides, short Edge draws forwards.
- [x] Lane assignment is untouched and `laneOffset` and `endTrim` are unchanged; the review follow-up adds each lane's pair reach (`GraphLane.reach`, projected as `laneReach`), and the projection tests change only for that field.
- [x] ADR 0103 written; ADR 0100 gains only `Refined by: 0103`; the lane function's doc comment no longer calls the lane an exact translate.
- [x] `pnpm verify` and `pnpm e2e` green; `pnpm e2e:ladle` run if any story draws lanes, otherwise named as inapplicable.

## Answer

`laneBezier` now draws a lane as the lone curve offset along its normal (ADR 0103, refining ADR 0100). The lone curve is still `getBezierPath` over the unmoved anchors, read back with `cubicOf`. Each piece of it is offset by Tiller and Hanson's construction, and a piece whose offset strays from the true offset at its quarter points is halved, to a fixed depth. So a curved lane is a run of joined cubics, and a straight one is still a single cubic. The ends are pinned to the anchor moved along its side, which is where the offset lands them, so anchors and arrowheads do not move. The label is the offset of the lone curve's midpoint. The trim now runs over the joined pieces and is still measured along the lane. Self-Edges keep the moved-anchor rule. `graphLanes`, the projection and the Edge data are untouched.

The distance property generates Left/Right and Top/Bottom attachments in both directions, with anchors up to 900 units apart across the facing axis and offsets of ±1 to ±3 spacings. It was run against the translate first and failed after 1 to 3 runs; the shrunk counterexample was Top/Bottom, 60 apart along the axis and 8 across, offset 16. It is asked only of curves that bend no tighter than twice the offset, because inside a tighter bend no curve can keep the distance.

An offset is drawn only where it stays a copy of the curve. `laneBezier` checks three things for each Edge: the curve bends no tighter than twice the lane's distance, it never turns back against the direction it leaves in, and both of its end legs have length. Where any check fails, the whole lane is the translate: both anchors move by one vector along their sides, with `getBezierPath` over the moved anchors. Without that fallback, a tight bend drew a swallowtail over the source Resource. A target behind its source drew a lane reaching past the curve's own ends. Anchors level on the facing axis drew a lane whose ends sat on the centre stroke and bowed out between them. The checks are tested by examples of each case, and by two properties over the full attachment range, targets behind and level with their sources included. First, a lane, trimmed or not, and its label never run further along the facing axis than the lone curve. Second, a lane runs forwards wherever the lone curve does. Both properties and all five examples failed on `ba861887` and pass now.

Two existing examples encoded a single cubic and had to change. The "moves a stacked Edge whole" row asserted the translate itself, so it was dropped; the translate example still covers level and reversed Edges, where an offset is a translate. The trim example's helper now reads every cubic of a path and takes the path's first and last points. Its assertions are unchanged. The other examples the ticket lists pass unchanged.

`pnpm verify` passed (3265 tests) and so did `pnpm e2e` (229). The stories draw Edges through the adapter's `edgeTypes`, so `pnpm e2e:ladle` was run and passed (118).

## Comments

A multi-reviewer pass found that the offset-or-translate choice was made per lane, so within one pair an inner lane could be offset while an outer one was translated and ran inside it. For example, on a Right→Left Edge to a target 120 ahead and 200 across, the lane at 16 came within 4.6 of the centre while the lane at 8 held 7.9. The distance property could not see this, because its precondition discarded every curve that falls back. `graphLanes` now gives each lane its pair's reach (`GraphLane.reach`, projected as `laneReach`), and `laneBezier` judges the bend at that reach, so a pair is offset or translated as a whole. The regression is covered by an example and by a property that each further lane of a pair runs further from the centre curve. Both failed before the fix. This adds `laneReach` to the Edge data, which the checkbox above now states.

A known limit remains open. Steep Edges whose ends bend tighter than twice the reach — for example 100 ahead and 300 across — still fall back to the translate and close up in the middle, which ADR 0103 accepts. Holding the spacing there needs a different construction, such as offsetting only where the bend allows. That is a design decision, not part of this ticket.

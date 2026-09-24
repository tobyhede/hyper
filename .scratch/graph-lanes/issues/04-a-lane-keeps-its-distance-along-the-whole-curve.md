# 04 — A lane keeps its distance along the whole curve

Status: ready-for-agent
Blocked by: none

Spec: `.scratch/graph-lanes/spec-constant-lane-distance.md`

**What to build:** Another Graph's lane stays a constant distance from the Active Graph's Edge along its whole curve, instead of closing in where the curve turns steep. Today a lane is the lone Edge's curve translated whole by one vector, so its separation is the spacing times the cosine of the curve's angle and collapses toward zero in the steep middle of an Edge between Resources far apart across the facing axis. Draw the lane as the centre curve offset along its normal (Tiller–Hanson offset of the cubic, splitting if needed to hold the tolerance), with its ends where they are today so anchors and arrowheads do not move. Self-Edges keep their current rule. Record the change as ADR 0103 refining ADR 0100, and add `Refined by: 0103` to ADR 0100's status block.

- [ ] A fast-check property over left/right and top/bottom attachments, steep ones included, holds every sample of a lane within about half a flow unit of |offset| from the centre curve; it was seen failing on the current code first.
- [ ] A lane's end points sit beside their anchors on the side the anchor is on, at the lane offset — anchors and arrowheads unchanged.
- [ ] The existing lane tests pass unchanged: lone Edge is React Flow's bezier, level lanes straight, a fifth trimmed each end and level, self-Edge anchors on their sides, short Edge draws forwards.
- [ ] Lane assignment, projection and the Edge data (`laneOffset`, `endTrim`) are untouched; projection tests pass unchanged.
- [ ] ADR 0103 written; ADR 0100 gains only `Refined by: 0103`; the lane function's doc comment no longer calls the lane an exact translate.
- [ ] `pnpm verify` and `pnpm e2e` green; `pnpm e2e:ladle` run if any story draws lanes, otherwise named as inapplicable.

# A lane bridges its ends where the curve bends tight

Status: ready-for-agent

## Problem Statement

Where several Graphs join the same pair of Resources, each Graph's Edge runs in its own lane beside the Active Graph's (ADR 0100), and since ADR 0103 a lane is the Active Graph's curve offset along its normal so it keeps its distance through a steep middle. But the offset is only drawn when the curve bends gently enough along its whole length, and React Flow's curve bends tightly right at its anchors whenever the target is only a little ahead of the source and far across it — Resources stacked far apart vertically but close horizontally, joined through left and right handles, or the same on the other axis. There the tight bend in the first and last tenth of the curve disqualifies the whole pair, every lane falls back to the curve moved whole, and in the steep middle the lanes close to almost nothing: on a Right→Left Edge to a target 100 ahead and 300 across, lanes meant to run 8, 16 and 24 from the Active Graph's Edge run 1.32, 2.63 and 3.95 from it, 1.32 from each other. The Graphs read as lines piled on one another rather than as one connection carried by several Graphs — the very case the constant lane distance spec set out to fix.

## Solution

A lane is the offset of the Active Graph's curve over the middle of the curve, where the bend allows it, and near each end it is a short bridge curve from the offset to the lane's own point beside the anchor. Every lane of a pair uses the same middle stretch, so the lanes stay in order and never cross. The middle holds the full spacing; the bridges carry each lane in to where it starts and ends today, so anchors and arrowheads do not move. Only a pair whose curve has no such middle stretch — anchors very close along the facing axis and far apart across it — still falls back to the curve moved whole. A detached lane's fifth-length trim removes its bridges, so what shows of it runs exactly at its spacing.

## User Stories

1. As an author viewing a Map overview, I want lanes between Resources stacked far apart and close along the facing axis to keep their spacing in the steep middle, so that several Graphs read as one connection rather than lines piled on each other.
2. As an author, I want the same to hold for Resources side by side far apart joined through top and bottom handles, so that the rule holds on both axes.
3. As an author, I want each further Graph's lane to run further from the Active Graph's Edge than the one inside it, so that lanes never cross.
4. As an author, I want a lane never to run closer to its neighbour than it does today, so that nothing that reads acceptably now gets worse.
5. As an author, I want every lane that is offset today to be drawn exactly as it is today, so that gently curved Edges do not change at all.
6. As an author, I want a lane to still start and end beside its anchor on the side the anchor sits on, so that its connection to each Resource is unchanged.
7. As an author with no Graph active, I want every lane's arrowhead to land where it does now and point the same way, so that the direction of each connection is unchanged.
8. As an author with a Graph active, I want a detached lane's visible middle to run exactly at its spacing, so that the Graphs beside the Active one read as evenly spaced parallel lines.
9. As an author, I want a detached lane to still leave a fifth of its length undrawn at each end, measured along the lane, so that it still reads as not connecting.
10. As an author, I want a lane to run forwards from its source to its target with no fold, kink or loop, so that a bridge never doubles back over a Resource.
11. As an author, I want a lane never to reach further along the facing axis than the Active Graph's curve does, so that it never runs past a Resource.
12. As an author, I want the label of an Edge to stay at the offset of the curve's midpoint, so that labels do not move.
13. As an author dragging a Resource, I want lanes to switch smoothly between bridged and offset as the curve changes, and to keep their spacing through every frame, so that lanes follow the Resources as they do today.
14. As an author with Resources very close along the facing axis and far apart across it, I want the lanes to fall back to the curve moved whole, so that no lane is drawn behind the Resource it leaves.
15. As an author, I want an Active Graph holding both directions of a pair to split the centre half a spacing either side through the same middle stretch, so that both directions read as parallel.
16. As an author, I want a self-Edge's lanes to behave as they do today, so that this touches only Edges between two Resources.
17. As an author, I want an Edge whose target sits behind its source, or whose anchors are level on the facing axis, to be drawn as it is today, so that those guarded cases do not change.

## Implementation Decisions

- The change is entirely inside the lane geometry of the React Flow adapter: `laneBezier` and the curve it builds. Its interface is unchanged. `graphLanes`, the projection and the Edge data (`laneOffset`, `laneReach`, `endTrim`) are unchanged; each lane already carries its pair's reach, which is all the new rule needs.
- React Flow remains the one author of the centre curve: `getBezierPath` over the unmoved anchors, read back as one cubic.
- The whole-curve check that the offset holds is replaced by finding the offset's **span**: the widest parameter interval [t₀, t₁] around the curve's midpoint over which (a) the bend allows an offset at both plus and minus the pair's reach — the same curvature threshold used today, |κ|·reach < ½; (b) the offsets at plus and minus the reach run forwards along the facing axis; and (c) a single bridge cubic from each moved anchor to the offset at the span's end has a control polygon running forwards along the facing axis. The span depends only on the centre curve and the reach, so every lane of a pair lands at the same t₀ and t₁. A span per lane was prototyped and produced crossings (11 of 144 swept cases); one span per pair produced none.
- The reversed-target, level-anchor and zero-length-leg guards stay as they are and still send the pair to the translate.
- A lane is: a bridge cubic from the anchor moved along its side to the offset at t₀, leaving along the side's facing direction and arriving along the offset's tangent; the existing Tiller–Hanson offset pieces of the centre split to [t₀, t₁]; and a bridge cubic from the offset at t₁ to the target anchor moved along its side, arriving along the facing direction. Where the span is the whole curve (t₀ = 0, t₁ = 1) there are no bridges and the lane is exactly today's.
- Bridge handle lengths, from the prototype: along the facing axis at the anchor, α = min(chord/3, Δ/2); along the offset's tangent at the landing point, β = min(chord/3, (Δ − α)/Tₓ), where Δ is the distance to cover along the facing axis and Tₓ the tangent's component along it. This keeps each bridge's control polygon forwards, which is sufficient for the bridge to run forwards.
- Where no span exists, the lane is the curve moved whole, as today.
- The label stays the offset of the centre's midpoint, which always lies in the span. The trim still runs over the joined pieces, measured along the lane.
- ADR 0103's paragraph "Where no offset is a copy of the curve, the lane is the curve moved whole" is amended in place while ADR 0103 is unmerged: the offset is drawn over the widest central span where the bend allows it at the pair's reach and the lane runs forwards, outside it each end is one bridge cubic to the moved anchor, and the translate remains only for pairs with no such span. If ADR 0103 has merged first, a short ADR refining it records this instead. The sentence that lanes are parallel and not fanned stays: the bridges converge on each lane's own point beside the anchor, never a shared one.
- Optional, only if the "never worse than the translate" property ever finds a counterexample: a runtime guard comparing the bridged lane at the reach with the translated one and translating where the bridged lane is nearer. It costs a second path per lane, so it is not built up front.

## Testing Decisions

- One seam: `laneBezier`. It is pure, so every test runs in the node environment and asserts on the sampled geometry of the path it answers, never on how the span or the bridges are computed.
- A new example, red first: a Right→Left Edge to a target 100 ahead and 300 across, lanes at 8, 16 and 24 with reach 24. No lane comes nearer its inner neighbour than 4.5, and in the trimmed middle each lane is within 0.5 of its offset from the centre. Today the lanes are translated and 1.32 apart.
- A new property, "never worse than the translate": for Left/Right and Top/Bottom attachments in both directions and a pair of 2 to 4 lanes, the smallest gap between neighbouring lanes is at least the smallest gap between the same lanes moved whole, less 0.05. The translated lanes are built through `getBezierPath` over moved anchors.
- The existing distance property's precondition is relaxed from "the whole curve bends gently enough" to "samples inside the span", so the property sees the curves it discards today.
- The existing properties and examples stay and pass unchanged: ends on the line through the anchor along its side at the offset; each further lane further from the centre curve; lane and label never further along the facing axis than the lone curve; the lane runs forwards wherever the lone curve does; the lone Edge is React Flow's bezier; level lanes are straight; the trim examples; the self-Edge and short-Edge examples.
- A regression property: wherever the span is the whole curve, the path is the same as the offset lane drawn today.
- Prior art: the properties and helpers already in the lane tests (`attachmentOf`, `samples`, `distanceFrom`, `nearestApproach`, `expectWithinTheCurve`, `expectForwards`), and the adapter's projection property test for fast-check style.
- Projection, app and e2e suites are expected to pass unchanged. Stories draw Edges through the adapter, so `pnpm e2e:ladle` applies.

## Out of Scope

- Lane assignment, the spacing, strokes and the trim fraction.
- Changing the centre curve's shape: React Flow stays its author.
- Tapering or clamping a lane's distance by curvature, and blending from the translate to the offset — the research rejected both (ends leave their anchors, outer lanes collapse, or the ramp folds).
- Self-Edge lane geometry.
- The reversed-target and level-anchor cases, which keep their guards.
- Holding the full spacing right at the anchors: a lane's end is fixed beside its anchor, and on tight curves that point is already nearer the centre curve than the lane's distance (19.93 for the 24 lane on the measured curve), so no construction that keeps the ends can clear it.

## Further Notes

- Research, with sources, the prototype's construction and its sweep: `.scratch/graph-lanes/tight-curve-offset-research.md`. The sweep covered 144 Right→Left forward attachments; Top/Bottom, reversed and asymmetric cases were not swept, which is what the new properties are for.
- Prior art for the shape: LOOM, the transit-map renderer, offsets lines along a course and joins them to fixed node fronts with Bézier bridges. Stroke renderers (Skia, kurbo, Cairo, Blend2D) keep offset cusps and let the filled stroke hide them, which a thin lane cannot; graph libraries fan multi-edges rather than keeping them parallel.
- Follows `.scratch/graph-lanes/spec-constant-lane-distance.md` and ticket 04's review follow-up.

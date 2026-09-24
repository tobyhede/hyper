# 05: A lane bridges its ends where the curve bends tight

**What to build:** Lanes between Resources close along the facing axis and far apart across it keep their spacing through the steep middle instead of piling onto the Active Graph's Edge. Each lane is the offset of the centre curve over one central span shared by every lane of its pair, and near each end a single bridge cubic joins the offset to the lane's own point beside its anchor. Anchors, arrowheads, label and trim behave as today, gently curved Edges draw exactly as today, and only a pair with no such span falls back to the curve moved whole. Amend ADR 0103's fallback paragraph in place (or, if it has merged, refine it with a short new ADR).

Spec: `.scratch/graph-lanes/spec-lane-bridges.md`. Research: `.scratch/graph-lanes/tight-curve-offset-research.md`.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] Seen red first: on a Right→Left Edge to a target 100 ahead and 300 across with lanes at 8, 16 and 24 (reach 24), no lane comes nearer its inner neighbour than 4.5, and in the trimmed middle each lane is within 0.5 of its offset from the centre.
- [x] A property over Left/Right and Top/Bottom attachments in both directions and pairs of 2–4 lanes: the smallest gap between neighbouring lanes is never less than the same lanes moved whole give, less 0.05.
- [x] The distance property samples inside the span rather than discarding curves that bend tight anywhere.
- [x] Wherever the span is the whole curve, the lane's path is the one drawn today.
- [x] Every existing lane property and example passes unchanged: ends beside anchors, lanes ordered, never past the lone curve, runs forwards, lone Edge is React Flow's bezier, level lanes straight, trim, self-Edge and short-Edge examples.
- [x] `graphLanes`, the projection and the Edge data are untouched.
- [x] ADR 0103 states the span-and-bridge rule; lanes remain parallel and not fanned.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green, or run in CI where local load prevents it.

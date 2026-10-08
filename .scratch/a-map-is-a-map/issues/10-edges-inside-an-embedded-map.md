# 10: Edges inside an embedded Map

**What to build:** An author editing an embedded Map selects and deletes its Edges and chooses an Edge's other end through Connect to Resource, as on the canvas. A connection between Resources in two different drawings is refused with wording, because an Edge joins Resources in one Space.

**Blocked by:** 07.

**Status:** resolved

**Spec:** `.scratch/a-map-is-a-map/spec.md`. **Decision:** ADR 0112.

- [x] An embedded Map's Edges are selectable, focusable and deletable in Edit, with the same confirmation and outcomes as on the canvas.
- [x] Connect to Resource offers only Resources of the selection's occurrence, and a choice continues at the new Edge in that drawing.
- [x] A drag between Resources of two drawings is refused with wording, shown like any other connection refusal; no refusal is dropped silently.
- [x] Inert and read-only Maps withhold Edge authoring exactly as the policy says.

## Answer

Embedded Edges retain their domain subject while their rendered identities name the occurrence. The shared Edge Authoring surface handles selection, deletion and Connect to Resource. Cross-drawing connections report a refusal, and inert/read-only policies withhold authoring. Application tests verify target edits and same-drawing continuation.

Delivered by PR #332, merged 2026-10-04 with its CI gate green. A verification pass on 2026-10-08 checked every criterion against `main` and added the tests it found missing in the closeout PR.

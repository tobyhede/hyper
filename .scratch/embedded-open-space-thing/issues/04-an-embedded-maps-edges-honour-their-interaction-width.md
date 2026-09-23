# 04 — An embedded Map's Edges honour their interaction width

**What to build:** The interaction width the embedding sets on an embedded Map's Edges takes effect, or is removed if it is not wanted. Today the embedding sets it to zero, but the routed Edge path forwards only the Edge's id, end marker and style to React Flow's base Edge, so the base Edge falls back to its default hit area of 20 and the setting does nothing.

**Blocked by:** None — can start immediately.

**Status:** needs-triage

**Tags:** Defect

**Surfaced by:** the design review for `typescript-7/13` (2026-09-23), while checking whether embedded Edges would render differently under their own Edge type. Not caused by that ticket.

## Decide first

Embedded Edges are also minted not selectable, not focusable, not reconnectable and not deletable, so it is not obvious a zero hit area is still needed. Establish what an embedded Edge's hit area currently intercepts — for example, whether it takes pointer events from the Open Space Resource or the canvas beneath it — and either:

- forward interaction width through the routed Edge path so the embedding's zero applies, or
- delete the setting and say here why the other flags make it redundant.

## Acceptance

- [ ] The decision and its evidence are recorded here.
- [ ] If kept: an embedded Edge's hit area matches what the embedding asks for, and an Edge of the Map on the canvas keeps its current hit area.
- [ ] If removed: the setting and any test pinning it are gone, and nothing it guarded regresses.
- [ ] `pnpm verify` and `pnpm e2e` pass; `pnpm e2e:ladle` if a story's Edge rendering changes.

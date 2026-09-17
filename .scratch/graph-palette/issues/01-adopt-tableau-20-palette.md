# 01 — Adopt Tableau 20 as the Graph palette

Status: resolved
Tags: release/v1

**What to build:** The application's Graph colour constant becomes Tableau 20 —
twenty curated slots used consistently wherever authoring mints a Graph colour,
projection resolves one, and tests assert palette membership. Each slot carries
a short human label (hue name, with *light* for the second member of each
Tableau pair). Existing Spaces do not need migration; update fixtures and tests
that pin old hex values or six-slot assumptions.

**Blocked by:** None — can start immediately.

- [x] `GRAPH_PALETTE` holds twenty Tableau 20 hex values with source noted beside the constant.
- [x] A single exported name map (or equivalent) pairs every slot with its label; callers do not invent labels locally.
- [x] `nextGraphColor`, `graphColorMap`, and `activeGraphColor` rotate and resolve through the expanded set without behaviour regressions.
- [x] Unit and property tests that sample or index the palette are updated; `pnpm verify` passes.
- [x] Fixture and story data that assumed six palette slots or specific old hex values are updated.

## Comments

Resolved on `main` by `b9fe0a0cf` (adopt Tableau 20 and the swatch grid), `47c0f8fce` (picker layout and palette ordering) and `ed18178ae` (parity claims and swatch grid tests).

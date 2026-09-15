# 05 — Embedded context authoring port for rename and recolor

Status: resolved

**What to build:** Context completions addressed to the Diagram a Space Thing shows (rename Diagram, rename Graph, recolor Graph, add Graph) route through one embedded authoring adapter per target Diagram — the same deepening pattern as embedded Thing authoring, extended for `EmbeddedContextCompletion`. Space Thing rail wiring for those commands thins to adapter injection; Dock continues to use working-Space authoring unchanged.

**Blocked by:** 04 — Shared diagram create orchestration

- [x] Rename, recolor, and add-Graph on an Open Space Thing rail complete through one diagram-scoped authoring port rather than ad hoc `complete` vs `completeInDiagram` branching in the wiring module.
- [x] Refusal mapping uses `describeAuthoringRefusal` for authoring outcomes; lifecycle deletes remain on the coordinated delete wrappers from ticket 01.
- [x] No second authoring entry point is introduced for the same completion kinds.
- [x] `pnpm verify` passes; Space Thing rail rename/recolor/create behaviour proofs still pass.

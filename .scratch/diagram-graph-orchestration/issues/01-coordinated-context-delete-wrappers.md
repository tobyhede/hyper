# 01 — Coordinated context delete wrappers

Status: resolved

**What to build:** Thin orchestration functions over the existing coordinated lifecycle seam (`spaceThings.deleteDiagram` and `spaceThings.deleteGraph`). Each function awaits an optional `waitBefore` gate, calls the lifecycle, maps refusals through `describeSpaceThingRefusal`, and **returns** the outcome — a replacement Diagram and Graph pair on success, or an error message. No navigation, no stored-selection writes, and no menu wiring inside the wrappers; call sites own follow-up side effects.

**Blocked by:** None — can start immediately.

- [x] `coordinatedDiagramDelete` and `coordinatedGraphDelete` exist as the only **user-initiated UI** entry points for coordinated Diagram and Graph deletion. Direct `deleted-diagram` / `deleted-graph` completions on Space Authoring remain domain authoring, not Dock/rail orchestration.
- [x] Success returns `{ kind: 'completed', diagramId, graphId }`; failure returns `{ kind: 'error', message }`. Lifecycle `unchanged` is passed through; entity-menu Delete treats it as done rather than failed (`coordinatedDeleteOk`).
- [x] Optional `waitBefore: () => Promise<boolean>` gates the call; when it returns false, the wrapper answers with the same persistence error prose Space Thing commands use today.
- [x] Unit tests cover refusal mapping, a successful replacement pair, and the two-Space `waitBefore` gate — without wiring a UI consumer.

# 03 — Dock delete uses coordinated wrappers

Status: resolved

**What to build:** Command Dock Diagram delete (entity menu and Diagram identity cluster) and Graph delete call the same coordinated delete wrappers from ticket 01. Navigation follow-up (always adopt the replacement pair on success) stays inline in the application composition root. Dock and Space Thing rail cannot drift on delete orchestration again.

**Blocked by:** 01 — Coordinated context delete wrappers

- [x] Dock diagram delete paths (entity actions and identity-menu Delete) share one wrapper call shape.
- [x] Dock graph delete uses the graph wrapper with the same refusal and success handling.
- [x] No call site bypasses `spaceThings.deleteDiagram` or `spaceThings.deleteGraph` for user-initiated delete.
- [x] `pnpm verify` passes; affected application and Ladle proofs for Dock diagram/graph actions still pass.

`coordinated-context-delete.test.ts` ("Dock delete wiring") pins App.tsx: Diagram delete is `coordinatedDiagramDelete(spaceThings.deleteDiagram, … preferredDiagramId: null)`; Graph delete is the graph wrapper with `preferredGraphId: null`. A direct `spaceThings.deleteDiagram({` / `deleteGraph({` would fail that scan.

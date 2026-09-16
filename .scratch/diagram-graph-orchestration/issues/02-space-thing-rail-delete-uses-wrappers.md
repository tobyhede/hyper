# 02 — Space Thing rail delete uses coordinated wrappers

Status: resolved

**What to build:** An Open Space Thing's Diagram and Graph delete commands on the rail call the coordinated delete wrappers from ticket 01. Target Navigation follow-up (select replacement pair only when the deleted Diagram is the one currently selected in the embed) stays inline at the call site. The wiring module thins to orchestration glue; it no longer reimplements lifecycle coordination.

**Blocked by:** 01 — Coordinated context delete wrappers

- [x] Space Thing Diagram delete and Graph delete both route through the wrappers from ticket 01.
- [x] Stored-selection repair and atomic multi-Space deletion remain lifecycle-owned; no inline delete path bypasses `spaceThings`.
- [x] Existing Space Thing context-command persistence tests pass unchanged in intent (Diagram delete, Graph delete, create-before-refer ordering where applicable to delete).
- [x] `pnpm verify` passes on the finished state.

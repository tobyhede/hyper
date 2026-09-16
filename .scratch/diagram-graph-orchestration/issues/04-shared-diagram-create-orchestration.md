# 04 — Shared diagram create orchestration

Status: resolved

**What to build:** A shared create orchestration helper for New Diagram (and the parallel New Graph path where the same settled → create → persist → hook sequence applies). The helper returns created identities; an `afterCreated(created, active)` hook at the call site supplies surface-specific follow-up — Space Thing writes stored selection then requests rename continuation; Dock requests rename continuation only. Selection binding on `ChoiceMenu.onChoose` stays at call sites and is out of scope.

**Blocked by:** 02 — Space Thing rail delete uses coordinated wrappers; 03 — Dock delete uses coordinated wrappers

- [x] New Diagram create on the Dock and on an Open Space Thing rail share one orchestration helper.
- [x] Space Thing create persists the target before the Thing refers to the new Diagram or Graph; create-before-refer ordering tests pass.
- [x] Rename continuation after New Diagram remains caller-owned via `afterCreated`; the helper does not import continuation targets.
- [x] Dock Graph create (`added-graph` on the identity cluster) is **intentionally out of scope**: it has no settled → persist → `afterCreated` sequence today. Space Thing Graph create stays on the helper. If an embed ever needs that ordering on the Dock path, that is where drift would return.
- [x] `pnpm verify` passes on the finished state.

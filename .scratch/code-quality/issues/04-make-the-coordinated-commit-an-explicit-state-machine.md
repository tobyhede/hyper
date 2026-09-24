# 04: Make the coordinated commit an explicit state machine

**What to build:** The coordinated commit's phases — aggregate read, plan, prepare, publish, install, unwind — and its recovery state, as an explicit state machine with named states and transitions, taken out of the registry's closure. The registry becomes a thin imperative shell that runs the planner (03) and drives the machine. Mutable collections shared across nested closures go away.

**Blocked by:** 03

**Status:** resolved

- [x] Each state and transition is named, and an illegal transition cannot be expressed or is refused
- [x] Unwinding after a throw is one transition, not recovery code scattered across callers
- [x] No function in the registry is longer than about 150 lines, and closures nest at most two levels deep
- [x] 02's tests pass unchanged
- [x] `pnpm verify` green

## Answer

The machine is `CoordinatedCommit` in `packages/persistence/src/coordinated-commit.ts`: phases `planned → enlisted → prepared → published → committed | conflicted | failed`, `unwound` from any of `enlisted`, `prepared` or `published`, and `recovered` once from `conflicted`, `failed` or `unwound`. A `TRANSITIONS` table refuses every other move by throwing; a second recovery request is ignored, as before. The per-commit state that nested closures used to share (participants, begun, baselines, conflicts, the recovery flag) is private to the machine. `session-registry.ts` is the shell: `LiveSpaces` holds the registry-wide sessions, provisional entries and barrier; `CoordinationTurns` the turn queue; `runCoordination` and `commitPlan` read, plan and drive the machine. The aggregate read and plan are the registry's own steps before the machine starts, since the machine begins from a decided plan (`space-resource-planning.ts`). Install is not a phase either: `commitPlan` calls `installed` itself between `publish()` and `backend.commit`, so the transition table does not order it.

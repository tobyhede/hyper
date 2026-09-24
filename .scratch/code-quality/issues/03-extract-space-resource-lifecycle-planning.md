# 03: Extract Space Resource lifecycle planning into a pure module

**What to build:** The decisions of the Space Resource lifecycle — what a create, link, update or delete changes across Spaces, and when it is refused — as pure functions from the Spaces involved and an operation to a plan outcome. The registry calls them instead of deciding inside its closure. They can be tested in Node without a backend or a session.

**Blocked by:** 02

**Status:** resolved

- [x] Planning and refusal logic lives in its own module with no session, backend or observable-state dependency
- [x] The new module has direct unit tests, with a property test where an invariant is stated (e.g. a plan never leaves a Space Resource dangling)
- [x] 02's tests pass unchanged
- [x] `pnpm verify` green

## Answer

The planner is `packages/persistence/src/space-resource-planning.ts`: `planCreate`, `planLink`, `planDelete` (with `cascadeDeletion`) and `planContextDeletion`, plus the pre-read checks `refuseBeforeCreating`, `refuseBeforeLinking` and `precheckContextDeletion`. Each reads a `SpaceResourcePlanningView` — the Spaces, the aggregate read, which Spaces are live and which need recovery — and answers a plan whose `open` names the stored Spaces the registry must open and whose `completion` is what the operation answers. Direct tests, including a fast-check property that a deletion over any lifecycle-built aggregate leaves no Space Resource dangling and no ordinary Space unreferenced, are in `packages/persistence/test/space-resource-planning.test.ts`.

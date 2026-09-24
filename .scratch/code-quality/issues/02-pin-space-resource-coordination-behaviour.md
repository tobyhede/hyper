# 02: Pin Space Resource coordination behaviour

**What to build:** A characterisation of the session registry's coordinated Space Resource lifecycle, complete enough that 03 and 04 can move the code freely and any change in behaviour fails a test. Cover create, link, update and delete, including `link`'s own refusals when the target Space cannot be read (`space-resource-target-unavailable`, `persistence-read-failed`) and its behaviour while a commit is in flight; recovery through retry and keep-local; unwinding after a participant or commit throws; provisional creates being dropped; and the persistence barrier.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Each path above has a test through the registry's public interface, reusing the existing tests where they already cover it
- [x] Only the gaps get new tests, and each new test states which path it pins
- [x] No production code changes
- [x] `pnpm verify` green

## Answer

The new cases are the `Space Resource coordination paths` block in `packages/persistence/test/space-resource-lifecycle.test.ts`, each named by the path it pins (`barrier:`, `update:`, `unwind:`, `provisional:`, `keep-local:`). Create, delete, retry, keep-local, accept-remote, commit-throw and barrier serialisation were already covered by the cases above it and in `session-registry.test.ts`. So were `link`'s own paths: its `persistence-read-failed` refusal (the `create`/`link` table at the head of the file), its `space-resource-target-unavailable` refusals for a target that could not be initialized, has gone or is not a valid Space, and its reading of a target's stored selection while that target has a commit in flight. A *participant* throwing in `prepareCoordinatedCommit` is not reachable through the public interface — every session is paused under the barrier, so none can start an ordinary commit inside the coordination — so the unwind transition is pinned through the commit-throw path and through a throw raised before any participant begins.

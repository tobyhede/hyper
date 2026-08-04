# 01 — Session observers cannot interrupt persistence

**What to build:** Make Space-session notification non-throwing so an observer
failure is reported separately while the working Space, persistence attempt,
remaining observers and any reentrant Edit completion all continue normally.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] A synchronous observer failure cannot escape through the operation that
      published session state.
- [x] One failing observer does not prevent later observers from receiving the
      same state change.
- [x] Submitting an Edit still starts and completes persistence when an observer
      throws during the working-Space publication.
- [x] Reentrant Edit completion is queued and derived from the fully installed
      preceding state even when an observer fails.
- [x] Observer failures reach a non-throwing diagnostic path, and a failure in
      that diagnostic path cannot interrupt session work.
- [x] Tests replace the former rethrow contract and prove the stored revision
      contains the completed Edit.
- [x] `pnpm verify` passes.

## Answer

Implemented by PR #14. `SpaceSession` contains synchronous and asynchronous
observer failures, continues notification and persistence, and safely reports
diagnostic failures. Reentrant submissions derive from the installed working
Space and coalesce to the newest snapshot. Focused tests and `pnpm verify` pass.

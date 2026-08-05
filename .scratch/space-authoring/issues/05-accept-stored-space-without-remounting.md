# 05 — Accept the stored Space without remounting

**What to build:** Let the author accept the database's current Space after an
optimistic conflict through Space Authoring, resetting placement and navigation
as a fresh opening while the application remains mounted.

**Blocked by:** 04 — Cut existing interactions over to Space Authoring.

**Status:** resolved

- [x] A persistence conflict keeps the local working Space visible and does not
      disable further Authoring.
- [x] Accepting the stored Space explicitly discards every local Edit accumulated
      after the conflicting revision.
- [x] Space Authoring adopts the stored snapshot and revision, rebuilds
      placement, and exposes settled persistence state.
- [x] Navigation selects the stored Space's default renderer and resolved active
      Route, ends any walk, exits presenting, and closes any opened Card.
- [x] An obsolete asynchronous layout-strategy result cannot replace placement
      resolved for the accepted Space.
- [x] Accepting the stored Space does not recreate or remount the application or
      its root.
- [x] The application has no direct session mutation path left after conflict
      acceptance moves behind Space Authoring.
- [x] Focused and browser tests prove conflict acceptance, navigation reset,
      stable application lifetime and subsequent successful Authoring.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Answer

Implemented by PR #16. Space Authoring validates and adopts the stored snapshot,
rebuilds placement, opens Navigation afresh and settles persistence without
remounting the application. Tests cover stale-layout suppression, stable mounted
identity, discarded local edits and successful subsequent Authoring.

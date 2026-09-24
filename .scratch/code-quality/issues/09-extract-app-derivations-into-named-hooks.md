# 09: Extract App's derivations into named hooks

**What to build:** Each self-contained derivation in `App` — the visible centre and the anchor for new Resources, the referenceable Spaces and when they are re-read, the chrome handed to the Command Dock, and the like — becomes a named hook or pure function with its own test. `App` only composes them.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Each extracted derivation has a direct test. Pure parts are tested in the node environment (`packages/app/test/app-derivations.test.ts`; hooks in `app-hooks.test.tsx`)
- [x] `App` has no more than about 15 hook calls, and each one reads as one named concern (15 named hooks plus the Dock's container `useRef`)
- [x] No change in behaviour: e2e unchanged (the app unit/integration suite is unchanged and green)
- [x] `pnpm verify` and `pnpm e2e` green

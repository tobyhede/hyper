# 09: Extract App's derivations into named hooks

**What to build:** Each self-contained derivation in `App` — the visible centre and the anchor for new Resources, the referenceable Spaces and when they are re-read, the chrome handed to the Command Dock, and the like — becomes a named hook or pure function with its own test. `App` only composes them.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Each extracted derivation has a direct test. Pure parts are tested in the node environment
- [ ] `App` has no more than about 15 hook calls, and each one reads as one named concern
- [ ] No change in behaviour: e2e unchanged
- [ ] `pnpm verify` and `pnpm e2e` green

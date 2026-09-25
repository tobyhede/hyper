# 26 — Retire `LinkActionsIcon`

**What to build:** Delete `LinkActionsIcon` from `packages/ui/src/icons.tsx` and its export from `packages/ui/src/index.ts`.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Priority:** P3

**Why:** Nothing imports it. `EntityActionsTrigger` defaults to `EntityActionsIcon`, so the Resource rail draws the general glyph. PR #263 made this deletion, along with story and ticket edits, and was closed without merging. No story references the icon any more, so none of #263's story edits are needed for the deletion.

- [ ] `git grep LinkActionsIcon` finds nothing in `packages/`, `src/` or `test/`.
- [ ] The doc comment above the icon goes with it, and no other comment names it.
- [ ] `pnpm verify` and `pnpm e2e:ladle` pass. `e2e` is not needed: no production caller changes.

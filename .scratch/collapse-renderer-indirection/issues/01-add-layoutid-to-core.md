# 01: `LayoutId` joins `@project/core`

**What to build:** A Layout id has one spelling across the repo. `@project/core` names it beside the two entity id aliases it already exports, so every later ticket — and every future reader — writes `LayoutId` rather than a render-layer alias or a bare UUID.

This is purely additive. Nothing is renamed and no caller changes: the existing alias stays until ticket 04 deletes it, and both aliases resolve to the same underlying id type, so the substitution ticket 04 performs is type-identical and this ticket cannot break a call site.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] `@project/core` exports `LayoutId`, derived from the `Layout` type in the same way `CardId` and `GraphId` are derived from theirs, and declared beside them
- [x] No barrel edit is needed — `core`'s index re-exports its types module wholesale — and `core` has no curated package-surface test to add the name to
- [x] The existing render-layer id alias is untouched and still compiles, and resolves to the same type the new alias does
- [x] No call site changes
- [x] `pnpm verify` green, with `core`'s pinned coverage threshold still met — a type alias adds no statement, so the threshold must not move

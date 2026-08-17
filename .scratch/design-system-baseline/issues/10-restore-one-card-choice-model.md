# 10 — Restore one Card-choice model with two presentations

**What to build:** Give Card selection one shared behavior model with the two
accepted presentations: a collapsed picker for compact controls and an inline,
always-open picker for panes. Existing Alias and Edge workflows keep their
surface-specific layout without maintaining a third selection implementation.

**Blocked by:** 03 — Recompose Card and Alias panes from form primitives.

**Status:** ready-for-agent

- [ ] Inventory the production uses of `CardCombobox`, `CardPicker` and `CardSearchCombobox`, including Edge endpoints, keyboard Connect, new Alias Target and opened Alias Target.
- [ ] Choose the shared shadcn/Base UI or cmdk behavior once, then expose collapsed and inline compositions without duplicating filtering, active-item, selection, empty-state, focus or Escape behavior.
- [ ] Every refused `CardChoice` remains visible as a disabled row and displays its refusal reason accessibly in both presentations.
- [ ] Remove the superseded third implementation and its public export; update AGENTS.md only if the accepted architecture itself changes through the normal decision process.
- [ ] Component tests and production application tests cover search by title, duplicate titles, empty results, refusal reasons, keyboard selection, dismissal and initial focus.
- [ ] `pnpm verify`, `pnpm e2e:ladle` and `pnpm e2e` pass.

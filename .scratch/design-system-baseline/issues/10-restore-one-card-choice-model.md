# 10 — Restore one Card-choice model

**What to build:** Give Card selection one shared editable-combobox component
across Alias and Edge workflows, using the improved donor design.

**Blocked by:** 03 — Recompose Card and Alias panes from form primitives.

**Status:** resolved

- [x] Inventory every production use, including Edge endpoints, keyboard Connect, new Alias Target and opened Alias Target.
- [x] Use one shadcn/Base UI editable combobox for filtering, active-item, selection, empty-state, focus and Escape behavior.
- [x] Keep every refused `CardChoice` visible as a disabled row with its refusal reason.
- [x] Remove both superseded implementations and their public exports; update AGENTS.md for the accepted one-component architecture.
- [x] Production tests cover search, empty results, refusal reasons, keyboard selection, dismissal and initial focus.
- [x] `pnpm verify`, `pnpm e2e:ladle` and `pnpm e2e` pass.

## Answer

The user selected the donor's improved editable-combobox design as the sole
Card picker, superseding this issue's earlier two-presentation proposal.
`CardSearchCombobox` now serves Edge endpoint editing, keyboard Connect, new
Alias Target and opened Alias Target. `CardCombobox` and the inline
`CardPicker`, along with their temporary Working comparison, have been removed.

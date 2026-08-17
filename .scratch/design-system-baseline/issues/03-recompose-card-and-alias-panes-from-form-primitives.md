# 03 — Recompose Card and Alias panes from form primitives

**What to build:** Make the opened Markdown Card and new Alias surfaces shared design-system forms, retaining their one atomic Edit and their existing Done, Cancel and Escape semantics.

**Blocked by:** 01 — Establish the shadcn design-system baseline.

**Status:** ready-for-agent

- [ ] Card and Alias fields, descriptions, validation errors, target picker and actions compose shared form and dialog primitives.
- [ ] A pane still commits only through Done; Cancel and Escape still discard all pending values, and no field independently commits or intercepts Escape.
- [ ] Ladle shows real production-pane states including validation, long content, picker empty/refusal states and keyboard-focus-relevant variants.

## Audit note

The production opened-Card surface now uses the shared Dialog and form
primitives, but the catalogue proves only its ordinary interactive state. Add
fixed, real-component stories for validation, long content, empty and refused
Target choices, and the focus states named above. Card-choice architecture is
owned separately by issue 10.

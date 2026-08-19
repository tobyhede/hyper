# 03 — Recompose Card and Alias panes from form primitives

**What to build:** Make the opened Markdown Card and new Alias surfaces shared design-system forms, retaining their one atomic Edit and their existing Done, Cancel and Escape semantics.

**Blocked by:** 01 — Establish the shadcn design-system baseline.

**Status:** resolved

- [x] Card and Alias fields, descriptions, validation errors, target picker and actions compose shared form and dialog primitives.
- [x] A pane still commits only through Done; Cancel and Escape still discard all pending values, and no field independently commits or intercepts Escape.
- [x] Ladle shows real production-pane states including validation, long content, picker empty/refusal states and keyboard-focus-relevant variants.

## Audit note

The production opened-Card surface now uses the shared Dialog and form
primitives, but the catalogue proves only its ordinary interactive state. Add
fixed, real-component stories for validation, long content, empty and refused
Target choices, and the focus states named above. Card-choice architecture is
owned separately by issue 10.

## Answer

The Base UI Dialog delivery had already replaced the hand-rolled pane and
preserved ADR 0048's one-completion lifecycle. This extraction finished the
form boundary: `OpenCard` and `NewAlias` now compose the shared `FieldGroup`,
`Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `FieldTitle`, `Input`
and `Textarea` exports rather than maintaining raw form controls alongside the
design system. `CardPicker` remains the established cmdk presentation; Issue 10
still owns consolidating the Card-choice model.

Five stable, iframed stories mount the real production `OpenCard` and
`NewAlias` components for long Markdown content and validation, an opened Alias
with no eligible Target, a refused Alias edit, Alias creation with no eligible
Target, and refused Alias creation. Six Ladle browser tests prove the atomic
validation/cancellation behavior, pending refusals, empty-state explanations,
initial Target focus, stale-refusal clearing and catalogue isolation. The
matching application proofs remain in `OpenCard.test.tsx`, `NewAlias.test.tsx`,
`card-creation.test.tsx`, `card-authoring.test.tsx` and `editing.spec.ts`.
The isolation proof found that `CardPane` still portalled to the catalogue's
global document; it now resolves its portal container from the rendered
content's `ownerDocument`, keeping the dialog and focus trap inside the story
iframe while real catalogue navigation remains usable.

The opened Markdown and Alias forms own their validation/refusal state locally,
so their deterministic stories reach those states through the same `Done`
interaction production uses. Injecting a fixed error would add a story-only
state seam, which ADR 0052 forbids. `NewAlias` receives its refusal from its
caller, so that story does load the refused state directly through the existing
production prop. Focus variants need no alternate fixture: the Markdown and
opened-Alias stories assert their Title focus, while new Alias asserts its
different Target-first contract.

### Donor accounting

- Retained from the settled Issue 03 design: shared form primitives, real
  production-component stories, iframed modal isolation, long content,
  validation, empty Target choices, refusal states and focus behavior.
- Reconciled with main: Base UI Dialog semantics, ADR 0048's `Done`/Cancel/
  Escape contract, ADR 0049's Alias-only metadata form, and ADR 0051's removal
  of shared Card Description.
- Deferred to Issue 10: replacing the inline `CardPicker` with the one shared
  Card-choice behavior and its two presentations.
- Rejected from the donor: its superseded visual redesign, Graph-colour rail,
  discard-confirmation interaction, renamed `Ok` action and alternate
  combobox. None is required by this issue or current accepted ADRs.

### Verification

- `pnpm verify` — passed: 129 test files, 1,296 tests passed, 8 skipped; UI
  catalogue, both typecheck layers, lint, formatting and coverage all passed.
- `pnpm e2e` — passed: 97 tests.
- `pnpm e2e:ladle` — passed: 15 tests.

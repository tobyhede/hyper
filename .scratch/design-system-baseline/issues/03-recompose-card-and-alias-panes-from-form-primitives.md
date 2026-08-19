# 03 — Recompose Card and Alias panes from form primitives

**What to build:** Make the opened Markdown Card and new Alias surfaces shared design-system forms, retaining their one atomic Edit and their existing Done, Cancel and Escape semantics.

**Blocked by:** 01 — Establish the shadcn design-system baseline.

**Status:** resolved

- [x] Card and Alias fields, descriptions, validation errors, target picker and actions compose shared form and dialog primitives.
- [x] A pane still commits only through Done; Cancel and Escape still discard all pending values, and no field independently commits or intercepts Escape.
- [x] Ladle shows real production-pane states including validation, long content, picker empty states, the shared submission-error treatment and keyboard-focus-relevant variants.

## Audit note

The production opened-Card surface now uses the shared Dialog and form
primitives, but at the time of this note the catalogue proved only its
ordinary interactive state — validation, long content, empty and refused
Target choices, and the focus states named above still needed fixed,
real-component stories. The Answer below records that delivery. Card-choice
architecture is owned separately by issue 10.

## Answer

The Base UI Dialog delivery had already replaced the hand-rolled pane and
preserved ADR 0048's one-completion lifecycle. This extraction finished the
form boundary: `OpenCard` and `NewAlias` now compose the shared `FieldGroup`,
`Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `FieldTitle`, `Input`
and `Textarea` exports rather than maintaining raw form controls alongside the
design system. Issue 10 now consolidates Card choice on the donor's Base UI
editable combobox.

Three stable, iframed stories mount the real production `OpenCard` component
for long Markdown content and validation, an opened Alias with no eligible
Target, and the shared Card Editor submission-error treatment. Four Ladle
browser tests prove the atomic validation/cancellation behavior, pending
submission errors, empty-state explanations
and catalogue isolation. The obsolete New Alias stories were removed after the
picker and dialog design port. The
matching application proofs remain in `OpenCard.test.tsx`, `NewAlias.test.tsx`,
`card-creation.test.tsx`, `card-authoring.test.tsx` and `editing.spec.ts`.
The isolation proof found that `CardPane` still portalled to the catalogue's
global document; it now resolves its portal container from the rendered
content's `ownerDocument`, keeping the dialog and focus trap inside the story
iframe while real catalogue navigation remains usable.

The opened Markdown and Alias forms own their validation/error state locally,
so their deterministic stories reach those states through the same `Done`
interaction production uses. Injecting a fixed error would add a story-only
state seam, which ADR 0052 forbids. Focus variants need no alternate fixture:
the Markdown and opened-Alias stories assert their Title focus; New Alias focus
remains covered by application tests.

### Donor accounting

- Retained from the settled Issue 03 design: shared form primitives, real
  production-component stories, iframed modal isolation, long content,
  validation, empty Target choices, submission-error states and focus behavior.
- Reconciled with main: Base UI Dialog semantics, ADR 0048's `Done`/Cancel/
  Escape contract, ADR 0049's Alias-only metadata form, and ADR 0051's removal
  of shared Card Description.
- Delivered with Issue 10: the donor's editable combobox replaces both prior
  picker presentations.
- Ported from the donor after design review: its card-editor composition and
  Graph-colour rail. The current `Done`, Cancel and Escape contract remains;
  the donor's discard confirmation and renamed `Ok` action do not.

### Verification

- `pnpm verify` — passed: 128 test files, 1,289 tests passed, 8 skipped; UI
  catalogue, both typecheck layers, lint, formatting and coverage all passed.
- `pnpm e2e` — passed: 97 tests.
- `pnpm e2e:ladle` — passed: 13 tests.

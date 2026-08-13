# Rebuild the Card pane on Radix Dialog, with one submit over its fields

Status: done

Type: task

Surfaced by: the decision session that resolved issues `15`, `16` and `17`

This is package **4a** of the implementation sequence: corrective work on what
package 4 built, ahead of package 4b (Alias body drag) and package 5. It builds
what ADRs 0047 and 0048 decided. Read both before starting — the reasoning is
there and is not repeated here.

## Two changes, in this order

### 1. `CardPane` becomes a Radix Dialog

`packages/app/src/components/CardPane.tsx` hand-rolls what
`@radix-ui/react-dialog` ships: the focus trap (`containTab`), the pointer
containment (`containFocus`), the initial-focus effect and its `StrictMode`
idempotency workaround, `role="dialog"`, `aria-modal`. Replace it. Add
`@radix-ui/react-dialog` to `@project/ui`'s dependencies, beside the two Radix
primitives already there — the primitive layer stays Radix (ADR 0047).

Escape closing the pane arrives as the primitive's own behaviour rather than as
a rule this repo writes, which is what makes change 2 below a deletion.

**Prove this first, before anything else in this ticket.** Radix's modal layer
sets `pointer-events: none` outside the content and locks scroll, over a React
Flow canvas that has opinions about pointers, and `Dialog` restores focus to its
trigger on close through the same `FocusScope` machinery whose `setTimeout`
cleanup already required the `onCloseAutoFocus` guard on `AddCardControl`. If
either cannot be reconciled, **stop and record it** — a recorded, interrogated
reason is exactly what ADR 0047 asks for, and it is a legitimate outcome. What
is not legitimate is keeping the hand-roll without writing one.

Focus after close stays `App`'s (see `CardPane`'s own comment on why restoring
from the component is wrong here); Radix's restore has to be declined or
reconciled with it deliberately, not left to fight it.

### 2. One submit over the pane's fields

Today `MarkdownCardEditor` owns the `<form>`, the `Done` submit and the
validation, with the occurrence fields rendered above and outside it — and two
of the pane's fields commit without waiting for Done: the **Target** on select,
and the **occurrence Title** on blur and Enter.

Move the form and the actions to the pane. All four fields pend:

| Field | Commits |
| --- | --- |
| occurrence Title | Done |
| Target | Done |
| Description | Done |
| Markdown source | Done |

- **Escape is an alias of Cancel** — discard every pending field, close. It is
  the primitive's dismissal and needs no handler of its own.
- **Remove the three in-pane field Escapes**: `CardPicker`'s search clear,
  `OccurrenceTitleEditor`'s restore, `NewAlias`'s Title restore. Their tests go
  with them.
- **`CardTitleEditor` on the canvas is untouched.** Blur commits, Escape
  reverts. That is the other half of ADR 0048 and it is already correct.
- **`NewAlias` keeps committing on Target selection.** It has no Done — the
  selection *is* the completion — and it has no content editor to hold a draft.
  Its Title field loses only its Escape handler.
- **A pending Target does not preview.** The content editor keeps editing the
  current Target and its labels keep naming that Card until Done.
- Done fires two existing completions: `edited-card` on the Alias through
  `editAlias` (title and Target differ only in which key the change carries),
  and `edited-card` on the content Card. **No new completion, no reopening of
  package 3's interface.** If this ticket appears to need a sixteenth
  completion, something has gone wrong — stop and say so.
- Validation moves with the form: an empty occurrence Title is refused at Done,
  beside the content editor's own refusals, through the `retargetRefusal`
  display path that already exists in `OpenCard`.

`CONTENT_EDITORS`' compile-time obligation changes shape with it — a content
kind supplies a field group reporting values and validity, not an editor that
completes itself. Keep the obligation compile-time; that property is the point
of the registry.

## Tests

- Type into the content editor, choose a different Target, assert the typed body
  is **still there** (issue `17`, assertion inverted).
- Type into the content editor, press Escape, assert the pane is gone and the
  Space is unchanged — `card-authoring.test.tsx:344` already asserts this and
  keeps its assertion.
- Edit all four fields, press Done, assert one Alias Edit and one content Card
  Edit, and that Cancel before Done leaves the Space untouched.
- The three removed field Escapes lose their tests rather than gaining new ones.
- E2E: the dialog swap is focus and pointer behaviour over a live canvas, so it
  needs `pnpm e2e` and not only unit tests. Warning #008, consecutive
  connections and the canvas's own pointer handling are the things a
  `pointer-events` regression would break silently in jsdom.

## Review findings this ticket inherits

Three findings from the review of PR #65 were deferred here rather than fixed on
that branch, because this ticket deletes or rewrites the code each is about.
Fixing them first would have been work thrown away, and leaving them unrecorded
would have been work lost — they are acceptance criteria below, not notes.

- **The pane's actions scroll out of reach.** `.card-pane__actions` is a child of
  the scrolling `.card-pane__editor`, so `Cancel` and `Done` scroll away with the
  fields. `editing.spec.ts:1258` has to wheel 600px to reach `Cancel`, and that
  wheel is the standing evidence — **delete it with the fix rather than leaving a
  passing test that describes the defect.** The comment at `styles.css:743-745`
  says the actions do not scroll, which is false today; moving the form and the
  actions to the pane is what makes it true.
- **`containFocus` cancels mousedown on a scrollbar.** It prevents the default on
  anything outside `input, textarea, button`, which includes the scrollbars the
  pane grew when it started scrolling — so dragging one does nothing. Reported as
  plausible and **not verified in a real browser**; Radix owns the containment
  after this ticket, so confirm it is gone rather than re-deriving it. If Radix's
  own dismissal layer reintroduces it, that is a finding worth its own note.
- **`PANE_CANCEL_ATTRIBUTE` is in the wrong module, and `NewAlias` carries no
  marker.** It sits in `OpenCard.tsx:20-23` rather than beside `PANE_FOCUSABLE`,
  and `NewAlias`'s `Cancel` has no marker at all. `PANE_FOCUSABLE` lives in the
  `CardPane` this ticket replaces, so where both belong is decided by what the
  Radix composition leaves standing — decide it once, in one module, and give
  both panes' Cancel the same treatment.

## Records to amend with the build

Already amended by the decision session: the keyboard contract's two-stage
Escape and `Shift` assignment, the transient-authoring contract's Escape section
and Retarget row, `alias-creation-and-retargeting.md`'s single-step retarget,
and the handoff's interaction matrix and Out of scope.

Left for the build: `OpenCard.tsx`'s comment at the content-editor key, which
still points at issue `17` and should point at ADR 0048; and AGENTS.md's
`CardPane` and primitives descriptions once the swap lands.

## What the build settled that the ticket left open

Three decisions the ticket asked for and could not take in advance.

**The modal layer could not be absorbed quietly, and the answer was to widen the
modality rather than to punch a hole in it.** `.card-pane` was `absolute` inside
the graph area, so the header sat outside the backdrop — and Radix takes
`pointer-events` off everything outside its content and `hideOthers` takes it out
of the accessibility tree, neither by halves. Leaving it there gave an
undimmed toolbar that answered nothing. Re-enabling pointer events on the header
was weighed and rejected: it would have restored a mouse-only capability that
assistive technology still could not reach, and every path it restored — change
the renderer, resolve a persistence conflict — already discarded the open
draft silently. So `.card-pane` is `position: fixed` and the app is behind the
pane. `editing.spec`'s "changing the renderer closes an opened Card" moved to
`navigation.test.ts`, which is where `selectRenderer` clearing the opened Card
lives; the e2e in its place watches the app go behind the pane and come back,
which is the `pointer-events`-not-restored regression jsdom cannot see.

**`aria-modal` is gone.** Radix 1.1.23 does not write it — `hideOthers` is its
modality — and adding it back would be a hand-rolled attribute beside a
primitive that has already answered the question (ADR 0047). The assertion that
insisted on it now names the trade.

**The pane-cancel marker was deleted rather than rehomed.** `PANE_CANCEL_ATTRIBUTE`
and `abandonsThePane` existed so a field committing on blur could tell the blur
on its way to `Cancel` apart from every other one. With all four fields pending
to `Done`, no field in a pane commits on blur, so there is nothing for either
pane's `Cancel` to carry. The acceptance line below is checked as "one home, and
that home is nowhere".

**A fourth, found by the review of this branch.** `completeOpenedCard` discarded
its `AuthoringResult`, so `Done` closed the pane whether the content Card's Edit
landed or not. That predates this ticket, but two Edits over one press turn it
from a silent no-op into a *half*-applied one — the occurrence authored, the
content refused, the draft gone with the surface. It now answers its refusal the
way `onEdit` does, and the pane stays open holding every draft. Atomicity across
the two is still not available and is no longer claimed: there is no dry run for
a completion, so the Space's refusal of the second is only knowable by making
the first.

Also worth knowing for the next pane: `hideOthers` means a role query cannot see
the graph while a pane is open, so a test reaching a node behind one goes by test
id. And Enter in a single-line field now submits the form, which is the
platform's rule and means `Done` — the Alias rename tests press it deliberately.

## Acceptance

- [x] `CardPane` composes `@radix-ui/react-dialog`, or a recorded interrogated
      reason says why it cannot.
- [x] `containTab`, `containFocus` and the initial-focus effect are deleted, not
      kept beside the primitive.
- [x] Four fields, one Done, one Cancel; Escape reaches neither by a handler of
      this repo's. `App`'s window listener went with them.
- [x] The three in-pane field Escapes are gone; `CardTitleEditor`'s is not.
- [x] Retarget under a dirty content draft preserves the draft — unit and E2E.
- [x] The actions do not scroll with the fields, `editing.spec.ts`'s 600px wheel
      is deleted, and `styles.css`'s comment about them is true.
- [x] A scrollbar inside the pane can be dragged — asserted as a mousedown inside
      the pane that nothing cancels.
- [x] The pane-cancel marker has one home, and both panes' `Cancel` carry it —
      resolved by deletion; see above.
- [x] `pnpm verify` and `pnpm e2e` both green, output reported.

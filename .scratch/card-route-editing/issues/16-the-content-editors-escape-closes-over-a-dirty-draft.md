# The content editor's Escape closes the pane over a dirty draft

Status: needs-triage

Surfaced by: review of the Card and Alias creation branch against the keyboard
contract, while fixing the same defect in the two fields that branch added

## Context

The keyboard contract
(`prototypes/keyboard-authoring-contract.md:173-183`) gives Escape one topmost
owner and orders them:

> A field draft consumes the first Escape without closing its containing
> surface; a second Escape may then close that surface.

The transient-authoring contract says the same thing in the dirty/clean terms
that make it testable (`prototypes/transient-authoring-contract.md:95-105`), and
the acceptance matrix carries it as a row —
`implementation-handoff.md:93`, "Dirty field restores value before surface
closes", against **Edit/open Card**.

Five editors answer Escape. Four now comply:

- `CardPicker` — clears its search, then yields (`CardPicker.tsx:78-91`).
- `NewAlias`'s Title — restores the empty string, then yields.
- `OccurrenceTitleEditor` — restores the stored title, then yields.
- `CardTitleEditor` (`react-flow-adapter/src/CardNode.tsx:103-116`) — cancels the
  draft and stops the event; its containing surface is the canvas, which is not
  closed, cleared or deselected, so the ordering holds.

The fifth does not. `MarkdownCardEditor` (`app/src/components/OpenCard.tsx:113-118`)
binds Escape on the `<form>` and cancels unconditionally, so one press on a
dirty **Title**, **Description** or **Markdown source** discards the draft *and*
closes the pane. There is nothing to undo it with.

This is **not** a defect the Card and Alias creation branch introduced. The
identical handler is on `main` (`git show main:packages/app/src/components/OpenCard.tsx`,
lines 138-145). The two fields that branch added copied its shape, which is how
it was found; those two are fixed and this one is left, because fixing it is not
a like-for-like change.

## Why this is not `ready-for-agent`

Two accepted records disagree, and neither is obviously the survivor.

`.scratch/opening-is-editing/issues/01-the-card-pane-is-one-editable-surface.md`
is resolved, and its **Answer** (`:31-32`) is the reason the code reads as it
does:

> `Escape` still cancels, and now closes with it: there is no reading state
> behind the editor to fall back to.

That is a real argument from ADR 0037: collapsing reading into editing removed
the state a first Escape used to fall back *to*. Note the same ticket's own
acceptance checkbox (`:16`) says the opposite — "`Escape` cancels, as it already
does, and does not close the Card out from under a draft" — so the ticket
contradicts itself and the Answer is what shipped.

Against it, the handoff's authority order (`implementation-handoff.md:13-21`)
ranks "3. The complete keyboard specification" above "5. This handoff" and above
the prototypes, and `opening-is-editing` is not in that list at all. On the
records as written, the keyboard specification wins.

What makes it a judgement call rather than a lookup is the behaviour, not the
paperwork. This pane holds **three** drafts, not one. "Restore the opened values
and keep the Card open" (`transient-authoring-contract.md:65`) is written as one
row over all three, so a first Escape in the body would revert an edited Title
the author had moved on from — a wider undo than the field-scoped one the other
four editors give, and arguably a surprise of its own. The alternatives are to
scope the restore to the focused field, to restore all three, or to keep the
current behaviour and amend the contract. Choosing decides what Escape means on
the surface an author spends the most time in.

## Cost of the change

One test asserts the current behaviour directly and would have to be rewritten,
not merely adjusted: `packages/app/test/card-authoring.test.tsx:344`, "cancels
the edit on Escape without committing the draft" — it types into **Markdown
source**, presses Escape, and asserts the pane is gone. Its comment cites ADR
0037.

Three existing tests are safe either way, because their field is pristine when
Escape is pressed: `packages/app/test/OpenCard.test.tsx:482`,
`packages/app/e2e/overview.spec.ts:215`, and
`packages/app/test/card-authoring.test.tsx:430` (which presses Escape on the
panel rather than in a field).

Nothing else in the suite is affected.

## Acceptance

- [ ] The disagreement is settled in favour of one record, and the losing one is
      amended rather than left standing — a new ADR if ADR 0037's reasoning is
      being refined, an amendment to the keyboard contract if it is not.
- [ ] If the two-stage rule wins, the restore's scope is decided explicitly:
      the focused field, or all three drafts on the pane.
- [ ] `card-authoring.test.tsx:344` is rewritten to whichever behaviour is
      chosen, with the pristine-field case kept as its own test so "Escape never
      closes" cannot be read into it.

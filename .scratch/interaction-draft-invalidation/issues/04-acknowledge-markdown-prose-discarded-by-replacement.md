# Accepting a stored Space discards an opened Card's Markdown draft with no acknowledgement

Status: ready-for-agent
Tags: release/v1

Surfaced by: resolving `02-interaction-draft-invalidation-is-mostly-already-covered.md`

## Context

`02` closed the invalidation question at the owning seams and deferred one
product decision: what an author should see when a replacement discards a draft.
It deferred it conditionally — "unless a reachable surface can still hold
destructive local prose at the moment Accept remote is invoked" — and
`03-focus-after-space-replacement.md` says to file that decision against the
concrete interaction if such a surface exists. One does.

An open Card's Markdown body is edited through `MarkdownCardBody`, which holds
the draft as component-local state (`packages/ui/src/MarkdownCardBody.tsx:111`).
It is drawn by `CanvasCard`, which is its only consumer that offers an editor,
and reached through `CardNode` — so the draft lives **inside** the canvas
subtree, and both of the mechanisms that already discard the canvas's own drafts
reach it. Measured against a staged draft, each is independently sufficient:
deleting the `key={authoringState.replacementEpoch}` at `packages/app/src/App.tsx:1102`
leaves the discard intact, so does disabling the render adapter's epoch reset at
`packages/app/src/render-adapter.ts:633-644`, and only removing **both** lets the
editor and the typed prose survive over the accepted Space's Card. That is the
same redundancy the contract test already records for the inline Title draft.

So the discard is not the gap. **The gap is that nothing says anything.** After
Accept remote the editor is gone, the prose is gone, the accepted Space's body is
drawn in its place, and the status panel reads `Persisted`. The two mechanisms
that did the discarding are a React key and a store reset; neither knows a draft
existed, and ADR 0042 is explicit that the epoch is invalidation rather than a
registry.

The draft survives everything that disposes of the other title drafts. ADR 0064
gives this editor no commit on blur — four exits and no more, `Mod-Enter`,
`Escape`, Save and Cancel, and "a click elsewhere leaves the draft and the editor
up" (`docs/adr/0064-opening-a-card-expands-it-in-place.md:39-40`, `:103`). So the
modal `AlertDialog` carrying Accept remote takes focus without ending it: with
the dialog up, the editor is still mounted, the prose is still on screen and the
working Space still holds the unedited body. That is the difference from the
inline Title field, whose blur *is* its commit, and which the same modal
therefore commits before the author can reach Accept remote.

`02` reasoned from the contract test that no such surface was reachable. The test
does say a Markdown draft cannot be staged
(`packages/app/test/replacement-invalidation.test.tsx:252-257`) — but the reason
it gives is a property of that fixture, not of the product: opening a Card is
itself an authored commit, so it trips the fixture's deliberately waiting
conflict before body editing can begin. A Card that *starts* Open never needs
opening, and in the running application the conflict comes from a remote write,
which can arrive at any point after the body editor is already live.

This is the case `02`'s own Comments called the weak one: "the discarded draft
can be a paragraph of Markdown they typed, and the pane vanishes with no
acknowledgement that anything was lost."

## Decision — taken 2026-09-04

**The loss is acknowledged, before the click rather than after it, in the
conflict dialog that already carries the choice.**

The decisive fact arrived after the audit and is not in the Context above:
**`keepLocalWork` does not advance the epoch** (`packages/app/src/space-authoring.ts:1449`;
the only bump is `:1433`). So of the two buttons the conflict dialog offers,
Reload destroys the draft and Keep local and retry preserves it, and the author
is choosing between them with nothing to say which is which. `acceptStoredSpace`
has exactly one trigger — `App.tsx:961`, that dialog — so a sentence there
covers every reachable case.

An after-the-fact status line was the other candidate and is rejected: the
information is only actionable while the dialog is up, and afterwards it is an
apology for something with no undo.

**Three consequences, each of which retires an open question.**

The existing copy half-does the job already. `CONFLICT_DESCRIPTIONS['reload']`
(`packages/app/src/components/PersistenceControl.tsx:47`) says "Reload discards
your local changes" — true of the Space and silent about prose that is not in
it. This is a change to that sentence, not a new surface.

**The scoping question dissolves.** A sentence describing what Reload *does*
does not need to know what happens to be open, so "long-form prose or drafts
generally" no longer has to be answered: the warning is unconditional.

**No draft signal is needed.** `editingCardBody`, and the dirty-vs-untouched
distinction that would have required `MarkdownCardBody` to publish dirtiness,
are both out of scope. Nothing subscribes to the epoch for this.

**The accepted cost, stated rather than discovered later.** This is weaker than
a report. An author who does not read the dialog still loses prose without being
told. That is the trade taken at this size: the alternative buys a notice that
arrives too late to act on.

## Direction

The discard stays exactly where it is. Both mechanisms that perform it — the
canvas key at `packages/app/src/App.tsx:1102` and the render adapter's epoch
reset at `packages/app/src/render-adapter.ts:633-644` — are untouched, and so is
ADR 0042's rule that interaction-local owners discard on the epoch. Nothing new
observes the epoch.

What changes is one string. The reload description must name the unsaved editing
Reload ends, in terms the author recognises — the text they have typed into an
open Card and not saved — and must make the contrast with Keep local and retry
legible, since that is the exit that preserves it. Keep it one sentence longer
than it is; a dialog with no safe dismissal is not the place for a paragraph.

`CONFLICT_DESCRIPTIONS` is keyed by `ConflictRecovery`, and only the `reload` arm
is in question. `revert` reloads too and carries the same cost; decide it in the
same edit rather than leaving the two arms disagreeing about whether the warning
is worth giving. `none` offers no Reload and needs nothing.

**This no longer depends on the notice channel.** An earlier revision of this
ticket paired it with
`.scratch/error-feedback-pattern/issues/03-the-notice-alert-becomes-a-component.md`,
on the assumption a status line would land on that channel. The decision above
puts the acknowledgement in the conflict dialog instead, so the two are now
independent and can land in either order.

Do not fold the focus decision in from `03-focus-after-space-replacement.md`;
the two are separate transitions that happen to share a trigger. (That is this
effort's `03`, not the error-feedback effort's.)

## Acceptance

- [x] The acknowledgement decision is made and recorded here.
- [x] Whether it is scoped to long-form prose or to drafts generally is
      recorded: neither, because the warning describes what Reload does rather
      than what is open.
- [ ] The conflict dialog's Reload description names the unsaved Card editing
      Reload ends, and the `revert` arm is decided in the same edit.
- [ ] Accepting a stored Space while an opened Card's Markdown draft is live
      still discards it, and the accepted Space still wins. No new epoch
      subscriber, no `editingCardBody` read, no dirtiness published from
      `@project/ui`.
- [ ] A test pins that behaviour against an interaction that can actually hold
      the draft. The contract-test fixture stages it with one field: give the
      Card `open: true` (with the ADR 0066 `openSize`) in `LOCAL`'s placement.
      The Card is then Open at rest, `Edit Markdown source of Local card` is on
      screen, and clicking it mounts the editor with no Edit authored —
      persistence stays `settled` — so the conflict can be raised afterwards
      with the draft already live.
- [ ] A test pins that Keep local and retry leaves the draft alive, which is the
      contrast the new sentence promises and the reason it is worth giving.
- [ ] `pnpm verify` and `pnpm e2e` pass. `pnpm e2e:ladle` applies —
      `PersistenceControl` has stories, and `packages/app/ladle-e2e/issue-14-space-sidebar.spec.ts`
      already drives the conflict dialog.

## Comments

### 2026-09-04 — audit of this ticket's own claims

Investigated and re-measured. The product question stands and is unanswered; the
mechanics the Context asserted did not, and the body above is corrected against
the tree rather than left to drift further. What changed and why:

- **"`OpenCard` mounts it from `App.tsx:597`, outside the canvas subtree keyed on
  `replacementEpoch` at `:541`" was wrong the day it was written.** At `b7144163`
  (2026-08-28) that mount was guarded by `openedCard?.kind === 'alias'`, and
  `OpenCard.tsx:73` said so itself: "The Alias metadata form. Markdown Cards
  author their front in `CanvasCard`." The Markdown body had moved into the
  canvas two days earlier (`1212feb8`, 08-26). `OpenCard.tsx` has since been
  deleted entirely under ADR 0070.
- **"Discarded instead by Navigation: `openFresh` publishes `openedCardId: null`
  (`navigation.ts:164`)" is now false outright.** The field existed on 08-28 but
  was never what discarded a Markdown draft; it was removed in `fd9df4e6`
  (08-31) when Open/Closed became the Layout's (ADR 0064). `openedCardId` appears
  nowhere in `packages/`.
- **"Nothing observes the epoch" was too broad.** Two things do, and the K/R/K+R
  mutation results above are measured, not reasoned. What is true is the narrower
  claim the Context now makes: nothing *reports* the discard.
- **The Direction named a seam that does not exist** — "the point Navigation
  resets". Navigation resets nothing on this path. It now names Space Authoring's
  epoch bump, and the two existing App surfaces that a report would use.

This is the third round of citation drift on this effort; `76b8f708` re-measured
issue `02`'s references for the same reason. Every file:line above was read at
`e31eaa68`.

### 2026-09-04 — related effort filed

`.scratch/error-feedback-pattern/` was opened after an investigation into
whether persistence error handling should become the application-wide error
pattern. It should not — persistence is the one surface that departs from the
pattern ADR 0057 already sets — and the three tickets there bring it onto that
pattern, normalise where a refusal stops being an identity and starts being a
sentence, and give the notice channel the component the blocking channel already
has.

This ticket's status is unchanged and stays `ready-for-human`: the
acknowledgement decision is still unmade, and nothing in that effort makes it.
What that effort changes is only the cost of implementing whatever is decided
here.

### 2026-09-04 — decision taken

Recorded above; status moved to `ready-for-agent`. Two things changed from what
this ticket assumed when it was filed.

The candidate shapes were a status line after the fact, a confirmation before,
or retaining the text. The first was the assumed answer and is rejected — it
arrives after the only moment it could be acted on. The chosen shape is the
second, and it turned out much cheaper than the ticket implied: the dialog, its
copy table and its two buttons all exist, and one of those buttons already
preserves the draft.

The dependency on the error-feedback effort is gone with it. The acknowledgement
is not a notice, so it needs no notice component, and
`.scratch/error-feedback-pattern/issues/03` and this ticket no longer have to be
sequenced or decided together.

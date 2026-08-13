# Retargeting an Alias discards an uncommitted content draft

Status: resolved

Surfaced by: review of the Card and Alias creation branch

## Context

Open an Alias `A′` whose Target is `A`, type several paragraphs into
**Markdown source of A** without pressing Done, then choose `B` in the Target
picker. The typed body is gone: no prompt, no commit, and nothing to undo it
with.

The mechanism is exact and none of its parts is wrong on its own:

1. `onSelect` on the Target picker calls `onRetarget`
   (`packages/app/src/components/OpenCard.tsx:454`), which is `editAlias` in
   `App.tsx:807`.
2. `editAlias` commits an `edited-card` Edit on the Alias unconditionally
   (`App.tsx:538-550`). It consults no draft, because it has none to consult.
3. The pane's `content` is re-resolved from the Space, so `content.id` becomes
   `B`.
4. `ResolvedContentEditor` is keyed `` `${opened.id}:${content.id}` ``
   (`OpenCard.tsx:467-473`), so the key changes, the editor unmounts, and
   `useState(card.body)` reseeds from `B`.

Step 4 is not a bug and must not be "fixed" by relaxing the key. Two tests exist
precisely to hold it: `OpenCard.test.tsx:332` ("never shows one Card's draft
under another Card's identity") and `:359` ("never carries a draft between two
Aliases of the same Card"). A draft surviving into `B`'s editor would be
committed to `B` on Done, which is worse than losing it.

**This is new on this branch.** The key is the same on `main`
(`git show main:packages/app/src/components/OpenCard.tsx`, line 429), but there
is no `CardPicker`, no `onRetarget` and no `OccurrenceAuthoring` there, so
nothing could change `content.id` while the pane was open. Package 4 made the
loss reachable without deciding what should happen.

## Why this is not `ready-for-agent`

The records are silent, and at least three answers are defensible.

What they do say is about other things:

- `prototypes/transient-authoring-contract.md:67` — `| Retarget Alias |
  Unconfirmed Target picker value | Selecting a different eligible Target |
  Restore current Target |`. The only draft it names for retargeting is the
  picker's own.
- `prototypes/transient-authoring-contract.md:65` — `| Edit Markdown | Dirty
  title/description/body in the open Card | Explicit completion under the
  existing Card editor contract | Restore the opened values and keep the Card
  open |`. That is cancellation, not a Target change under a dirty body — and it
  cuts mildly *against* silent loss.
- `prototypes/alias-creation-and-retargeting.md:96-99` — "Changing Target is one
  atomic Edit. The Alias keeps its id, independent title, positions, selection
  and incident Route Edges." Silent on the content draft.
- `implementation-handoff.md:95` — same, in the acceptance matrix.

The three answers:

**Discard, but say so.** Keep the behaviour and warn before committing the
retarget. Cheapest to reason about, but it puts a confirmation in front of a
gesture the prototype deliberately made single-step ("Choosing a Target commits,
so there is no unconfirmed Target to hold across a confirmation step").

**Refuse while the content editor is dirty**, with a sentence saying so. Fits
the `refused` vocabulary (ADR 0042) and needs no new interaction, but the pane
does not currently know whether its child editor is dirty — that state would
have to be lifted, and a Target the author cannot choose without first
abandoning their edits may read as a bug of its own.

**Hold a draft per content Card** in the pane, so retargeting away and back
restores it. Loses nothing and does not violate the two tests above, since
drafts stay keyed to the Card they belong to. But it makes the pane hold state
across identities, which is the thing the key was introduced to prevent, and the
lifetime of a draft for a Card no longer shown is undefined.

Choosing between them decides what an authoring surface owes an author's
uncommitted work, which is a product question rather than one the records settle.

## What is not being asked

Not whether the content swap itself is right. It is: the delegated pane shows
the content of the Card it targets, so a completed retarget must show `B`.

## Acceptance

- [x] One of the three answers is chosen and recorded — an ADR if it establishes
      a general rule for uncommitted drafts at an identity change, the handoff
      if it is local to this operation.
- [x] Whichever is chosen, a test types into the content editor and then
      retargets, so the decision is pinned rather than re-derived.
- [x] The comment at `OpenCard.tsx`'s content-editor key points at the outcome
      instead of at this ticket.

## Answer

**None of the three. The retarget stops committing on selection**, and the loss
this ticket describes stops being reachable. `ADR 0048` records it.

All three answers offered here — confirm, refuse-while-dirty, hold a draft per
content Card — guard step 1's consequence. None of them asks why step 1 happens
at all. The Target sits on a pane with **Done** and **Cancel**, and it was the
only field on that pane that committed the moment it was touched. Every other
field pends. Pending the Target too means no Edit at selection, so no change to
the Space, so no change to `content.id`, so no remount and no draft to lose.
There is nothing left to refuse, confirm or hold.

This deletes the defect rather than answering the question the ticket asked, and
the question it asked — what an authoring surface owes an author's uncommitted
work at an identity change — turns out not to arise here, because the identity
no longer changes under an open draft.

**Steps 3 and 4 are untouched and still right.** A completed retarget must show
`B`, the key must stay, and the two tests holding it stand. What moved is *when*
the retarget completes, which is now Done, along with the occurrence Title, the
Description and the Markdown source. One submit over four fields, and Cancel
finally means something for all of them.

**What it costs, in full in ADR 0048 and in summary here:** the content editor
stops owning its `<form>` and its actions, so `CONTENT_EDITORS`' compile-time
obligation becomes a field group that reports values and validity rather than an
editor that completes itself. One Done then fires two existing completions on two
Cards — `edited-card` on the Alias through `editAlias`, `edited-card` on the
content Card. No sixteenth completion, no reopened interface.

The pending Target does **not** preview: while it is pending, the content editor
keeps editing the current Target and its labels keep naming that Card. Done
commits both and closes the pane, so there is no half-retargeted state to
explain.

The pinning test this ticket asked for still applies, with its assertion
inverted: type into the content editor, choose a different Target, and the typed
body is **still there**.

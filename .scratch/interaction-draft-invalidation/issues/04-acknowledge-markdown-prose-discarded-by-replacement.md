# Accepting a stored Space discards an opened Card's Markdown draft with no acknowledgement

Status: ready-for-human
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
the draft as component-local state (`packages/ui/src/MarkdownCardBody.tsx:110`).
`OpenCard` mounts it from `packages/app/src/App.tsx:597`, outside the canvas
subtree keyed on `replacementEpoch` at `:541`, so the key that covers the
canvas's own drafts does not reach it. It is discarded instead by Navigation:
`acceptStoredSpace` calls `openFresh`, which publishes an opened state carrying
`openedCardId: null` (`packages/app/src/navigation.ts:164`), the pane unmounts,
and the typed prose goes with it. Nothing observes the epoch and nothing says
anything.

The draft survives everything that disposes of the other title drafts. ADR 0064
gives this editor no commit on blur — four exits and no more, `Mod-Enter`,
`Escape`, Save and Cancel, and "a click elsewhere leaves the draft and the editor
up". So the modal `AlertDialog` carrying Accept remote takes focus without
ending it. That is the difference from the inline Title field, whose blur *is*
its commit, and which the same modal therefore commits before the author can
reach Accept remote.

`02` reasoned from the contract test that no such surface was reachable. The test
does say a Markdown draft cannot be staged
(`packages/app/test/replacement-invalidation.test.tsx:247-253`) — but the reason
it gives is a property of that fixture, not of the product: opening a Card is
itself an authored commit, so it trips the fixture's deliberately waiting
conflict before body editing can begin. In the running application the conflict
comes from a remote write, which can arrive at any point after the body editor is
already live.

This is the case `02`'s own Comments called the weak one: "the discarded draft
can be a paragraph of Markdown they typed, and the pane vanishes with no
acknowledgement that anything was lost."

## Decision required

Whether a replacement may silently discard an opened Card's Markdown draft, and
if not, what the author sees instead. The discard itself is not in question —
ADR 0042 requires it, and the accepted Space is authoritative. What is open is
whether the loss is acknowledged, and the plausible shapes differ in cost and in
what they promise: a status line reporting it after the fact, a confirmation
ahead of Accept remote naming what will be lost, or retaining the text somewhere
the author can recover it. Only the first two are consistent with ADR 0042's
existing requirement that interaction-local owners discard on the epoch.

The answer also settles whether this generalises. If acknowledgement is wanted
here, the reason is that the draft is long-form prose rather than that it is a
draft, so the policy should name that property rather than the surface.

## Direction

Any acknowledgement is App composition's, not the editor's. `MarkdownCardBody`
holds the draft but knows nothing of replacement, and ADR 0042 is explicit that
the epoch is invalidation rather than a registry — so a surface that must
*report* a discard needs the fact carried at the point Navigation resets, not a
new subscriber inside `@project/ui`. Keep the discard where it is and add only
the reporting.

Do not fold the focus decision in from `03`; the two are separate transitions
that happen to share a trigger.

## Acceptance

- [ ] The acknowledgement decision is made and recorded here.
- [ ] If acknowledgement is adopted, whether it is scoped to long-form prose or
      to drafts generally is recorded with it.
- [ ] Accepting a stored Space while an opened Card's Markdown draft is live
      behaves as decided, and the accepted Space still wins.
- [ ] A test pins that behaviour against an interaction that can actually hold
      the draft — which the current contract-test fixture cannot stage, since
      opening authors a commit that trips its waiting conflict.

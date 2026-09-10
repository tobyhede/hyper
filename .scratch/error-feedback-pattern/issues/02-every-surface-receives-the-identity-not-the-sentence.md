# Every surface receives the identity, not the sentence

Status: ready-for-agent

Blocked by: nothing. `01-bring-persistence-onto-the-refusal-pattern.md` owned
the fifth prose site, `acceptStoredSpace`, because that one *originates* the
sentence and needed new codes minted for it. **`01` landed on 2026-09-10**, so
that site is gone: it answers a `StoredSpaceRefusal` and `ConflictControl`
describes it. The sites here are now the whole of what still answers a refusal
as `string` — five at the last count, not the four this ticket was filed with;
see the Context below.

**Sequence this after `command-dock/07`.** Three of them live in
`SpaceSidebar.tsx` and `OpenSpaceSidebars.tsx`, which that ticket deletes
outright — its acceptance criterion is that both files are gone rather than
unused. Doing `02` first means writing the fix into files that then vanish, and
the Dock inherits the same two contracts unexamined. `CardsDrawer`'s is the one
site independent of it.

Surfaced by: investigating whether persistence error handling should be
extracted as the application-wide error pattern — see `spec.md`.

## Context

ADR 0057 puts the boundary in one place: the identity crosses the seam and the
application turns it into a sentence at the surface conducting the interaction.
The tree has that boundary in two places, and which one a call site uses is
arbitrary.

`SpaceSidebar` takes both contracts in one props type. `createLayout.refusal` is
an `AuthoringRefusal` (`packages/app/src/components/SpaceSidebar.tsx:141`) and
the component describes it itself (`:719`). `selectedCard.onDelete` answers
`() => string | null | Promise<string | null>` (`:173`, and `:218` on the row
component) — a sentence someone else already wrote — and the component stores
and renders it as opaque text (`:282`). `titleEdit` is the second instance of
the same pairing: `error` is a `string | null` (`:324`) and `onComplete` answers
one (`:333`), both filled by `App.tsx:635`'s `completeSpaceChromeTitle`, which
calls `describeAuthoringRefusal` and hands the sidebar the finished sentence.
Two rules, one file, same kind of thing — and twice over, because both prose
members sit in that props type beside the structured `createLayout.refusal`.

The rest of the prose side:

- `CardsDrawer` holds `useState<string | null>` for its Add refusal
  (`packages/app/src/components/CardsDrawer.tsx:149`) and takes an `onAdd`
  answering one (`:44`).
- `SpaceSidebar`'s `onDelete` chain forwards the sidebar's string upward through
  `OpenSpaceSidebars` (`SpaceSidebar.tsx:868`).
- `EmbeddedLayoutAuthoring` takes a `removeCard` answering `string | null`
  (`packages/app/src/components/EmbeddedLayoutAuthoring.tsx:24`) and fills it by
  calling `describeAuthoringRefusal` itself (`:158-163`); `SpaceCanvas:788`
  stores what comes back as opaque text. **This one post-dates the survey
  above** — it arrived with the embedded Layout work — so the count is five, not
  four, and a sixth may exist by the time this is worked. Re-derive the set with
  `grep -rn "=> string | null" packages/app/src/` rather than trusting the
  list.

A fifth site, `App.tsx`'s `onAcceptRemote`, was the same defect but not the
same change: `acceptStoredSpace` wrote its sentences itself rather than
describing a code someone else produced, so giving it an identity meant minting
codes. That was `01`'s, and it is done — `StoredSpaceRefusal` crosses the seam
and `ConflictControl` describes it, with `App.tsx` unchanged because it passes
the function straight through. It is recorded here as the worked example of
what the rest need.

This is not cosmetic. A surface handed a sentence cannot decide the channel,
cannot attribute the refusal to a field, and cannot be held to an exhaustive
mapping — the three things the placement records in `authoring-refusal.ts` exist
to give it. Every prose-side call site is a surface that has opted out of the
compiler check that a new refusal code has somewhere to go.

## What to build

Move them all to the identity. Each surface receives the structured refusal and
calls the one translator at the point it renders. Re-derive the set first — it
has grown once already.

## Direction

**`describeAuthoringRefusal` becomes the only producer of a refusal sentence.**
That is the invariant worth having and it is checkable: once no operation
answers `string`, the only path from a code to prose runs through
`authoring-refusal.ts`, and the placement records govern every surface.

**Do not centralise the channel while doing this.** Which channel a refusal
takes is the surface's own answer — an inline `Alert` in the drawer, an `Alert`
inside the delete dialog, a `FieldError` on an endpoint, a screen-fixed sentence
for a gesture that is over. `docs/agents/ui.md` states that rule and it is not
what this change touches. Moving prose to identity leaves every channel exactly
where it is.

**Delete-refusal placement already has a home.** `presentEdgeDeletionRefusal`
(`authoring-refusal.ts`) is the shape a surface with no field to correct takes —
total by construction rather than by a table, and documented there as to why.
Card deletion is the same case and should reuse that reasoning rather than grow
a second exhaustive record saying `form` twenty-four times.

## Acceptance

- [ ] Every site here answers a structured refusal or `null`: `onDelete`, its
      `OpenSpaceSidebars` chain, `titleEdit`'s `error` and `onComplete`, the
      Cards drawer's Add, and `EmbeddedLayoutAuthoring`'s `removeCard` — plus
      anything `grep -rn "=> string | null" packages/app/src/` finds that this
      list does not name.
- [ ] `describeAuthoringRefusal` is the only function in the tree that produces
      a refusal sentence, and a test or lint holds that. With `01` landed this
      is exhaustive; alone it leaves `acceptStoredSpace` as the one exception,
      which the check should name rather than silently permit.
- [ ] Every channel is where it was: the drawer's inline `Alert`, the delete
      dialog's `Alert`, the conflict dialog's `Alert`, the sidebar's `Alert`,
      and `InlineTitleEditor`'s `FieldError`. This change is invisible on
      screen.
- [ ] `pnpm verify` and `pnpm e2e` pass. `pnpm e2e:ladle` applies too —
      `SpaceSidebar` and `CardsDrawer` both have stories.

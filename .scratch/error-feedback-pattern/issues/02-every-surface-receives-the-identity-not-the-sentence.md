# Every surface receives the identity, not the sentence

Status: ready-for-agent

Blocked by: nothing. `01-bring-persistence-onto-the-refusal-pattern.md` owns the
fourth prose site, `acceptStoredSpace`, because that one *originates* the
sentence and needs new codes minted for it. The three here only describe too
early and mint nothing, so the two tickets are independent and either may land
first. Together they retire the last operation in the tree that answers a
refusal as `string`.

Surfaced by: investigating whether persistence error handling should be
extracted as the application-wide error pattern — see `spec.md`.

## Context

ADR 0057 puts the boundary in one place: the identity crosses the seam and the
application turns it into a sentence at the surface conducting the interaction.
The tree has that boundary in two places, and which one a call site uses is
arbitrary.

`SpaceSidebar` takes both contracts in one props type. `createLayout.refusal` is
an `AuthoringRefusal` (`packages/app/src/components/SpaceSidebar.tsx:119`) and
the component describes it itself (`:547`). `cardLinks.onDelete` answers
`() => string | null` (`:138`) — a sentence someone else already wrote — and the
component stores and renders it as opaque text (`:163`, `:183`). Two rules, one
file, same kind of thing.

The other three on the prose side:

- `CardsDrawer` holds `useState<string | null>` for its Add refusal
  (`packages/app/src/components/CardsDrawer.tsx:108`, rendered `:189`).
- `SpaceSidebar`'s `onDelete` chain at `:699` forwards the sidebar's string
  upward through `OpenSpaceSidebars`.

A fourth site, `App.tsx:961`'s `onAcceptRemote`, is the same defect but not the
same change: `acceptStoredSpace` writes its sentences itself
(`space-authoring.ts:1416`, `:1420`) rather than describing a code someone else
produced, so giving it an identity means minting codes. That is `01`'s, and
`ConflictControl` (`PersistenceControl.tsx:178`, `:195`) moves with it.

This is not cosmetic. A surface handed a sentence cannot decide the channel,
cannot attribute the refusal to a field, and cannot be held to an exhaustive
mapping — the three things the placement records in `authoring-refusal.ts` exist
to give it. Every prose-side call site is a surface that has opted out of the
compiler check that a new refusal code has somewhere to go.

## What to build

Move all four to the identity. Each surface receives the structured refusal and
calls the one translator at the point it renders.

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

- [ ] The three sites here answer a structured refusal or `null`: `onDelete`,
      its `OpenSpaceSidebars` chain, and the Cards drawer's Add.
- [ ] `describeAuthoringRefusal` is the only function in the tree that produces
      a refusal sentence, and a test or lint holds that. With `01` landed this
      is exhaustive; alone it leaves `acceptStoredSpace` as the one exception,
      which the check should name rather than silently permit.
- [ ] Every channel is where it was: the drawer's inline `Alert`, the delete
      dialog's `Alert`, the conflict dialog's `Alert`, the sidebar's `Alert`.
      This change is invisible on screen.
- [ ] `pnpm verify` and `pnpm e2e` pass. `pnpm e2e:ladle` applies too —
      `SpaceSidebar` and `CardsDrawer` both have stories.

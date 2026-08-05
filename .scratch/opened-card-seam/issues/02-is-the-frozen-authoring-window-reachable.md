# Is the frozen-authoring window reachable?

Status: resolved

## Context

Verified against `1ab90b2`. `App` renders the pane only when both halves
resolve:

```tsx
{openedCard && openedContent && ( <OpenCard … /> )}
```

If `openedContent` failed to resolve while `openedCardId` was still set, the
pane would disappear and nothing would bring it back: `openCardForEditing`
returns early on `if (openedCardId !== null) return;`, and
`titleEditingEnabled={openedCardId === null}` withdraws every Card's inline
title affordance for as long as a Card is open. No Card would offer anything,
and authoring would look frozen until the author guessed `Escape`.

The same hole has a second half the original finding did not name: `openedCard`
itself can be `undefined` — a card id that is no longer in the Space — with
identical consequences.

## Question

Is either state reachable through a public seam? A fix is one line
(`closeCard()` where the opened Card resolves and its content does not), but it
is untestable defensive code if nothing can reach it, and untestable code in a
window this narrow is worse than the argument that it is unnecessary.

## Answer

**Not reachable, either half.** No code was added.

The chain, each link already pinned by an existing test:

1. The rendered Space is `readWorkingSpace(sessionState.working)`
   (`packages/app/src/snapshot.ts`), which runs `loadSpaceSnapshot` and
   **throws** rather than returning a Space when the snapshot fails intake. An
   invalid Space never reaches the render at all.
2. `loadSpaceSnapshot` → `buildSpace` → `validateReferences`
   (`packages/graph/src/validate.ts`) rejects all three ways an Alias can fail
   to resolve: `unresolved-alias-target`, `alias-self-reference` and
   `alias-targets-alias`. Pinned in `packages/graph/test/validate.test.ts`.
   `resolveContentCard` follows at most one hop, so for every Card *in* a
   validated Space it is total.
3. Every commit passes the same intake, so an Edit cannot install a Space in
   which a drawn Card stops resolving. Nothing in the app writes an Alias
   document anyway: the pane completes markdown documents, and the inline
   editor changes only a title.
4. `acceptStoredSpace` validates the remote snapshot *first*, and on acceptance
   calls `navigation.openFresh(renderer)`, which installs the initial
   Navigation state — `openedCardId: null`. A replaced Space cannot leave an
   opened Card behind it.
5. Structural Card deletion is not built (ADR 0033's remaining half), so there
   is no gesture that removes the Card the second half would need.
6. `openCardForEditing` only ever opens an id in `editableCardIds`, which is
   filtered by `resolveContentCard(...) !== undefined` in the first place.

`App.tsx` already carries a comment saying the `editableCardIds` filter cannot
currently remove a Card and why it stays — the same reasoning from the other
end.

### What would reopen this

Structural Card deletion. The moment a Card can be removed while one is open,
the `openedCard` half becomes reachable directly, and the `openedContent` half
becomes reachable through an Alias whose target was deleted — unless deletion
takes the Alias with it, which is itself a decision that will have to be made.
Whoever builds deletion should close this window in the same change, with a
test that deletes an open Card, rather than adding the guard now against a
gesture that does not exist.

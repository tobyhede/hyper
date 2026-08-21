# `arrangement` is retired vocabulary and the code is full of it

Status: resolved

Surfaced by: a review comment on one occurrence in `edge-authoring-react.tsx`

## Context

`CONTEXT.md` retires **arrangement** three times over, under three different
terms:

- **Placement** — `_Avoid_: arrangement (ADR 0005 — applying a strategy produces
  no separate entity), layer.`
- **Layout strategy** — `_Avoid_: arrangement (applying a strategy produces no
  separate entity — the cards themselves carry the positions), algorithm,
  engine.`
- **Algorithmic View** — `_Avoid_: layout, arrangement, algorithm.`

The word is nevertheless the working vocabulary of `packages/app/src`, in about
twenty comments across eleven modules, and in one **live discriminant**:

```
packages/app/src/canvas-content.ts:6:   | { readonly kind: 'arrangement' }
packages/app/src/canvas-content.ts:22:  if (hasArrangement) return { kind: 'arrangement' };
packages/app/src/App.tsx:725:          ) : canvas.kind === 'arrangement' ? (
```

`hasArrangement` is a named value in the same seam. `AGENTS.md` uses the word in
prose too, and an e2e test name reads "its one card is draggable once its
automatic arrangement resolves".

## The right replacement is Placement, and it is not Layout

The review comment that surfaced this proposed **Layout**, which is wrong and
worth recording so the next reader does not repeat it. `CONTEXT.md`'s Placement
entry draws the distinction the substitution would erase:

> A **Layout** is the authored thing a Space holds; the placement is the map
> inside it.

Every site found here means the map, not the authored thing. Several of them are
specifically about a surface that has **no** Layout: an Algorithmic View resolves
a placement, is authorable on the strength of it, and only becomes a Layout when
an edit converts it (ADR 0025). "Before a Layout resolves" would state the
opposite of the rule.

`layout` is also itself in the Algorithmic View `_Avoid_` list, so the proposal
swapped one retired word for another.

## Why this is its own ticket

`docs/agents/workflow.md`:

> Never let a rename ride along with a structural change. Separate commits —
> otherwise the diff is unreadable and, when something breaks, you cannot tell
> which change did it.
>
> A repo-wide rename conflicts with everything, so it should run alone, and
> early.

Package 7 fixed the one comment a reviewer pointed at, because it was a one-word
prose correction in a file already under review and it rides along with nothing.
The remaining twenty sites plus a discriminant are a vocabulary sweep, and
sweeping them into an Edge Authoring branch is what that rule exists to prevent.

## What the work is

1. `arrangement` → `placement` through `packages/app/src`, comments included.
2. The discriminant: `{ kind: 'arrangement' }` → `{ kind: 'placement' }` in
   `canvas-content.ts`, its reader in `App.tsx`, and `hasArrangement` with it.
   Check `canvas-content.test.ts` and anything asserting on the union.
3. `AGENTS.md`'s prose, and the e2e test name in `new-space.spec.ts`.
4. Decide whether `CONTEXT.md` should say anything about the *verb*. "A strategy
   arranges Cards" is ordinary English and the `_Avoid_` entries are all about
   the noun naming an entity. If the verb stays legal, say so, or the next sweep
   will take it too.

Run alone, and before anything else queued, per the rule above.

## Answer

Superseded by `.scratch/render-layer-vocabulary/issues/01-purge-arrangement-from-app.md`,
which did the sweep. Read that ticket's Answer for what landed; the line numbers
quoted above no longer exist.

**Item 2 of "What the work is" was wrong and was deliberately not done.** The
discriminant is `{ kind: 'cards' }` and the parameter `hasCardsOnCanvas`, not
`'placement'` / `hasPlacement`. That rename would have collided with
**Placement** on the one case the seam exists for: `hasCardsOnCanvas` stays true
while a *replacement* placement is still `'pending'`, because the editor keeps
drawing the previous Cards rather than blanking mid-recompute — so naming it
after the placement would have named it after the very thing it can disagree
with. `AGENTS.md` now carries that as a standing rule so the suggestion does not
come back.

**Item 4 is answered: the verb stays legal, and `CONTEXT.md` needed no edit to
say so.** It already defines a Layout strategy as "a named strategy for
arranging a space's cards". The `_Avoid_` entries are about the noun naming an
entity ADR 0005 rejected; `arrangeFixture`, the `arrange` test helper and "the
thing that arranges Cards" are all correct as they stand. `AGENTS.md` records
this alongside the rule above, which is where a sweeping agent will actually
read it.

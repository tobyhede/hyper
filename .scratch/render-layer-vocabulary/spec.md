# Purge "arrangement" from the render layer

Source: domain-modeling session, 2026-08-20 — following on from ADR 0057's
structured `AuthoringRefusal` work, which caught `arrangement-pending` naming
its refusal after a word `CONTEXT.md` explicitly avoids.

## Problem

`CONTEXT.md` lists "arrangement" under `_Avoid_` three times — for **Placement**,
for **Layout strategy**, and for **Algorithmic View** — because ADR 0005
rejected a separate "arranged" entity: applying a strategy populates fields on
the same value, it does not produce a second kind of thing. `packages/graph`
honours this; `packages/graph/src/layout.ts` even cites the avoid-list in its
own doc comment.

`packages/app` does not. "Arrangement" is used throughout as informal prose
for "Cards are currently drawn on the canvas," and in one place it is load-bearing
naming rather than prose: `CanvasContent`'s `'arrangement'` kind and the
`hasArrangement` parameter that produces it (`canvas-content.ts`).

That render-layer usage is not simply a stray synonym for Placement, and a
blind find-and-replace to "placement" would be wrong. `canvas-content.test.ts`
already documents the real distinction: "A resolved placement is not yet an
arrangement on screen" — `hasArrangement` can be true while a *replacement*
placement is still `'pending'`, because the editor keeps drawing the previous
one rather than blanking the canvas mid-recompute. So the concept is "Cards
currently mounted on the canvas, which may lag the latest placement
computation," not the placement value itself. It needs a name that is (a) not
"arrangement" and (b) does not collide with **Placement**, since something can
have this property while its placement is still pending.

`CONTEXT.md`'s render-layer section is scoped to React Flow's own vocabulary
and explicitly forbids inventing a bridging term there ("Nothing in the domain
should be named after one, and no bridging term should be invented between the
two"). This concept is not React Flow's either — it is `packages/app`'s own
render-adapter bookkeeping — so it most likely wants a local, well-chosen
identifier rather than a new `CONTEXT.md` glossary entry. `CONTEXT.md` should
stay a domain glossary; this is implementation detail belonging in
`docs/agents/rendering.md` at most.

## Scope

Prose-only sites (comments, doc comments) across `App.tsx`,
`canvas-projection.ts`, `connection-completion.ts`, `render-adapter.ts`,
`edge-authoring.ts`, `components/SpaceCanvas.tsx`, `components/CanvasCentre.tsx`,
`components/PlacementFailure.tsx`, `placement-rendering.ts`, `navigation.ts`,
and the matching test files — reword away from "arrangement" toward what is
actually meant in each spot ("placement," "the Cards drawn on the canvas,"
etc., picked per sentence rather than one global synonym).

The one load-bearing site, `canvas-content.ts` — `CanvasContent`'s
`'arrangement'` kind and the `hasArrangement` parameter — needs a deliberate
replacement name for "Cards are currently mounted on the canvas, independent
of whether a new placement is being computed." Candidate: `'drawn'` /
`hasDrawnPlacement`, or `'cards'` / `hasPlacedCards` — pick one, do not leave
two spellings.

`packages/graph/src/grid.ts:15` and `packages/graph/src/space.property.test.ts:55`
also use "arrangement" in prose despite being in the package that otherwise
honours the avoid-list; reword those too.

## Not in scope

Nothing in `packages/graph`'s `LayoutStrategy` contract changes — ADR 0005's
decision (no separate arranged-result type) stands as-is; this is a naming
sweep, not a structural change.

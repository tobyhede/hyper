# Card size as a ratio, from one source of truth

Status: resolved
Blocked by: 01 (resolved)

## Context

A card's size is declared twice today:

- `packages/app/src/App.tsx` — `CARD_WIDTH = 260`, `CARD_HEIGHT = 300`, handed to `buildLayoutGraph` so the layout can place cards and ports.
- `packages/app/src/styles.css` — `.rf-card-node__inner { width: 260px }` and `.card--node { height: 300px }`, which is what actually gets drawn.

Nothing keeps them in sync. If they drift, the layout computes port offsets against a card shape that is not the one on screen, and the rails detach from the cards. It is silent and it would look like a layout bug.

Once cards are titles (issue 01) their content is bounded and uniform, so the size is a design constant rather than anything measured. ELK's coordinate space is not pixels either — React Flow's zoom and `fitView` map it to the viewport — so what the layout needs is a *shape*, and any nominal base unit will do.

## Task

Express the card as an aspect ratio plus a nominal base, in one place, consumed by both the layout and the stylesheet.

Open question for whoever picks this up: the current 260×300 is portrait (≈0.87). If a card is a title-sized unit rather than a clipped page, the natural proportion may be quite different, and it is worth choosing deliberately rather than inheriting.

## Acceptance

- Card dimensions are declared once. Changing the ratio changes both the layout and the rendering, with no second edit.
- No pixel dimension for a card node remains hardcoded in `styles.css`.
- `pnpm verify` and `pnpm e2e` green.

## Also

Delete the README "next improvement" that reads *"Feed measured card sizes into ELK (via `useNodesInitialized`) so cards can be variable-height"*. ADR 0006 removes the need for it: measurement earns its keep only when node sizes vary, and uniform title-sized cards do not. Leaving it listed would have someone build it.

## Answer

Declared once in `packages/app/src/card.ts`.

```ts
export const CARD_ASPECT_RATIO = 16 / 10;
const BASE_WIDTH = 260;
export const CARD_WIDTH = BASE_WIDTH;
export const CARD_HEIGHT = Math.round(BASE_WIDTH / CARD_ASPECT_RATIO);  // 163
```

The layout takes `CARD_SIZE`; the stylesheet takes `cardSizeVars`, applied to the
graph container as `--card-width` / `--card-height`. `styles.css` has no card
pixel dimension left in it. Changing the ratio changes both, with no second edit.

**Ratio: 16:9**, answering the question this ticket left open — after a false
start at 16:10.

The first pass picked 16:10 on the grounds that a title-sized card is a label and
its ratio is a legibility question, since Markdown reflows and a card has no fixed
canvas to preserve. That reasoning holds but asks the wrong question. The better
one: *would matching the slide ratio be better UX?* A card in the graph and the
same card presented are one object, so they should share a silhouette — and
aligning them costs exactly one number.

16:9 is the ratio of the medium a presentation lands on. Projectors and external
displays are overwhelmingly 16:9; laptops are 16:9 or 16:10, and phones are far
taller (19.5:9 to 20:9) and not a target for presenting. It also removes a future
migration: if ADR 0006's "show full content" view arrives and a card becomes a
live preview of a slide, a mismatched ratio would have to be fixed along with any
content authored against it.

Either way the card is now landscape rather than the inherited 260x300 portrait,
so height drops from 300 to 146 and far more of a space fits on screen — which is
the point of an overview.

**The coupling is recorded, not implicit.** `card.ts` states that if the
presentation surface's ratio changes, this must change with it. The other half —
actually giving the presentation surface a 16:9 frame — is `04`, because it does
not have one today: `PresentationLayer` is a bottom overlay whose height follows
its content.

The base width is arbitrary and the file says so. ELK lays out in its own
coordinate space and React Flow's zoom maps it to the viewport, so only the
proportion is a design decision — which is the point of expressing it as a ratio.

**Guarded by e2e**, not just by having one constant: the test reads the custom
property off the graph container and compares it against the computed width and
height of a rendered card. Computed styles are unaffected by React Flow's zoom
transform, so this catches drift between "the size the layout used" and "the size
actually drawn" — the failure mode that would otherwise look like a layout bug.

README's "feed measured card sizes into ELK via `useNodesInitialized`" is deleted
as this ticket required, and the fixed-size entry under limitations is rewritten:
it is now correct behaviour rather than a shortcoming, because content adapts to
the card.

`pnpm verify` 57 tests green, `pnpm e2e` 9 green.

# Card size as a ratio, from one source of truth

Status: open
Blocked by: 01

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

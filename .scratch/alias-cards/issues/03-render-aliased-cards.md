# Render aliased cards

Status: resolved

## Context

An alias shows another card's content at a second position. The renderer needs to resolve through to the target's markdown, and the viewer needs some signal that they are seeing the same content again rather than new material — otherwise a route that redraws content reads as repetition rather than deliberate return.

## Task

Call the `graph` alias resolver (ADR 0009 — resolution lives in `graph`, not the adapter) from the projection to draw the target's content, and decide the visual treatment with the user. The "same content again" signal is the on-screen decision issue 01 deferred to here; a differently-titled alias is already one such signal, so weigh whether more is needed once it's rendered.

**Add an alias to the bundled demo here** (issue 02 leaves it untouched). This is the issue that renders one, so it is where an alias earns its place in the example — an author-requested redraw, `C…C'`, that reads forward. Keep the demo's routes compatible (their unioned step-order acyclic), the property multi-route rendering relies on.

## Acceptance

- An alias card renders its target's content.
- Editing the target changes every place it appears (single source of truth, per `CONTEXT.md`).
- A route stepping through an alias reads forward, with no back-edge.

## Answer

Built test-first. `pnpm verify` green (68 tests), `pnpm e2e` green (14).

**Resolution.** Added `resolveContentCard(manifest, cardId)` to `@project/graph` — a markdown card is its own content card, an alias resolves to its target, one hop (ADR 0009). The app's two content read sites (the deck slide and the opened card) now go through it via a `markdownForCard` helper; the card keeps its own title, only content resolves. The adapter's projection also calls it to put the target's title on an alias node's data.

**Signal — decided on screen.** Chose a subtle marker over title-only. Title-only is fragile precisely where our create-default (default an alias's title to its target's) would produce identical titles — two "The data model" boxes reading as repetition. So an alias node now carries a muted subtitle naming the card it redraws, prefixed with an inlined `corner-down-right` glyph (`↳ The data model`). This is robust regardless of title. The opened and deck surfaces stay title-only — the content plus the alias's own title suffices there. No icon dependency: the glyph is a hand-inlined SVG path, matching the house pattern (the Select chevron in `@project/ui`).

**Demo.** Added `model-recap` (alias → `model`) and a `deep` route (`intro → model → rendering → model-recap`) — a within-route forward redraw. The union of all three routes stays acyclic, so it overlays cleanly; the recap draws as a forward box, no back-edge. This shifted several exact-count e2e assertions (3 routes, 7 cards, 10 edges, 20 ports), updated accordingly.

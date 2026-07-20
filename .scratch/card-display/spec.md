# A card in the graph shows its title

Source: conversation 2026-07-20, recorded as [ADR 0006](../../docs/adr/0006-cards-show-titles-in-the-graph.md).

## Problem

Every card in the graph renders its full markdown body inside a fixed 300px node with `overflow: hidden`. Any card longer than a paragraph is clipped mid-sentence, and at the zoom levels where more than a few cards fit on screen the text is illegible anyway. Content-at-a-glance is already an illusion; what it costs is the ability to read the *shape* of the space, which is what a graph is for.

It also drags structure with it. `projectCardNodes` takes a `markdownByCardId` map and embeds every card's body into every node's `data`, eagerly, for text that is then clipped. And the card's size exists twice — `CARD_WIDTH`/`CARD_HEIGHT` in `App.tsx` for the layout, `width: 260px` / `height: 300px` in `styles.css` for the render — with nothing keeping them in sync. Drift between them would place ports where the card isn't.

## Direction

The graph draws a card's **title**, and later an optional short description. Content is reached by **opening** the card (shown in place) or by the **Presentation** view (fullscreen, stepped).

Opening is one verb across card kinds. ADR 0001 already has a viewer opening a space card to explore its nested graph in place; opening a markdown card to read it is the same gesture on a different kind, not a second concept. Whatever this builds should not foreclose that.

A title-sized card is bounded and uniform by construction, so its dimensions become a ratio constant rather than a measurement — see issue 02.

## Constraints

- ADR 0006 — this is a **View** decision. The card still has its content; the graph view chooses not to draw it. Do not move content out of the domain model.
- ADR 0001 — opening a space card must be able to reuse this gesture.
- Titles-only cannot ship alone. Without an open interaction, overview mode has no way to read a card at all, and content is reachable only by entering presentation. Issue 01 covers both.
- `pnpm e2e` asserts node/edge/port counts and the presentation step counter. Those survive, but any assertion reading card *body* text in the graph will not.

## Issues

- `01-title-only-cards-and-open` — the change proper: title-only nodes, an open interaction, and content out of the projection.
- `02-card-size-as-ratio` — one source of truth for card dimensions, expressed as a ratio.
- `03-card-description` — the optional short description on a card.
- `04-presentation-surface-ratio` — give the presented card the 16:9 frame the card ratio now assumes.

## Not in scope

View configuration ("show full content", per-view display options) is a later evolution. ADR 0006 puts it in the View, so it has somewhere to live; nothing here should be built to anticipate it.

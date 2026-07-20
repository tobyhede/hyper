# Make the presentation surface match the card

Status: open

## Context

`card-display/02` set the card's ratio to **16:9 explicitly to match the
presentation surface**, so that a card in the graph and the same card being
presented share a silhouette. The card side of that is done. The presentation
side is not.

`PresentationLayer` is currently a bottom overlay, not a slide: `.presentation` is
pinned to `bottom: 1.25rem` at `width: min(720px, 100% - 2rem)`, and
`.presentation__slide` is capped at `max-height: 45vh` with its own scrollbar. It
has no ratio at all — it is a panel whose height follows its content.

So the coupling `card.ts` documents is currently one-sided. Nothing enforces it
and nothing yet honours it.

## Task

Give the presentation surface a 16:9 frame, so what an audience sees is the shape
the graph promised.

Decide, and record:

- **Does content that overflows the frame scroll, or does the frame grow?** If it
  grows, the ratio is decorative and this ticket is pointless — so probably
  scroll, which makes a card genuinely slide-like and implies authoring guidance
  ("a card should fit on a slide").
- **Fullscreen or a framed overlay?** ADR 0006 says presentation steps through
  content "fullscreen". The current overlay is neither, and the graph behind it is
  still doing work — the active card is highlighted and the viewport fits to it.
- **What happens on a non-16:9 viewport** (a 3:2 Surface, a phone, an ultrawide):
  letterbox the frame, or let it fill? Letterboxing is what preserves the promise.

## Constraints

- Whatever ratio this surface ends up at, `CARD_ASPECT_RATIO` in
  `packages/app/src/card.ts` must change with it. That file says so; this ticket
  is the other half.
- `OpenCard` is a *reading* surface, not a presentation one — it may legitimately
  differ, since opening a card is not presenting it. Decide deliberately rather
  than by default.

## Acceptance

- The presented card occupies a 16:9 frame.
- A viewport that is not 16:9 does not silently change the shape of the content.
- The relationship between this and `card.ts` is recorded in both places.

# Make the presentation surface match the card

Status: partly resolved — see Answer; the 16:9 frame itself is still open

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

## Answer (part 1: open and presentation are one surface)

The ticket was written around the wrong question. It asked what shape the
presentation surface should be, treating it as a thing separate from the reading
surface. It is not separate.

**Opening shows a card. Presenting steps through cards and opens each one.** The
only difference is the footer: a Close button, or the step controls.

`PresentationLayer` is deleted. `OpenCard` takes a `footer` node, and `App` passes
`PresentationControls` while presenting and a Close button otherwise. The card
shown is derived rather than stored — `presenting ? activeCardId : openedCardId` —
so there is no second piece of state that could disagree.

The bottom-pinned `.presentation` / `.presentation__slide` styles are gone.
Presenting now uses the centred `.open-card` overlay, so the two surfaces cannot
drift apart visually because there is only one of them.

This reverses a call made in `card-display/01`, which argued the two could not
share a component because `PresentationLayer` was built around step controls that
an opened card has no use for. That reasoned from the shapes that happened to
exist rather than from what they should be — the step controls are the *only*
difference, which is an argument for sharing, not against it.

E2E pins it: opening by hand and presenting produce a panel at the same position
and width, with the footer being the only thing that changes.

## Still open

The frame itself. Neither surface has a ratio — `.open-card__panel` is
`min(760px, 100%)` wide, capped at `80vh`, scrolling. `card.ts` still asserts that
the card ratio matches the presentation surface, and that remains one-sided.

The decisions listed above (fixed 16:9 frame or not, overflow behaviour,
letterboxing on a non-16:9 viewport) are unchanged and still need answering — but
they now apply to *one* surface rather than two, and whatever is decided applies
to reading and presenting alike unless a reason emerges to split them.

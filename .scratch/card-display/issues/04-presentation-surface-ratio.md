# Make the presentation surface match the card

Status: resolved

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

## Answer (part 2: the frame)

All three decisions, taken once, because there is one surface.

**Fixed 16:9 frame.** `.open-card__panel` is `aspect-ratio: 16 / 9`, matching
`card.ts`. The coupling that file asserted is no longer one-sided, and it now
names `.open-card__panel` so the two can be found from each other.

**Letterbox, not fill.** The width is clamped by the viewport's *height* as well
as its width:

```css
width: min(1100px, 100%, calc((100vh - 8rem) * 16 / 9));
```

On a tall narrow viewport the height clamp binds; on an ultrawide one the width
clamp does. Either way the frame keeps its shape and the backdrop takes up the
slack, so a viewport that is not 16:9 never silently reshapes the content.

**Content scrolls; the frame does not grow.** This is what makes the ratio mean
anything — a frame that grows to fit its content has no ratio in practice. The
frame clips (`overflow: hidden`) and a `.open-card__content` region inside it
scrolls.

Scrolling was chosen over scaling content to fit (illegible at any useful zoom)
and over paginating a card across several frames (a much larger feature that would
change what a Step means — a card would no longer be one position in a route).

**The actions never scroll.** They sit outside the scrolling region, so the step
controls stay reachable at any point in a long card. This is the reason the panel
needed an inner content element at all.

## Consequence worth knowing

A card longer than the frame now scrolls during a presentation, which is a poor
way to present. That is a signal to authors that a card should fit, and it is
visible rather than silent. Whether to make it *more* visible — an authoring
warning, or a "this card overflows" affordance — is deliberately not built here.

E2E covers all three: the frame holds 16:9 at 1440x900, 900x1200 and 2200x700; a
small viewport makes the demo's longest card overflow and it scrolls rather than
the frame growing; and the actions stay within the frame.

**Known limitation, tracked as `05`.** The frame has a fixed *ratio* but not a
fixed *size*, and type is fixed in `rem`, so how much content fits depends on the
viewer's window — which is why the overflow test has to shrink the viewport to
provoke scrolling. "Does this card fit?" therefore has no stable answer for an
author. The fix is the established one: a fixed logical canvas scaled uniformly.

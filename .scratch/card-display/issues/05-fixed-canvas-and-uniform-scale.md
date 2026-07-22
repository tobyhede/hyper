# Scale the card frame from a fixed logical canvas

Status: resolved — obsoleted by ADR 0011

## Context

`04` gave the card frame a fixed 16:9 ratio, but not a fixed *size* — the frame
grows and shrinks with the viewport while type stays fixed in `rem`.

So the amount of content that fits depends on the window. The demo's longest card
fits comfortably at a 1100px-wide frame and overflows at 483px, which is why `04`'s
overflow test has to shrink the viewport to demonstrate scrolling at all.

**"Does this card fit?" therefore has no stable answer.** An author cannot know
whether a card will scroll for a viewer, because it depends on the viewer's
screen. That undermines what the fixed ratio was for.

## The established solution

A fixed logical canvas plus a uniform scale. reveal.js is the reference — it lays
out at a nominal size (960x700 by default) and applies `transform: scale()` to fit
the viewport, bounded by min/max scale. impress.js, Slidev and Spectacle do the
same. Everything scales together, so a card is identical at every size and
overflow becomes a property of the content rather than of the window.

Two ways to implement it:

**`transform: scale()`** on a fixed-size element. Exact fidelity, including
positioned content. Costs: text is rasterised then scaled, so it softens; and it
complicates hit-testing, scroll offsets and any coordinate maths inside the frame.

**Container query units.** `container-type: size` on the frame, root type in
`cqh`/`cqw`, everything inside in `em`. Text renders natively at its final size,
so it stays crisp and selectable, and if every dimension is proportional the line
breaking is identical to the scaled version.

Recommendation: **container query units.** Our content is reflowable Markdown, not
positioned objects, so we do not need pixel-exact fidelity — and the frame is
already a fixed ratio, which is the precondition. It also keeps text as text for
selection, search and screen readers.

## Explicitly not in scope

**Per-card autofit** — PowerPoint's "shrink text on overflow", which reduces font
size on the cards that need it. Implemented everywhere, and still the wrong
choice: it makes typography inconsistent across a deck and hides an authoring
problem rather than surfacing it. Uniform scaling of the whole canvas is the part
worth taking.

## Task

Give the frame a logical size, express the content's typography and spacing
proportionally to it, and let the frame scale.

Decide and record:

- **The logical size.** 1280x720 is the obvious 16:9 choice. It has to agree with
  `CARD_ASPECT_RATIO` in `packages/app/src/card.ts`, which already couples the
  graph card to this frame — a third thing joins that coupling.
- **Minimum scale.** Below some size the text is unreadable however faithfully it
  scales. reveal.js clamps; we should say what happens on a phone.
- **Whether the graph card scales the same way.** It shows only a title today, so
  it may not need this — but if ADR 0006's "show full content" view arrives, the
  graph card becomes a live preview and must scale identically.

## Acceptance

- Whether a card overflows is independent of viewport size.
- A card looks the same at every frame size — same line breaks, same proportions.
- `04`'s overflow test no longer needs to shrink the viewport to provoke scrolling;
  it can assert against a card that overflows the canvas, full stop.


## Narrowed by ADR 0008

reveal.js solves this for the deck: `PresentationDeck` configures a 1280x720
logical canvas and reveal scales it to the viewport. That was one of the reasons
for adopting it.

What remains is the **reading** surface (`.open-card__panel`), which is still ours
and still has a fixed ratio without a fixed size — so whether a card overflows
when *read* still depends on the window. Less serious than it was for presenting,
but the same flaw.

## Answer

Obsoleted by ADR 0011, not implemented. This ticket's premise was that opening a
card is a *rendered reading/preview* surface, where uniform scaling buys fidelity —
"a card looks the same at every frame size, same line breaks." ADR 0011 changed
opening into a **view-source** gesture: raw Markdown in a `<pre>`. Source is not a
preview of the slide, so "identical line breaks at every size" and "scale to a
logical canvas" are the wrong goals for it. What a source/text view wants is a
fixed, readable font and a scroll when long — which is exactly what the panel
already does (`.open-card__content { overflow-y: auto }`, `.card__source` monospace
+ `pre-wrap`). The future editing direction reinforces this: an editor is a
fixed-font, scrolling surface, never a scaled canvas. The presentation half of the
concern was already reveal's job (ADR 0008).

So **overflow on the reading surface is handled by scroll, by design.**

Reviewed and kept as-is: the reading frame stays 16:9. It is not optimal for a
text column (a taller shape would show more lines), but it is not broken, and
keeping it preserves the graph-node / opened-card / presented-slide silhouette
coupling `card.ts` documents. A change to the source view's *shape* (dropping 16:9
for a document-style panel) would be its own narrow ticket, deliberately not
opened.

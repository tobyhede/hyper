# Presenting is a reveal.js deck

Source: conversation 2026-07-20, recorded as [ADR 0008](../../docs/adr/0008-presentation-is-a-reveal-deck.md).

## What landed

Presenting takes over the screen and renders the selected route's steps as a
reveal.js deck. Opening a card keeps its own surface — the centred 16:9 frame —
because opening is a reading gesture inside the graph and presenting is not.

`PresentationDeck` builds `<section>` elements imperatively from the route's steps
and calls `Reveal.sync()` when they change. React renders only the container:
reveal rewrites that subtree, and two things cannot own the same nodes.

## What reveal now owns

Stepping, keyboard navigation, transitions, progress, slide numbering, and the
fixed-canvas scaling that `card-display/05` was written to solve. `05` still
applies to the *reading* surface, which is ours.

`PresentationControls` was deleted — reveal draws its own.

## Issues

- `01-markdown-renders-twice` — the reading surface and the deck use different
  markdown renderers.
- `02-speaker-view` — one of the two reasons for adopting reveal.
- `03-pdf-export` — the other.

## Not in scope

**Fragments.** reveal can reveal content progressively within a slide. A Step
targets a *card* in `CONTEXT.md`, so adopting fragments is a glossary change and
must be decided deliberately rather than inherited by using the library.

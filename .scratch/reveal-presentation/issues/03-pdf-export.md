# PDF export

Status: open

## Context

The other feature that justified adopting reveal.js (ADR 0008).

reveal exports by loading the deck with `?print-pdf` and printing to PDF from the
browser, using a stylesheet that lays each slide onto a page. It requires the deck
to be the whole page, which it now is.

## Task

Wire the print-pdf path so a route can be exported as a PDF deck.

Decide:

- **How it is triggered.** A URL parameter matches reveal's own model and is
  linkable; a button in the toolbar is more discoverable. The route being exported
  has to be part of whatever it is.
- **What a card longer than one slide does.** It scrolls on screen; paper has no
  scrollbar. reveal can break tall content across pages — whether that is right
  here depends on whether a card is expected to fit, which `card-display/04`
  raised and deliberately left as authoring guidance rather than a constraint.

## Acceptance

- A route exports to a PDF with one page per step.
- Content that overflows a slide is handled deliberately, not silently cropped.

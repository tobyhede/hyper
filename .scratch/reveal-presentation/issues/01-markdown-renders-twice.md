# The reading surface and the deck render markdown differently

Status: resolved
Tags: release/v1

## Context

Two markdown pipelines now render the same card content:

- **Reading** (`OpenCard` → `CardRenderer` in `@project/ui`) uses `react-markdown`
  with `remark-gfm`, producing React nodes.
- **The deck** (`PresentationDeck`) uses `marked`, producing an HTML string,
  because reveal owns that DOM and React must not diff inside it.

They agree on ordinary GFM, which is why nothing is visibly broken. But they are
different parsers with different edge cases — footnotes, autolinks, HTML
passthrough, table alignment — so a card can read one way and present another.

That is a poor property for a tool whose point is that the same card appears in
several places.

## Task

Make one pipeline the source of truth.

Options, roughly in order of preference:

- **A shared markdown→HTML step.** Use `remark`/`unified` with the same plugins as
  `react-markdown`, produce HTML for both surfaces, and have `CardRenderer` set
  it rather than render nodes. Loses React-level control of rendered elements.
- **Render React to HTML for the deck.** Keeps `react-markdown` authoritative, at
  the cost of rendering out-of-tree to a string.
- **Accept the divergence and pin it with tests** that assert both surfaces
  produce equivalent output for a fixture covering the GFM features we support.

## Acceptance

- A card's content renders identically whether read or presented, or the
  difference is deliberate and tested.

## Answer

Resolved by removing a rendering surface rather than unifying the two parsers
(ADR 0011). Opening a card now shows its **Markdown source**, verbatim and
read-only; the deck (`marked`) is the single place Markdown is parsed. Divergence
is structurally impossible, not merely tested against.

- `CardRenderer` (`@project/ui`) renders title + a read-only `<pre class="card__source">`;
  `react-markdown` and `remark-gfm` are gone from it and from `ui`'s deps.
- `CardRenderer.test.tsx` now asserts the source appears verbatim (the `**bold**`
  markers survive; no `<strong>`, no `<table>`).
- `.card__body` CSS retired for a single `.card__source` rule; `OpenCard`'s stale
  "presenting is the same surface" comment fixed.
- Recorded as ADR 0011 (refines 0006, 0008); CONTEXT.md "Opening" sharpened.

The acceptance's second clause holds: read (source) and present (rendered) differ
deliberately, and that difference is tested.

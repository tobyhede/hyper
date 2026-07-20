# The reading surface and the deck render markdown differently

Status: open

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

# Opening a card shows its Markdown source, not rendered content

Status: accepted
Refines: 0006, 0008
Refined by: 0037
Related: 0024

Opening a Markdown card shows its **source** — the verbatim Markdown, read-only, in a monospace block. It is not rendered to formatted prose. The one place a card's Markdown is parsed and drawn rendered is the **Presentation** deck.

## Why

Two Markdown pipelines used to render the same card body. The reading pane (`OpenCard` → `CardRenderer`) parsed with **react-markdown** + **remark-gfm**; the deck (`PresentationDeck`) parsed with **marked**, because reveal.js owns its DOM and must be handed an HTML string, not React nodes. They agree on ordinary GFM, so nothing looked broken — but they are different parsers with different edge cases (footnotes, autolinks, raw-HTML passthrough, table alignment). A card could read one way and present another, which is a poor property for a tool whose whole point is that the same card appears in several places.

We rejected **unifying the two parsers** — either a shared `unified`/`rehype` step feeding both surfaces, or serialising react-markdown to a string for the deck via `renderToStaticMarkup`. Both keep two rendering surfaces and spend machinery keeping them identical; the shared-`unified` variant even risks a *new* divergence, since a hand-assembled remark chain is not guaranteed to match react-markdown's internal one. More to the point, a reader does not need a *second* rendered view of a card: the graph shows titles (ADR 0006), and presenting shows the card rendered (ADR 0008). The reading pane's rendered output was redundant with the deck's.

So instead of unifying the renderers, we **removed one rendering surface.** Opening shows the source. That leaves the deck as the single Markdown renderer, and divergence becomes structurally impossible rather than something tests must chase. It also seeds the future edit buffer (a `Draft`): view-source is what an editor shows first, so "open" already stands where editing will live.

## What this refines

ADR 0006 said content is reached two ways, opening and presenting, and characterised opening as showing the card's content in place. ADR 0008 drew the line between opening (a reading gesture inside the graph) and presenting (a reveal deck). Both still hold; this narrows what *opening a Markdown card* shows — its source, not a rendered read. A space card still opens to its nested graph and an alias still opens to its target; only the Markdown kind is affected.

## The cost, and the negative to remember

The cost we accept: there is no rendered reading in place. To see a card formatted — bold, tables, code blocks — you present it. A card longer than the pane scrolls as source.

The negative a future review will otherwise re-suggest: *this looks like raw Markdown leaking into the UI; let's render it in the reading pane.* Doing that reintroduces a second Markdown renderer and re-creates the exact parser divergence this ADR removed. Rendered Markdown lives in **one** place, the deck. If the reading pane must ever show formatted content, it does so by routing through the deck's single renderer — never by adding its own.

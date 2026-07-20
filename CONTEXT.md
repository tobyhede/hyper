# Hyper

Graph-native technical content. Cards of content live in a spatial graph; authors lay curated routes across them and offer different views onto them. This glossary is the shared language for that domain — it holds no implementation detail (file formats, storage, and rendering libraries are out of scope here).

## The space

**Space**:
A graph of cards — the world the cards live in, together with the routes and views laid over them. A card may itself be a space, so spaces nest arbitrarily deep.
_Avoid_: presentation (that is one view of a space), manifest, deck, document, canvas, board, file, subgraph.

## Cards

**Card**:
A single unit of content in a space, and the element that edges connect and routes step through. A card is one of three kinds: **Markdown** — a leaf of authored prose; a **space** — a nested graph the viewer opens and explores in place; or an **alias** — another card shown again here. Named for HyperCard's card.
_Avoid_: node, slide, page, tile, subgraph.

**Alias**:
A card that shows another card: the same content appearing again elsewhere in the space, with a single source of truth, so editing the target changes every place it appears. An alias points to a different card, never itself.
_Avoid_: reference (that is an edge kind), link (an alias shows content, it does not merely jump), copy, transclusion, mirror.

## Structure

**Edge**:
An authored connection between two cards, typed by its **kind**: a `sequence` edge asserts narrative order, a `reference` edge asserts a cross-link. Edges are the space's own structure, distinct from the routes an author lays over it.
_Avoid_: link, connection, arrow, relation.

**Port**:
A per-route anchor on a card where a route attaches — inbound on the card's left, outbound on its right, one pair for each route that runs through the card. Distinct ports per route are what keep several routes legible when a view shows them together. Called a **handle** at the render layer.
_Avoid_: socket, connector, anchor.

## Routing

**Route**:
A curated, ordered way through the cards — a narrative an author wants a viewer to follow. A space can hold many routes; each has a name and a colour so they can be told apart when a view shows several at once.
_Avoid_: path, track, tour, journey, sequence (that is an edge kind).

**Step**:
One position in a route, targeting a single card. Steps are ordered, and a route may revisit the same card.
_Avoid_: slide, stop, frame.

## Layout and views

**Layout**:
A named strategy for arranging a space's cards — how they are organised and positioned. A space has a default layout, a route-driven graph, and may offer others (a grid, a cluster map, or a hand-placed one carrying its own card-to-position map). Which cards a layout arranges is the view's choice, not the layout's.
_Avoid_: view (a view renders a layout), placement, position, diagram, arrangement (a layout is the strategy; positions land on the cards themselves).

**View**:
The rendering of a layout for a viewer — which cards and routes are shown, and how they are drawn on screen and explored. The **Presentation** view renders a route-driven graph layout, one colour per route; other views render other layouts.
_Avoid_: mode, screen, page, layout.

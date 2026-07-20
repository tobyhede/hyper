# Hyper

Graph-native technical content. Cards of content live in a spatial graph; authors lay curated routes across them and offer different views onto them. This glossary is the shared language for that domain — it holds no implementation detail (file formats, storage, and rendering libraries are out of scope here), with one exception noted at the end.

## The space

**Space**:
A graph of cards — the world the cards live in, together with the routes and views laid over them. A card may itself be a space, so spaces nest arbitrarily deep.
_Avoid_: presentation (that is one view of a space), manifest, deck, document, canvas, board, file, subgraph.

## Cards

**Card**:
A single unit of content in a space, and the element that routes step through. Named for HyperCard's card.

A card has a **title**, which names it wherever it is listed or drawn, and a **body**, which is the content itself. The two are distinct: a view may show one without the other, and the graph shows only titles.

A card is one of three kinds, which is what its body is: **Markdown** — a leaf, written directly by the author; a **space** — a nested graph the viewer opens and explores in place; or an **alias** — another card, shown again here.
_Avoid_: node, slide, page, tile, subgraph. For the body: prose (a body may be a table, a diagram or code, not only writing), content (that is the card as a whole).

**Alias**:
A card that shows another card: the same content appearing again elsewhere in the space, with a single source of truth, so editing the target changes every place it appears. An alias points to a different card, never itself.
_Avoid_: reference, link (an alias shows content, it does not merely jump), copy, transclusion, mirror.

## Routing

**Route**:
A curated, ordered way through the cards — a narrative an author wants a viewer to follow. Routes are the space's structure: a space's shape is the routes laid across its cards, and there is no separately authored connection between cards.
A space can hold many routes; each has a name and a colour so they can be told apart when a view shows several at once.
_Avoid_: path, track, tour, journey, sequence, rail.

**Step**:
One position in a route, targeting a single card. Steps are ordered, and a route may revisit the same card.
_Avoid_: slide, stop, frame.

## Layout and views

**Layout**:
A named strategy for arranging a space's cards — how they are organised and positioned. A space has a default layout, a route-driven graph, and may offer others (a grid, a cluster map, or a hand-placed one carrying its own card-to-position map). Which cards a layout arranges is the view's choice, not the layout's.
_Avoid_: view (a view renders a layout), placement, position, diagram, arrangement (a layout is the strategy; positions land on the cards themselves).

**View**:
The rendering of a layout for a viewer — which cards and routes are shown, and how they are drawn on screen and explored. The **Graph** view renders a route-driven layout, one colour per route; other views render other layouts.
_Avoid_: mode, screen, page, layout.

**Opening**:
Showing a single card's body to a viewer in place, over whatever view they are in. A card of any kind can be opened, and what the viewer sees is that kind's body: a markdown card shows its text, a space card shows its nested graph to explore, an alias shows what its target would show. Opening is not presenting — it is a reading gesture, and the view it happens over is still the thing being looked at.
_Avoid_: expand, preview, popup, modal, drill-down.

**Presenting**:
Walking a route for an audience, one step at a time, with the space itself out of view. A presentation is a **deck** — the route's cards in order — and it is an output of a space rather than part of one.
_Avoid_: slideshow, playback, present mode (that is a mode name, not the thing).

## At the render layer

Terms below are **React Flow's**, not ours. They are listed because we build against them directly and need to speak them precisely — not because the domain contains them. Nothing in the domain should be named after one, and no bridging term should be invented between the two.

**Edge**:
React Flow's drawn line between two nodes. A route renders as one edge per step transition, so a route of six steps draws as five edges. The domain concept is the Route; an edge is how a segment of one appears on screen.

**Handle**:
React Flow's attachment point on a node, where an edge meets it. Distinct handles per route are what keep several routes legible when a view shows them together. Where a route attaches to a card is a drawing concern with no domain meaning.
_Avoid_: port (that is ELK's word for the same thing, and the layout engine is an implementation choice).

# Hyper

Graph-native technical content. Cards of content live in a spatial graph; authors lay curated routes across them and offer different views onto them. This glossary is the shared language for that domain — it holds no implementation detail (file formats, storage, and rendering libraries are out of scope here), with one exception noted at the end.

## The space

**Space**:
The whole authored world, and the top-level of the domain model: a graph of cards together with the routes and views laid over them. Everything else — cards, routes, layouts, views — belongs to a space. A card may itself be a space, so spaces nest arbitrarily deep; the space you load is the root, and a nested space is reached by opening a space-card.
_Avoid_: presentation (that is one view of a space), manifest (a shipping-ledger word, wrong for an authored, reshapeable thing — retired from the code, not merely avoided), deck, document, canvas, board, file, subgraph.

## Cards

**Card**:
A single addressable piece of a space, and the element that routes step through. Named for HyperCard's card.

A card has a **title**, which names it wherever it is listed or drawn, and **content**, which is what it holds. The two are distinct: a view may show one without the other, and the graph draws the title, not the content. A card may also carry a short optional **description** — a caption saying what it is when the title alone is too terse — which the graph draws under the title; it is not a second body (it is capped and single-line), and the content still lives in the card.

A card is one of three kinds, and the kind is what its content is: **Markdown** — written directly by the author; a **space** — a nested graph the viewer opens and explores in place; or an **alias** — another card, shown again here.
_Avoid_: node, slide, page, tile, subgraph. For the content: prose (it may be a table, a diagram or code, not only writing), body (works for markdown, but a space card's content is a graph).

**Alias**:
A card that shows another card's **content**: the same content appearing again elsewhere in the space, with a single source of truth, so editing the target changes every place it appears. An alias carries its own title — only content is shared. An alias points to a different card, and that card is never itself an alias: aliasing is a single hop, so an alias never points at itself and alias chains cannot form.
_Avoid_: reference, link (an alias shows content, it does not merely jump), copy, transclusion, mirror.

## Routing

**Route**:
A curated, ordered way through the cards — a narrative an author wants a viewer to follow. Routes are the space's structure: a space's shape is the routes laid across its cards, and there is no separately authored connection between cards.
A space can hold many routes; each has a name and a colour so they can be told apart when a view shows several at once.
_Avoid_: path, track, tour, journey, sequence, rail.

**Step**:
One position in a route, targeting a single card. Steps are ordered, and a route visits each card at most once — to return to earlier content, a route steps to an **alias** of it, not back to the card itself (ADR 0012). A revisit would be a backward edge in the graph; an alias is a forward step to a distinct card showing the same content.
_Avoid_: slide, stop, frame.

## Layout and views

**Layout**:
A card-to-position map the author wrote — where a space's cards sit. It belongs to the space and is part of what the space is. A space may hold several layouts, and may hold none. Positions are a property of the layout, never of the card: the same card sits at different coordinates in each. A layout may omit cards, and whoever renders it places those itself; it may not name cards the space does not have.

A Layout is authored by definition. The computed kind is not a layout at all but an automatic **layout strategy**, which is why the two now have separate names (ADR 0014).
_Avoid_: view (a view renders a layout), placement, diagram, manual and custom and free-form (a layout is authored, so the qualifiers say nothing).

**Layout strategy**:
A named strategy for arranging a space's cards — how they are organised and positioned. Which cards it arranges is the view's choice, not the strategy's.

A strategy is either **automatic** or **positioned**. An automatic strategy computes placement from the cards and routes alone — a route-driven graph, a grid, a tree, a cluster map — so it needs nothing from the space and carries no authored data. The positioned strategy reads a **Layout**. Every Layout has a strategy that renders it; not every strategy has a Layout behind it.

Editing placement requires a Layout, because an automatic strategy computes where cards go and so has nowhere to record where an author put one. Accepting an automatic strategy's result *into* a Layout is how computed placement becomes authored, and it is the only crossing between them.
_Avoid_: arrangement (applying a strategy produces no separate entity — the cards themselves carry the positions), algorithm, engine.

**View**:
The rendering of a layout for a viewer — which cards and routes are shown, and how they are drawn on screen and explored. The **Graph** view renders the route-driven strategy, one colour per route; other views render other strategies. A space may name the view it opens in; a viewer may have a default of their own; failing both, a space opens in its route-driven graph.

A view of an automatic strategy is read-only, since it has nowhere to write a placement back to. Nothing tracks whether a viewer is editing: whether the view resolved to a Layout is what decides.
_Avoid_: mode, screen, page, layout.

**Opening**:
Showing a single card's content to a viewer in place, over whatever view they are in. A card of any kind can be opened, and what the viewer sees is whatever its kind holds: a markdown card shows its Markdown source, verbatim; a space card shows its nested graph to explore; an alias shows what its target would show. Opening is not presenting — it is a reading gesture, and the view it happens over is still the thing being looked at. A markdown card is only ever drawn *rendered* by presenting.
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

# Hyper

Graph-native technical content. Cards of content live in a spatial graph; authors lay curated routes across them and offer different views onto them. This glossary is the shared language for that domain — it holds no implementation detail (file formats, storage, and rendering libraries are out of scope here), with one exception noted at the end.

## The space

**Space**:
The whole authored world, and the top-level of the domain model: a graph of cards together with the routes and views laid over them. Everything else — cards, routes, layouts, views — belongs to a space. A card may itself be a space, so spaces nest arbitrarily deep; the space you load is the root, and a nested space is reached by opening a space-card.
_Avoid_: presentation (that is one view of a space), manifest (a shipping-ledger word, wrong for an authored, reshapeable thing — retired from the code, not merely avoided), deck, document, canvas, board, file, subgraph.

A **new space** is one card, centered — not an empty canvas (ADR 0018). It has no routes yet, so it can be read and edited but not presented.

**Id**:
What names a referenceable thing — a card, a route, a layout — within its space. Short and readable, and the only identifier any of them has: there is no second, machine-facing one behind it (ADR 0016, rejected). An id is scoped to its space, so two spaces may each have a card called `intro`.

An author need not write one. Ids are optional in what an author hands over and are filled in for anything missing, deterministically, so the same input always yields the same id (ADR 0019) — an id that changed between readings could not be referenced or bookmarked, which is the one thing ids are for. Renaming an id is therefore a real edit, not a cosmetic one: it moves everything that pointed at the old name.
_Avoid_: uuid, guid, key, slug (a slug is a readable form derived from a name; here the name already is the identifier), and any pairing of a "human" id with a "durable" one.

## Cards

**Card**:
A single addressable piece of a space, and the thing a route's edges run between. Named for HyperCard's card.

A card has a **title**, which names it wherever it is listed or drawn, and **content**, which is what it holds. The two are distinct: a view may show one without the other, and the graph draws the title, not the content. A card may also carry a short optional **description** — a caption saying what it is when the title alone is too terse — which the graph draws under the title; it is not a second body (it is capped and single-line), and the content still lives in the card.

A card is one of three kinds, and the kind is what its content is: **Markdown** — written directly by the author; a **space** — a nested graph the viewer opens and explores in place; or an **alias** — another card, shown again here.
_Avoid_: node, slide, page, tile, subgraph. For the content: prose (it may be a table, a diagram or code, not only writing), body (works for markdown, but a space card's content is a graph).

**Alias**:
A card that shows another card's **content**: the same content appearing again elsewhere in the space, with a single source of truth, so editing the target changes every place it appears. An alias carries its own title — only content is shared. An alias points to a different card, and that card is never itself an alias: aliasing is a single hop, so an alias never points at itself and alias chains cannot form.
_Avoid_: reference, link (an alias shows content, it does not merely jump), copy, transclusion, mirror.

## Routing

**Route**:
A curated way through the cards — a narrative an author wants a viewer to follow. Routes are the space's structure: a space's shape is the routes laid across its cards, and there is no separately authored connection between cards.

A route is a set of directed **edges** between cards, and it is acyclic. A card may have several edges out — a **fork** — and several in — a **merge**. What a route may not do is close a cycle, so returning to earlier content is done with an edge to an **alias** of a card rather than back to the card itself. A route is not a line; a line is the shape a route takes when every card has one edge out.

A space can hold many routes; each has a name and a colour so they can be told apart when a view shows several at once. One is **active** at a time.
_Avoid_: path, track, tour, journey, sequence, rail, step (a route stores edges, not positions in a list).

**Edge**:
A directed connection from one card to another, and the element a route is made of. An author draws one and the route records it. An edge belongs to one route, so two routes crossing the same pair of cards are two edges.
_Avoid_: link, connection, transition, arrow, step, relationship.

**Active route**:
The one route a space has selected at a time — drawn emphasized, and the route an author's new edges join. There is one concept here, not two: a route is active, and highlighting is how that is shown. A layout may name which route opens active; failing that it is the first route the layout shows. Changing it is a deliberate act, never a side effect of drawing or reading.
_Avoid_: selected route and current route as a second concept alongside this one, focus, mode.

## Layout and views

**Layout**:
A card-to-position map the author wrote — where a space's cards sit. It belongs to the space and is part of what the space is. A space may hold several layouts, and may hold none. Positions are a property of the layout, never of the card: the same card sits at different coordinates in each. A layout may omit cards, and whoever renders it places those itself; it may not name cards the space does not have.

A Layout is authored by definition; the computed kind is not a layout at all but an automatic **layout strategy** (ADR 0014). A space with no Layout is arranged by an automatic strategy the application supplies, and **editing turns that into a Layout**: the arrangement already on screen is copied as the new layout's positions, so nothing moves at the moment it happens.

A layout also names which routes it shows — a filter, absent meaning all of them — and may name which of those opens active.
_Avoid_: view (a view renders a layout), placement, diagram, manual and custom and free-form (a layout is authored, so the qualifiers say nothing).

**Layout strategy**:
A named strategy for arranging a space's cards — how they are organised and positioned. Which cards it arranges is the view's choice, not the strategy's.

A strategy is either **automatic** or **positioned**. An automatic strategy computes placement from the cards and routes alone — a grid, cards ordered by name, a tree, a cluster map, a route-driven graph — so it needs nothing from the space and carries no authored data. The positioned strategy reads a **Layout**. Every Layout has a strategy that renders it; not every strategy has a Layout behind it.

No strategy is the primary one. A space is arranged by whichever the author or the application chose, the set of them grows, and any particular graph-layout engine is one member of it rather than the thing layout means.

An automatic strategy has nowhere to record where an author put a card, so editing one **converts** it: the strategy's arrangement is accepted into a new Layout and the edit is written there. That crossing — computed placement becoming authored — is the only one between them, and an edit is what triggers it.
_Avoid_: arrangement (applying a strategy produces no separate entity — the cards themselves carry the positions), algorithm, engine.

**View**:
The rendering of a layout for a viewer — which cards and routes are shown, and how they are drawn on screen and explored. The **Graph** view draws cards and the routes across them, one colour per route. A space may name the view it opens in; a viewer may have a default of their own; failing both, a space opens in the one the application supplies.

Nothing tracks whether a viewer is editing, and there is no edit mode. Editing a view of an automatic strategy converts its arrangement into a Layout and writes there; editing a view of a Layout writes to it directly. Either way the write has somewhere to go. What is worth showing is not that editing began but that the space is unsaved.
_Avoid_: mode, screen, page, layout.

**Opening**:
Showing a single card's content to a viewer in place, over whatever view they are in. A card of any kind can be opened, and what the viewer sees is whatever its kind holds: a markdown card shows its Markdown source, verbatim; a space card shows its nested graph to explore; an alias shows what its target would show. Opening is not presenting — it is a reading gesture, and the view it happens over is still the thing being looked at. A markdown card is only ever drawn *rendered* by presenting.
_Avoid_: expand, preview, popup, modal, drill-down.

**Presenting**:
Walking a route for an audience, on the space itself, drawn close enough that one card fills the screen. Presenting **traverses** the route: at the active card, the presenter follows one of its outgoing edges. A route that is a line walks as a line; a route that forks offers a choice. There is no separate artefact and no second surface — a presentation is not a thing a route is turned into, it is a way of moving through one.
_Avoid_: deck, slide, step, slideshow, playback, present mode (that is a mode name, not the thing).

**Walk**:
The cards a presenter has actually passed through, in order — one path taken through a route, of the several a route may permit. It belongs to the presenting, not to the space: a route is a graph and holds every path at once; a walk is the one being taken, and it is gone when the presenting ends. It is not itself a route, and recording one would be a second structure beside routes.
_Avoid_: history, trail, session, playthrough, and route (a route is what is walked).

**Active card**:
Where a walk currently is — the card a presenter has reached, whose outgoing edges are the moves available. It pairs with the **active route**: the route names what is being walked, the card names the position in it. Going back reads the walk rather than the graph, because a card reached by a merge has several edges in and only the path taken says which one was used.
_Avoid_: current slide, cursor, position, step.

## At the render layer

Terms below are **React Flow's**, not ours. They are listed because we build against them directly and need to speak them precisely — not because the domain contains them. Nothing in the domain should be named after one, and no bridging term should be invented between the two.

**Edge (React Flow's)**:
React Flow's drawn line between two nodes, and the gesture that draws one. It shares its name with the domain's **Edge** because it is the same thing seen twice — the one place a render-layer word and a domain word coincide, deliberately, rather than a bridging term.

**Handle**:
React Flow's attachment point on a node, where an edge meets it. A card carries one neutral handle, because where a route attaches is a drawing concern with no domain meaning. Distinct handles per route belong to the **overview** — the view that draws every route at once and needs them to stay legible — and are that view's rendering, never a rule the model obeys.
_Avoid_: port (that is the word a graph-layout engine uses for the same thing, and any such engine is one implementation choice among several).

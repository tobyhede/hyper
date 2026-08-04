# Hyper

Graph-native technical content. Cards of content live in a spatial graph; authors lay curated routes across them and offer different views onto them. This glossary is the shared language for that domain — it holds no implementation detail (file formats, storage, and rendering libraries are out of scope here), with one exception noted at the end.

## The space

**Space**:
The whole authored world, and the top-level of the domain model: a graph of cards together with the routes and views laid over them. Everything else — cards, routes, layouts, views — belongs to a space. A card may itself be a space, so spaces nest arbitrarily deep; the space you load is the root, and a nested space is reached by opening a space-card.
_Avoid_: presentation (that is one view of a space), manifest (a shipping-ledger word, wrong for an authored, reshapeable thing — retired from the code, not merely avoided), deck, document, canvas, board, file, subgraph.

A **new space** is one card, centered — not an empty canvas (ADR 0018). It has no routes yet, so it can be read and edited but not presented.

**Id**:
The durable UUID that names a referenceable thing — a space, card, route or layout. It is the entity's only identifier and is unique within that entity's scope: space ids among Spaces, card ids among Cards, and route and layout ids within their owning Space. Different entity kinds may carry the same UUID, and route or layout ids may be reused in different Spaces; references carry the id directly in the scope that resolves it rather than pairing it with a second authored or machine-facing name.

An author need not supply one when introducing an entity. Anything accepted into Hyper receives an id before it becomes part of a Space; once assigned, changing it is a real edit because every reference names it.
_Avoid_: guid, key, slug, local id, authored id, and any pairing of a "human" id with a "durable" one.

## Cards

**Card**:
A single addressable piece of a space, and the thing a route's edges run between. Named for HyperCard's card.

A card has a **title**, which names it wherever it is listed or drawn, and **content**, which is what it holds. The two are distinct: a view may show one without the other, and the graph draws the title, not the content. A card may also carry a short optional **description** — a caption saying what it is when the title alone is too terse — which the graph draws under the title; it is not a second body (it is capped and single-line), and the content still lives in the card.

A card is one of three kinds, and the kind is what its content is: **Markdown** — written directly by the author; a **space** — a nested graph the viewer opens and explores in place; or an **alias** — another card, shown again here.
_Avoid_: node, slide, page, tile, subgraph. For the content: prose (it may be a table, a diagram or code, not only writing), body (works for markdown, but a space card's content is a graph).

**Alias**:
A card that shows another card's **content**: the same content appearing again elsewhere in the space, with a single source of truth, so editing the target changes every place it appears. An alias carries its own title — only content is shared. An alias points to a different card, and that card is never itself an alias: aliasing is a single hop, so an alias never points at itself and alias chains cannot form.

Authoring an alias changes only its title, and it is renamed where it is drawn. An alias owns no content of its own, so it does not open: the surface a card opens on authors content, and an alias has none to author. Reaching its target's content through it, so that every place showing that content changes together, is work not yet done. Changing which card an alias targets is a separate alias-authoring operation, not editing the content it shows.
_Avoid_: reference, link (an alias shows content, it does not merely jump), copy, transclusion, mirror.

## Routing

**Route**:
A curated way through the cards — a narrative an author wants a viewer to follow. Routes are the space's structure: a space's shape is the routes laid across its cards, and there is no separately authored connection between cards.

A route is a set of directed **edges** between cards. A card may have several edges out — a **fork** — and several in — a **merge**; routes may also contain cycles and self-edges. Presentation decides how to traverse that graph. A route is not a line; a line is the shape a route takes when every card has one edge out.

A space can hold many routes; each has a name and a colour so they can be told apart when a view shows several at once. One is **active** at a time.
_Avoid_: path, track, tour, journey, sequence, rail, step (a route stores edges, not positions in a list).

**Edge**:
A directed connection from one card to another, and the element a route is made of. An author draws one and the route records it. An exact edge appears at most once in a route; drawing it again changes nothing. An edge belongs to one route, so two routes crossing the same pair of cards are two edges.
_Avoid_: link, connection, transition, arrow, step, relationship.

**Active route**:
The one route a space has selected at a time — drawn emphasized, and the route an author's new edges join. There is one concept here, not two: a route is active, and highlighting is how that is shown. A layout may name which route opens active; failing that it is the first route the layout shows. Changing it is a deliberate act, never a side effect of drawing or reading.

Activating is not itself an edit — it touches no card and no route, so it converts nothing. Which route is active may become the authored default when another edit records the surrounding view.
_Avoid_: selected route and current route as a second concept alongside this one, focus, mode.

**Authoring**:
Interacting with a Space in a way that may change its authored cards, routes, or Layouts. Authoring includes attempts that produce no change; only a successful authoring interaction produces an **Edit**. Navigating a View or Layout, activating a Route, opening a Card, and presenting are not authoring because they do not change the Space.

**Edit**:
A validated transition from one Space to another that changes its authored cards, routes, or Layouts. An attempted gesture is not itself an Edit: cancelling it, drawing an Edge the Route already holds, or moving a Card away and back produces no Edit because the Space does not change.

One Edit may change several authored parts atomically. Creating a Card at the end of a drawn Edge may create the Card, mint the Space's first Route, add the Edge, and write the Card's position into a Layout; together they are one Edit, not a sequence of smaller Edits.

## Layout and views

**Layout**:
A card-to-position map the author wrote — where a space's cards sit. It belongs to the space and is part of what the space is. A space may hold several layouts, and may hold none. Positions are a property of the layout, never of the card: the same card sits at different coordinates in each. A layout may omit cards, and whoever renders it places those itself; it may not name cards the space does not have.

A Layout is authored by definition; the computed kind is not a layout at all but an automatic **layout strategy** (ADR 0014). A space with no Layout is rendered through an **Algorithmic View** the application supplies, and **editing turns that into a Layout**: the card positions already on screen are copied into the new Layout, so nothing moves at the moment it happens.

A layout also names which routes it shows — a filter, absent meaning all of them — and may name which of those opens active.
_Avoid_: view (a View is application-supplied and carries no authored positions), placement as a synonym (a Layout *holds* a placement, and adds an identity, a title and its route filter), diagram, manual and custom and free-form (a layout is authored, so the qualifiers say nothing).

**Placement**:
The card-to-position map itself — which cards sit where, and nothing more. A **Layout** is the authored thing a space holds; the placement is the map inside it. It is also what an automatic **layout strategy** computes and what the positioned strategy reads, and it is the same value in both directions: editing an Algorithmic View copies the computed placement into the new Layout, which is the crossing ADR 0025 describes.

A placement is **sparse**, and omission is meaningful: a card the map leaves out is *unplaced*, and whoever renders it places that card itself. Omission is never the origin, and a position a renderer supplied for an unplaced card is not a placement the author made — promoting one to authored is an Edit, not a side effect of drawing.

This is not the placement layer ADR 0004 rejected. That was an entity sitting *between* a card and its position, which edges and routes referenced instead of the card, so one card could occupy two positions. A placement is keyed by card and holds at most one position for each.
_Avoid_: arrangement (ADR 0005 — applying a strategy produces no separate entity), layer.

**Layout strategy**:
A named strategy for arranging a space's cards — how they are organised and positioned. Which cards it arranges is the view's choice, not the strategy's.

A strategy is either **automatic** or **positioned**. An automatic strategy computes placement from the cards and routes alone — a grid, cards ordered by name, a tree, a cluster map, a route-driven graph — so it needs nothing from the space and carries no authored data. The positioned strategy reads a **Layout**. Every Layout has a strategy that renders it; not every strategy has a Layout behind it.

No strategy is the primary one. A space is arranged by whichever the author or the application chose, the set of them grows, and any particular graph-layout engine is one member of it rather than the thing layout means.

An automatic strategy has nowhere to record where an author put a card, so editing an Algorithmic View **converts** it: the positions the strategy computed are copied into a new Layout and the edit is written there. That crossing — computed positions becoming authored — is the only one between them, and an edit is what triggers it.
_Avoid_: arrangement (applying a strategy produces no separate entity — the cards themselves carry the positions), algorithm, engine.

**View**:
An application-supplied way to render and explore a Space without authored card positions. An **Algorithmic View** uses an automatic **layout strategy** to compute those positions; the **Graph** View draws cards and routes across them, while the **Grid** View places cards on a grid. Views are named choices the application supplies, not authored things a Space owns.

A viewer chooses between the application's Views and the Space's Layouts. The Space may name either as its default renderer; a viewer may have a default View of their own; failing both, the application supplies a View. Choosing one is navigation, not an edit, and never changes the Space by itself.

Nothing tracks whether a viewer is editing, and there is no edit mode. Editing an Algorithmic View creates a new Layout from the card positions already on screen; editing a Layout changes that Layout directly. Conversion retains no relationship to the View or layout strategy that produced those initial positions: selecting another View later is a fresh rendering choice, not undo or reversal.
_Avoid_: mode, screen, page, layout.

**Exporting**:
Projecting a space into the repository-friendly form an author can review, commit and share. Exporting is not what makes an edit durable; it records the space outside Hyper at a chosen revision.
_Avoid_: saving, publishing, syncing.

**Opening**:
Bringing a single card's own content up in place, over whatever view the author is in, to author it. A markdown card opens on its title, its description and its Markdown source, verbatim and editable; a space card opens on its nested graph to explore. Opening is not presenting — the view it happens over is still the thing being worked in, and a markdown card is only ever drawn *rendered* by presenting. There is no separate reading state: what a card opens on is what an author edits, because they were always the same bytes in the same order.
_Avoid_: expand, preview, popup, modal, drill-down, view mode and edit mode (there is one surface).

**Presenting**:
Walking a route for an audience, on the space itself, drawn close enough that one card fills the screen. Presenting **traverses** the route: at the active card, the presenter follows one of its outgoing edges. A route that is a line walks as a line; a route that forks offers a choice. There is no separate artefact and no second surface — a presentation is not a thing a route is turned into, it is a way of moving through one.
_Avoid_: deck, slide, step, slideshow, playback, present mode (that is a mode name, not the thing).

**Walk**:
The cards a presenter has actually passed through, in order — one path taken through a route, of the several a route may permit. It belongs to the presenting, not to the space: a route is a graph and holds every path at once; a walk is the one being taken, and it is gone when the presenting ends. It is not itself a route, and recording one would be a second structure beside routes.
_Avoid_: history, trail, session, playthrough, and route (a route is what is walked).

**Selected card**:
The card an authoring gesture will act on, named without being read. It is not opening and not activating: selecting a card shows nothing new and changes nothing about the space, it says *this one*. One card is selected at a time, and it is what reveals the controls drawn on a card and what a keyboard rename acts on. Selecting is not authoring, because it produces no Edit.
_Avoid_: focus (that is the browser's, and a card may be selected without it), highlight, current card, active card (that belongs to a walk).

**Active card**:
Where a walk currently is — the card a presenter has reached, whose outgoing edges are the moves available. It pairs with the **active route**: the route names what is being walked, the card names the position in it. Going back reads the walk rather than the graph, because a card reached by a merge has several edges in and only the path taken says which one was used.
_Avoid_: current slide, cursor, position, step.

## At the render layer

Terms below are **React Flow's**, not ours. They are listed because we build against them directly and need to speak them precisely — not because the domain contains them. Nothing in the domain should be named after one, and no bridging term should be invented between the two.

**Edge (React Flow's)**:
React Flow's drawn line between two nodes, and the gesture that draws one. It shares its name with the domain's **Edge** because it is the same thing seen twice — the one place a render-layer word and a domain word coincide, deliberately, rather than a bridging term.

**Handle**:
React Flow's attachment point on a node, where an edge meets it or an author begins or ends drawing one. Route authoring presents four route-independent handles on a card, one on each side, coloured as the active route; the side is interaction geometry and is not authored. A renderer may use other invisible attachment geometry to keep existing edges legible, but that remains rendering and never becomes a rule the model obeys.
_Avoid_: port (that is the word a graph-layout engine uses for the same thing, and any such engine is one implementation choice among several).

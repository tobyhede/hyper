# Hyper

Graph-native technical content. Cards of content live in spatial Layouts; authors connect them into curated directed Graphs and offer different Views onto them. This glossary is the shared language for that domain — it holds no implementation detail (file formats, storage, and rendering libraries are out of scope here), with one exception noted at the end.

## The space

**Space**:
The whole authored world, and the top-level of the domain model: Cards organised into spatial Layouts, with each Layout carrying the Graphs authored across its Cards. Everything else — Cards, Layouts, their Graphs, and application-supplied Views — belongs within a Space. A Card may itself be a Space, so Spaces nest arbitrarily deep; the Space you load is the root, and a nested Space is reached by opening a Space Card.
_Avoid_: presentation (that is one view of a space), manifest (a shipping-ledger word, wrong for an authored, reshapeable thing — retired from the code, not merely avoided), deck, document, canvas, board, file, subgraph.

A **new space** is one Card, centered — not an empty canvas (ADR 0018). It has no Graphs yet, so it can be read and edited but not presented. One Card is the starting state, not a permanent minimum: deliberate deletion may later leave the Space with no Cards.

**Id**:
The durable UUID that names a referenceable thing — a Space, Card, Layout, or Graph. It is the entity's only identifier and is unique within that entity's scope: Space ids among Spaces, Card and Layout ids within their owning Space, and Graph ids within their owning Layout. Different entity kinds may carry the same UUID, and scoped ids may be reused under different owners; references carry the id directly in the scope that resolves it rather than pairing it with a second authored or machine-facing name.

An author need not supply one when introducing an entity. Anything accepted into Hyper receives an id before it becomes part of a Space; once assigned, changing it is a real edit because every reference names it.
_Avoid_: guid, key, slug, local id, authored id, and any pairing of a "human" id with a "durable" one.

## Cards

**Card**:
A single addressable piece of a space, and the thing a Graph's Edges run between. Named for HyperCard's card.

A card has a **title**, which names it wherever it is listed or drawn, and **content**, which is what it holds. The two are distinct: a view may show one without the other, and the graph draws the title, not the content. A card may also carry a short optional **description** — a caption saying what it is when the title alone is too terse — which the graph draws under the title; it is not a second body (it is capped and single-line), and the content still lives in the card.

A card is one of three kinds, and the kind is what its content is: **Markdown** — written directly by the author; a **space** — a nested graph the viewer opens and explores in place; or an **alias** — another card, shown again here.
_Avoid_: node, slide, page, tile, subgraph. For the content: prose (it may be a table, a diagram or code, not only writing), body (works for markdown, but a space card's content is a graph).

**Alias**:
A card that shows another card's **content**: the same content appearing again elsewhere in the space, with a single source of truth, so editing the target changes every place it appears. An alias carries its own title — only content is shared. An alias may target any non-alias card kind, including a Markdown card or a space card, but never another alias: aliasing is a single hop, so an alias never points at itself and alias chains cannot form.

Authoring an alias itself changes only its title, and it is renamed where it is drawn. Opening an alias preserves that occurrence as the opened context and delegates content authoring to the card it targets. The surface identifies both cards, exposes the target's content rather than the alias's metadata, and completes the target edit at its single source of truth, so every alias shows the change. Changing which card an alias targets is a separate alias-authoring operation, not editing the content it shows.
_Avoid_: reference, link (an alias shows content, it does not merely jump), copy, transclusion, mirror.

## Graphs

**Graph**:
A curated directed structure over the Cards in one Layout — a narrative an author wants a viewer to traverse. Graphs are a Layout's only connection structure: there is no separately authored connection between Cards. A Graph belongs to exactly one Layout and is authored only through that Layout.

A Graph is a set of directed **Edges** between Cards, and the set may be empty while an author prepares a new narrative. A Card may have several Edges out — a **fork** — and several in — a **merge**; Graphs may also contain cycles and self-Edges. A Graph is not a line; a line is the shape a Graph takes when every Card has one Edge out.

A Layout keeps its one or more Graphs in a stable authored order. This order organises Graphs and supplies the fallback Active Graph; it does not order traversal within a Graph. New Graphs append, deletion preserves the relative order of survivors, and manual reordering is a separate authoring operation. The last Graph cannot be deleted through Graph management.

A Layout holds one or many Graphs; each Graph has a title and may have a colour so Graphs can be told apart when the Layout shows several at once. An empty Graph is fully authored and may be active, but cannot be presented until it has an Edge. A Space with no Layout has no Graphs; creating a Layout also creates its initial empty Active Graph in the same Edit.

Every Edge in a Graph connects two Cards present in the Graph's Layout. Removing a Card from a Layout therefore removes every Edge incident to that Card from all Graphs in that Layout as part of the same Edit; Graphs that become empty remain. The Card still belongs to the Space and may remain present in other Layouts.
_Avoid_: route, path, track, tour, journey, sequence, rail, step.

**Edge**:
A directed connection from one Card to another, and the element a Graph is made of. An author draws one and the Graph records it. An exact Edge appears at most once in a Graph; drawing it again changes nothing. An Edge belongs to one Graph, so two Graphs crossing the same pair of Cards hold two Edges.
_Avoid_: link, connection, transition, arrow, step, relationship.

**Active Graph**:
The one Graph selected in the current Layout — drawn emphasized, and the Graph an author's new Edges join. There is one concept here, not two: a Graph is active, and highlighting is how that is shown. A Layout may name which Graph opens active; failing that it is the Layout's first Graph. Changing it is a deliberate act, never a side effect of drawing or reading.

Activating is not itself an edit — it touches no Card and no Graph, so it converts nothing. Which Graph is active may become the authored default when another Edit records the surrounding View.
_Avoid_: selected Graph and current Graph as a second concept alongside this one, focus, mode.

**Authoring**:
Interacting with a Space in a way that may change its authored Cards, Graphs, or Layouts. Authoring includes attempts that produce no change; only a successful authoring interaction produces an **Edit**. Navigating a View or Layout, activating a Graph, opening a Card, and presenting are not authoring because they do not change the Space.

**Interaction draft**:
A transient value owned by the surface conducting an unfinished authoring interaction — a title field's changed text, a picker's unconfirmed target, React Flow's connection or drag attempt, an armed destructive control's confirmation state. None of these is part of the Space or an Edit waiting to be persisted, so cancelling discards the draft and needs no compensating Edit.

A completed Edit is authoritative local work rather than a draft, and a draft may outlive the Edit that opened it: Add Card and Add Graph complete before their follow-up title fields open, so cancelling that rename keeps the entity the Edit created. Replacing the working Space invalidates the drafts outstanding against the Space it replaced.
_Avoid_: Draft Space, pending Edit, unsaved Edit, working copy.

**Edit**:
A validated transition from one Space to another that changes its authored Cards, Graphs, or Layouts. An attempted gesture is not itself an Edit: cancelling it, drawing an Edge the Graph already holds, or moving a Card away and back produces no Edit because the Space does not change.

One Edit may change several authored parts atomically. Creating a Card at the end of a drawn Edge may create the Card, mint the Layout's first Graph, add the Edge, and write the Card's position into a Layout; together they are one Edit, not a sequence of smaller Edits.

## Layout and views

**Layout**:
A card-to-position map the author wrote — which of a Space's Cards are in the Layout and where they sit. It belongs to the Space and is part of what the Space is. A Space may hold several Layouts, and may hold none. Membership and position are properties of the Layout, never of the Card: the same Card may be absent from one Layout and sit at different coordinates in others. A Layout may not name Cards the Space does not have.

A Layout is authored by definition; the computed kind is not a layout at all but an automatic **layout strategy** (ADR 0014). An **Algorithmic View** the application supplies may render either the Space generally or a Graph from one of its Layouts, and **editing turns that into a Layout**: the Card positions already on screen are copied into the new Layout, so nothing moves at the moment it happens. When the View is Graph-scoped, conversion also copies the source Graph under a new identity owned by the new Layout; the source Layout and Graph remain unchanged.

A Layout owns a non-empty ordered collection of Graphs over its Cards. Several Graphs may share Cards within that Layout. A Layout may also name which of its Graphs opens active; otherwise its first Graph opens active.
_Avoid_: view (a View is application-supplied and carries no authored positions), placement as a synonym (a Layout *holds* a placement, and adds an identity, a title and its owned Graphs), diagram, manual and custom and free-form (a layout is authored, so the qualifiers say nothing).

**Placement**:
The card-to-position map itself — which Cards are present and where they sit, and nothing more. A **Layout** is the authored thing a Space holds; the placement is the map inside it. It is also what an automatic **layout strategy** computes and what the positioned strategy reads, and it is the same value in both directions: editing an Algorithmic View copies the computed placement into the new Layout, which is the crossing ADR 0025 describes.

A Layout's placement is **sparse** relative to the Space, and omission is meaningful: a Card the map leaves out is not in that Layout and is not rendered there. Adding an existing Space Card to a Layout writes its position. Removing it from the Layout removes that entry and the incident Edges the Layout owns without deleting the Card from the Space. Omission is never the origin.

**Add Card** creates a new Space Card and adds it to the current Layout. **Add to Layout** adds an existing Space Card with its initial position. **Move Card** changes the position of a Card already in the Layout. **Remove from Layout** removes its membership, position and incident Layout-local Edges. “Place” is not a separate domain operation: every Card in a Layout necessarily has a position.

This is not the placement layer ADR 0004 rejected. That was an entity sitting *between* a Card and its position, which Edges and Graphs referenced instead of the Card, so one Card could occupy two positions. A placement is keyed by Card and holds at most one position for each.
_Avoid_: arrangement (ADR 0005 — applying a strategy produces no separate entity), layer.

**Layout strategy**:
A named strategy for arranging a space's cards — how they are organised and positioned. Which cards it arranges is the view's choice, not the strategy's.

A strategy is either **automatic** or **positioned**. An automatic strategy computes placement from the Cards and Graphs alone — a grid, Cards ordered by name, a tree, a cluster map, a Graph-driven arrangement — so it needs nothing from the Space and carries no authored data. The positioned strategy reads a **Layout**. Every Layout has a strategy that renders it; not every strategy has a Layout behind it.

No strategy is the primary one. A space is arranged by whichever the author or the application chose, the set of them grows, and any particular graph-layout engine is one member of it rather than the thing layout means.

An automatic strategy has nowhere to record where an author put a card, so editing an Algorithmic View **converts** it: the positions the strategy computed are copied into a new Layout and the edit is written there. That crossing — computed positions becoming authored — is the only one between them, and an edit is what triggers it.
_Avoid_: arrangement (applying a strategy produces no separate entity — the cards themselves carry the positions), algorithm, engine.

**View**:
An application-supplied projection of a subject through which someone explores or acts on a Space. A View is not tied to a rendering surface and carries no authored Space state.
_Avoid_: screen, page, panel, mode.

**Algorithmic View**:
A spatial View that uses an automatic **layout strategy** over an explicit subject and renders its computed Card positions on the canvas. A **Space-scoped View**, such as Grid or an alphabetical list, arranges Space Cards without a Graph; a future **Graph-scoped View**, such as a tree, may borrow one selected Layout-owned Graph and the Cards it connects.

A viewer chooses between the application's Algorithmic Views and the Space's Layouts as the primary canvas renderer. The Space may name either as its default renderer; a viewer may have a default Algorithmic View of their own; failing both, the application supplies one. Choosing one is navigation, not an edit, and never changes the Space by itself.

Nothing tracks whether a viewer is editing, and there is no edit mode. Editing an Algorithmic View creates a new Layout from the Cards and positions already on screen; moving or connecting a Card, or choosing Add Graph, therefore converts before writing the Edit. A connection or Add Graph may create the new Layout's first Graph as part of that same Edit. Converting a Graph-scoped View also copies its source Graph under a new identity into the new Layout, leaving the source unchanged. Editing a Layout changes that Layout directly. Conversion retains no relationship to the View or layout strategy that produced those initial positions: selecting another View later is a fresh rendering choice, not undo or reversal.
_Avoid_: layout, arrangement, algorithm.

**Cards View**:
An application-supplied collection View of the Space Cards absent from the selected Layout. Its current rendering is a Sidebar, but that mounting location is not part of the View's identity.
_Avoid_: Space-card palette, Card panel, Sidebar as the domain name.

**Exporting**:
Projecting a space into the repository-friendly form an author can review, commit and share. Exporting is not what makes an edit durable; it records the space outside Hyper at a chosen revision.
_Avoid_: saving, publishing, syncing.

**Opening**:
Bringing a single card's content up in place, over whatever view the author is in, to author it. A markdown card opens on its title, its description and its Markdown source, verbatim and editable; an alias opens the same content surface through its target while remaining visibly the occurrence that was opened, and a space card opens on its nested graph to explore. Opening is not presenting — the view it happens over is still the thing being worked in, and a markdown card is only ever drawn *rendered* by presenting. There is no separate reading state: what a card opens on is what an author edits, because they were always the same bytes in the same order.
_Avoid_: expand, preview, popup, modal, drill-down, view mode and edit mode (there is one surface).

**Presenting**:
Traversing a Graph in its Layout for an audience, drawn close enough that one Card fills the screen. Presenting is available from a Layout, not an Algorithmic View, and traverses its Active Graph: at the Active Card, the presenter follows one of its outgoing Edges. A Graph that is a line traverses as a line; a Graph that forks offers a choice. There is no separate artefact and no second surface — a presentation is not a thing a Graph is turned into, it is a way of moving through one.
_Avoid_: deck, slide, step, slideshow, playback, present mode (that is a mode name, not the thing).

**Graph navigation**:
Moving keyboard focus through the Active Graph while working in its Layout. It uses the same fork, merge, cycle, and backtracking rules as Presenting but remains a separate transient interaction rather than an audience-facing presentation.
_Avoid_: overview traversal, browsing, walking.

**Traversal history**:
The ordered Cards actually visited during one Graph navigation or presentation interaction. It is transient viewer state used to retrace the path actually taken through merges and cycles; the Space never owns or persists it.
_Avoid_: Walk, route, trail, session, playthrough.

**Selected card**:
The card an authoring gesture will act on, named without being read. It is not opening and not activating: selecting a card shows nothing new and changes nothing about the space, it says *this one*. One card is selected at a time, and it is what reveals the controls drawn on a card and what a keyboard rename acts on. Selecting is not authoring, because it produces no Edit.
_Avoid_: focus (that is the browser's, and a Card may be selected without it), highlight, current Card, Active Card (that belongs to Graph navigation or Presenting).

**Active card**:
The Card currently reached during Graph navigation or Presenting, whose outgoing Edges are the moves available. It pairs with the **Active Graph**: the Graph names what is being traversed, and the Card names the position in it. Going back reads Traversal history rather than the Graph, because a Card reached by a merge has several Edges in and only the path taken says which one was used.
_Avoid_: current slide, cursor, position, step.

## At the render layer

Terms below are **React Flow's**, not ours. They are listed because we build against them directly and need to speak them precisely — not because the domain contains them. Nothing in the domain should be named after one, and no bridging term should be invented between the two.

**Edge (React Flow's)**:
React Flow's drawn line between two nodes, and the gesture that draws one. It shares its name with the domain's **Edge** because it is the same thing seen twice — the one place a render-layer word and a domain word coincide, deliberately, rather than a bridging term.

**Handle**:
React Flow's attachment point on a node, where an edge meets it or an author begins or ends drawing one. Graph authoring presents four Graph-independent handles on a Card, one on each side, coloured as the Active Graph; the side is interaction geometry and is not authored. A renderer may use other invisible attachment geometry to keep existing Edges legible, but that remains rendering and never becomes a rule the model obeys.
_Avoid_: port (that is the word a graph-layout engine uses for the same thing, and any such engine is one implementation choice among several).

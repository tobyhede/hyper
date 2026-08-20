# Hyper

Graph-native technical content. Cards of content live in spatial Layouts; authors connect them into curated directed Graphs and offer different Views onto them. This glossary is the shared language for that domain — it holds no implementation detail (file formats, storage, and rendering libraries are out of scope here), with one exception noted at the end.

## The space

**Space**:
The whole authored world, and the top-level of the domain model: Cards organised into spatial Layouts, with each Layout carrying the Graphs authored across its Cards. Everything else — Cards, Layouts, their Graphs, and application-supplied Views — belongs within a Space. A Card may itself be a Space, so Spaces nest arbitrarily deep; the Space you load is the root, and a nested Space is reached by opening a Space Card.
_Avoid_: presentation (that is one view of a space), manifest (a shipping-ledger word, wrong for an authored, reshapeable thing — retired from the code, not merely avoided), deck, document, canvas, board, file, subgraph, workspace (used loosely for the loaded Space and for the app chrome around it — say Space, or Sidebar/canvas for the chrome).

A **new space** is one Card, centered — not an empty canvas (ADR 0018). It has no Graphs yet, so it can be read and edited but not presented. One Card is the starting state, not a permanent minimum: deliberate deletion may later leave the Space with no Cards.

**Id**:
The durable UUID that names a referenceable thing — a Space, Card, Layout, or Graph. It is the entity's only identifier and is unique within that entity's scope: Space ids among Spaces, and Card, Layout and Graph ids within their owning Space. A Graph belongs to one Layout but its id is unique across the whole Space, because a View drawing every Graph flattened across Layouts keys colour, handles and activation on that id alone (ADR 0045). Different entity kinds may carry the same UUID, and ids scoped to one Space may be reused in another; references carry the id directly in the scope that resolves it rather than pairing it with a second authored or machine-facing name.

An author need not supply one when introducing an entity. Anything accepted into Hyper receives an id before it becomes part of a Space; once assigned, changing it is a real edit because every reference names it.
_Avoid_: guid, key, slug, local id, authored id, and any pairing of a "human" id with a "durable" one.

## Cards

**Card**:
A single addressable piece of a space, and the thing a Graph's Edges run between. Named for HyperCard's card.

A card has a **Title**, which names it wherever it is listed or drawn, and a **kind**, which owns everything else: the additional fields, the opened editor, and what the Card front draws around the Title. Card fronts keep one uniform geometry across kinds. Markdown owns its body; Alias owns its Target. There is no shared Description, summary, or second content slot on Card.

A card is one of three kinds, and the kind is what its content is: **Markdown** — written directly by the author; a **space** — a nested graph the viewer opens and explores in place; or an **alias** — another card, shown again here.
_Avoid_: node, slide, page, tile, subgraph. For the content: prose (it may be a table, a diagram or code, not only writing), body (works for markdown, but a space card's content is a graph).

**Space Card**:
A card of kind **space**: the only way a new Space comes to exist, and the only path to it. Creating one creates its Space in the same Edit; opening it explores that Space in place. The relationship is ownership, not reference — deleting a Space Card deletes the Space it owns, with everything nested inside it, and unlike an Alias's Target, a Space Card's reference is never retargeted once minted. A Space Card may not target a Space already open along the chain that reaches it, so a Space cannot contain itself, directly or through any chain of Space Cards.
_Avoid_: subspace, portal, link, nested space (as a second name for the same thing — it is a Space, full stop).

**Alias**:
A card that shows another card's **content**: the same content appearing again elsewhere in the space, with a single source of truth, so editing the target changes every place it appears. An alias carries its own title — only content is shared. An alias may target any non-alias card kind, including a Markdown card or a space card, but never another alias: aliasing is a single hop, so an alias never points at itself and alias chains cannot form.

Authoring an alias changes its title or which Card it targets, and it is renamed where it is drawn. Opening an alias exposes only that metadata. It does not author the target's content; the target Card must be opened explicitly to edit that content at its single source of truth, so every alias then shows the change.
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

Activating is not itself an edit — it touches no Card and no Graph, so it converts nothing. Which Graph is active may become the authored default when another Edit records the surrounding View. On an Algorithmic View, where no Layout is selected, emphasis is the whole of it: the emphasised Graph is not the one a new Edge joins, because conversion returns Graphs of the View's own (ADR 0045).
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

**Completion outcome**:
What an authoring attempt produces: **completed**, **unchanged** or **refused**, and never more than one. Completed is an Edit. Unchanged is the value the author already authored — a rename to the stored title, a swatch already chosen, a drag returned to where it began — so it produces no Edit and needs no explanation. Refused is an operation that cannot happen now — stale context, or a domain rule the author has run into — and produces no Edit either, but carries a stable machine identity (a **refusal** code) and only the typed domain context that code needs; application composition owns the wording and where it is shown, never the domain (ADR 0057).

None of the three is an error. A refusal is an anticipated outcome of attempting an Edit, not an exception, which is why it is named apart from one. A broken invariant is neither completed, unchanged, nor refused — it throws, or is reported through the non-throwing reporter, because dressing a programming defect as a refusal would put it in front of the author as their own mistake.
_Avoid_: error, failure, exception (all reserved for a broken invariant or a thrown/reported defect — never for one of the three outcomes), validation error.

**Replacement epoch**:
Which generation of the working Space a piece of local work was made against. Replacing the working Space wholesale — accepting the stored Space is the only thing that does it — advances the epoch once, as part of the same transition that installs the replacement. Nothing else advances it: retrying, keeping local work, a change in persistence status, choosing another View or Layout, and completing an Edit all leave it where it is.

It is invalidation rather than a registry. Nothing learns which fields, pickers, drags or armed controls are open; each owner remembers the epoch its work was made under, or is keyed by it, and discards that work itself once the epoch no longer matches. Completed work is covered as well as Interaction drafts: an authoring operation that completed but is still waiting its turn behind an earlier one names identities and positions read from the Space it was derived from, so an epoch that has moved on means that work is discarded rather than applied to the Space that replaced it. Discarding it produces no Edit and is not a refusal the author asked for.
_Avoid_: revision (that is what a stored Space is versioned by, and the two move for unrelated reasons), version, generation, session, dirty flag, cancellation registry, and _opening_ (the code's superseded name for this counter, and already the word for bringing a Card up).

## Layout and views

**Layout**:
A card-to-position map the author wrote — which of a Space's Cards are in the Layout and where they sit. It belongs to the Space and is part of what the Space is. A Space may hold several Layouts, and may hold none. Membership and position are properties of the Layout, never of the Card: the same Card may be absent from one Layout and sit at different coordinates in others. A Layout may not name Cards the Space does not have.

A Layout is authored by definition; the computed kind is not a layout at all but an automatic **layout strategy** (ADR 0014). An **Algorithmic View** the application supplies renders a subject of Cards and Graphs, and **editing turns that into a Layout**: the View returns the Cards and positions already on screen along with one or more Graphs, so nothing moves at the moment it happens. Every Graph it returns carries a new identity owned by the new Layout, so no conversion can leave two Layouts owning one Graph (ADR 0045).

A Layout owns a non-empty ordered collection of Graphs over its Cards. Several Graphs may share Cards within that Layout. A Layout may also name which of its Graphs opens active; otherwise its first Graph opens active.
_Avoid_: view (a View is application-supplied and carries no authored positions), placement as a synonym (a Layout *holds* a placement, and adds an identity, a title and its owned Graphs), diagram, manual and custom and free-form (a layout is authored, so the qualifiers say nothing).

**Placement**:
The card-to-position map itself — which Cards are present and where they sit, and nothing more. A **Layout** is the authored thing a Space holds; the placement is the map inside it. It is also what an automatic **layout strategy** computes and what the positioned strategy reads, and it is the same value in both directions: editing an Algorithmic View copies the computed placement into the new Layout, which is the crossing ADR 0025 describes.

A Layout's placement is **sparse** relative to the Space, and omission is meaningful: a Card the map leaves out is not in that Layout and is not rendered there. Adding an existing Card to a Layout writes its position. Removing it from the Layout removes that entry and the incident Edges the Layout owns without deleting the Card from the Space. Omission is never the origin.

**Add Card** creates a new Card and adds it to the current Layout. **Add to Layout** adds an existing Card with its initial position. **Move Card** changes the position of a Card already in the Layout. **Remove from Layout** removes its membership, position and incident Layout-local Edges. “Place” is not a separate domain operation: every Card in a Layout necessarily has a position.

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

A View is an interface with two sides (ADR 0045). It receives its subject — Cards, and zero or more Graphs — and renders it; when an author edits it, it returns what a Layout is made of: those Cards with their positions, and one or more Graphs, which may hold no Edges. Two rules hold at that boundary. Every Edge endpoint of every returned Graph is one of the returned Cards. Every returned Graph carries a new identity. What a View does between its two sides is its own business, and there are no kinds of View in the domain — only different subjects.
_Avoid_: screen, page, panel, mode. Space-scoped and Graph-scoped as named kinds (a View has a subject, not a type).

**Algorithmic View**:
A spatial View that uses an automatic **layout strategy** over its subject and renders the computed Card positions on the canvas. A View whose subject is the Space's Cards — Grid, an alphabetical list, Flow — draws every Graph in the Space, flattened across its Layouts, which no Edge can escape because every endpoint is a Card of the Space. A View whose subject is the Cards one Graph connects, such as a future tree, draws that Graph. The subject is what differs; neither is a kind of View.

A viewer chooses between the application's Algorithmic Views and the Space's Layouts as the primary canvas renderer. The Space may name either as its default renderer; a viewer may have a default Algorithmic View of their own; failing both, the application supplies one. Choosing one is navigation, not an edit, and never changes the Space by itself.

Nothing tracks whether a viewer is editing, and there is no edit mode. Editing an Algorithmic View creates a new Layout from the Cards and positions already on screen; moving or connecting a Card, or choosing Add Graph, therefore converts before writing the Edit. A connection or Add Graph may create the new Layout's first Graph as part of that same Edit. Whatever Graphs a conversion returns, the Graphs the View was drawing are left unchanged, because what it returns are new Graphs and not those ones. Editing a Layout changes that Layout directly. Conversion retains no relationship to the View or layout strategy that produced those initial positions: selecting another View later is a fresh rendering choice, not undo or reversal.
_Avoid_: layout, arrangement, algorithm.

**Canvas renderer**:
A View or a Layout in the role of drawing its Cards on the canvas.
_Avoid_: choice (the value names the available renderers and which is current,
not an act), canvas alone (the canvas is the one surface being drawn), and names
taken from the control that draws it — selector, menu item, row.

**Cards View**:
An application-supplied collection View of the Space's Cards absent from the selected Layout. Its current rendering is a Sidebar, but that mounting location is not part of the View's identity.
_Avoid_: Space-card palette, Card panel, Sidebar as the domain name.

**Exporting**:
Projecting a space into the repository-friendly form an author can review, commit and share. Exporting is not what makes an edit durable; it records the space outside Hyper at a chosen revision.
_Avoid_: saving, publishing, syncing.

**Opening**:
Bringing a single card's content up in place, over whatever view the author is in, to author it. A Markdown Card opens on its Title and Markdown source, verbatim and editable; an Alias opens on the two things it owns, its own Title and Target, and on nothing of the Card that Target names — that Card is opened explicitly to author its content, at the single source of truth every Alias then shows; and a Space Card opens on its nested Graph to explore. Opening is not presenting — the View it happens over is still the thing being worked in, and a Markdown Card is only ever drawn *rendered* by presenting. There is no separate reading state: what a Card opens on is what an author edits, because they were always the same bytes in the same order.
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
Selecting a Card clears any Selected Edge, and selecting an Edge clears the Selected card: authoring has one selected subject, never a multi-selection.
_Avoid_: focus (that is the browser's, and a Card may be selected without it), highlight, current Card, Active Card (that belongs to Graph navigation or Presenting).

**Selected Edge**:
The one Edge an authoring gesture will act on in the Active Graph. Selecting it reveals the controls that reconnect or delete that Edge; it does not author the Edge, activate its Graph, or move keyboard focus by itself. An Edge outside the Active Graph cannot remain selected. Selecting an Edge clears the Selected card, and selecting a Card clears the Selected Edge: authoring has one selected subject, never a multi-selection.
_Avoid_: Active Edge (Active belongs to the Graph and Card used by Graph navigation or Presenting), focused Edge (focus is the browser's), highlighted Edge.

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

# Hyper

Graph-native technical content. Cards of content live in spatial Layouts; authors connect them into curated directed Graphs and offer different Space Views onto them. This glossary is the shared language for that domain — it holds no implementation detail (file formats, storage, and rendering libraries are out of scope here), with one exception noted at the end.

## The space

**Space**:
The whole authored world, and the top-level of the domain model: Cards organised into spatial Layouts, with each Layout carrying the Graphs authored across its Cards. Everything else — Cards, Layouts and their Graphs — belongs within a Space; Computed Views are supplied for it. Spaces may reference one another through Space Cards, and whichever Space is loaded independently is the root of that navigation context.
_Avoid_: presentation (that is one view of a space), manifest (a shipping-ledger word, wrong for an authored, reshapeable thing — retired from the code, not merely avoided), deck, document, canvas, board, file, subgraph, workspace (used loosely for the loaded Space and for the app chrome around it — say Space, or Sidebar/canvas for the chrome).

A **new space** is one Card, centered in an authored Layout with its initial empty Active Graph — not an empty canvas (ADR 0018, ADR 0068). The empty Graph can be authored but not presented. One Card is the starting state, not a permanent minimum: deliberate deletion may later leave the Space with no Cards.

**Entry Space**:
The one Space the application opens when no Space has been named. Entry is application-level context rather than a kind or property of Space; any Space loaded independently is the root of its own navigation context.
_Avoid_: Root Space as a special kind, home Space, default Space.

**Id**:
The durable UUID that names a referenceable thing — a Space, Card, Space View, or Graph. It is the entity's only identifier and is unique within that entity's scope: Space and Computed View ids are global, while Card, Layout and Graph ids are unique within their owning Space. A Graph belongs to one Layout but its id is unique across the whole Space, because a Computed View drawing every Graph flattened across Layouts keys colour, handles and activation on that id alone (ADR 0045). Different entity kinds may carry the same UUID, and ids scoped to one Space may be reused in another, with one exception: Computed Views and Layouts share the Space View id namespace and may not collide for a Space. References carry the id directly in the scope that resolves it rather than pairing it with a second authored or machine-facing name.

An author need not supply one when introducing an entity. Anything accepted into Hyper receives an id before it becomes part of a Space; once assigned, changing it is a real edit because every reference names it.
_Avoid_: guid, key, slug, local id, authored id, and any pairing of a "human" id with a "durable" one.

## Cards

**Card**:
A single addressable piece of a space, and the thing a Graph's Edges run between. Named for HyperCard's card.

A card has a **Title**, which names it wherever it is listed or drawn, and a **kind**, which owns everything else: the additional fields, the opened editor, and what the Card front draws around the Title. Card fronts keep one uniform geometry across kinds. Markdown owns its body; Alias owns its Target. There is no shared Description, summary, or second content slot on Card.

A card is one of three kinds, and the kind is what its content is: **Markdown** — written directly by the author; a **space** — a nested graph the viewer opens and explores in place; or an **alias** — another card, shown again here.
_Avoid_: node, slide, page, tile, subgraph. For the content: prose (it may be a table, a diagram or code, not only writing), body (works for markdown, but a space card's content is a graph).

**Space Card**:
A card of kind **space**: a reference to another Space, shown through the target's selected Space View and Graph. The Space reference is immutable but the selections are authored on the Card; many Space Cards may show the same Space differently, and deleting one never deletes its target. Space Card references may converge but may not form a cycle.
_Avoid_: subspace, portal, link, nested space (as a second name for the same thing — it is a Space, full stop).

**Alias**:
A card that shows another card's **content** read-only: the same content appearing again elsewhere in the space, with a single source of truth, so editing the Target changes every place it appears. An Alias carries its own Title and chooses its immutable Target when created; it may target any non-Alias card kind, including a Markdown Card or a Space Card, but never itself or another Alias.

An Alias is authorable as a Card and through the Layouts and Graphs that contain it: it may be renamed, moved, connected, Opened, Closed and Resized. An Open Alias renders its Target's content without authoring it; the Target Card must be opened explicitly to author that content or its kind-specific configuration.
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

Activating is not itself an edit — it touches no Card and no Graph, so it converts nothing. Which Graph is active may become the authored selection when another Edit records the surrounding Space View. On a Computed View, where no Layout is selected, emphasis is the whole of it: the emphasised Graph is not the one a new Edge joins, because conversion returns Graphs of the Computed View's own (ADR 0045).
_Avoid_: selected Graph and current Graph as a second concept alongside this one, focus, mode.

**Authoring**:
Interacting with a Space in a way that may change its authored Cards, Graphs, or Layouts. Authoring includes attempts that produce no change; only a successful authoring interaction produces an **Edit**. Navigating a Space View, activating a Graph, selecting a Card or an Edge, and presenting are not authoring because they do not change the Space. **Opening a Card is authoring**, because which Cards are open is a property of the Layout (ADR 0064) — it was not, while opening drew a Card on a surface over the canvas and left nothing behind.

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
Which generation of the working Space a piece of local work was made against. Replacing the working Space wholesale — accepting the stored Space is the only thing that does it — advances the epoch once, as part of the same transition that installs the replacement. Nothing else advances it: retrying, keeping local work, a change in persistence status, choosing another Space View, and completing an Edit all leave it where it is.

It is invalidation rather than a registry. Nothing learns which fields, pickers, drags or armed controls are open; each owner remembers the epoch its work was made under, or is keyed by it, and discards that work itself once the epoch no longer matches. Completed work is covered as well as Interaction drafts: an authoring operation that completed but is still waiting its turn behind an earlier one names identities and positions read from the Space it was derived from, so an epoch that has moved on means that work is discarded rather than applied to the Space that replaced it. Discarding it produces no Edit and is not a refusal the author asked for.
_Avoid_: revision (that is what a stored Space is versioned by, and the two move for unrelated reasons), version, generation, session, dirty flag, cancellation registry, and _opening_ (the code's superseded name for this counter, and already the word for bringing a Card up).

## Space Views and Layouts

**Space View**:
One way of seeing a Space's Cards. A Space View is either a Computed View the application supplies or a Layout the author wrote; both share one identity namespace, and the distinction between them is not part of how someone chooses or addresses one.
_Avoid_: View alone, canvas renderer, screen, page, panel, mode.

**Computed View**:
An application-supplied Space View that carries no authored Space state. It receives a subject of Cards and Graphs and uses an automatic Layout strategy; editing converts what it shows into a new Layout without retaining a relationship to the Computed View.

A Computed View's Id is stable independently of its mutable product name and is the same in every Space for which the application supplies it. Different subjects do not make named kinds of Computed View: Grid, Flow, sorts and future trees or clusters are simply different ways of seeing Cards.
_Avoid_: Algorithmic View, built-in View, layout, arrangement, algorithm.

**Layout**:
A card-to-rect map the author wrote — which of a Space's Cards are in the Layout, where they sit, their Open/Closed state, and the Open Size each remembers. It belongs to the Space and is part of what the Space is. A Space may hold several Layouts, and may hold none. Membership, position, Open/Closed state and Open Size are properties of the Layout, never of the Card: the same Card may be absent from one Layout, sit at different coordinates in others, and be Open at different sizes in each. A Layout may not name Cards the Space does not have.

A Layout is the authored kind of **Space View**; the computed kind is not a layout at all but a **Computed View** using an automatic layout strategy (ADR 0014). Editing a Computed View turns it into a Layout by returning the Cards and positions already on screen along with one or more Graphs, so nothing moves at the moment it happens. Every Graph it returns carries a new identity owned by the new Layout, so no conversion can leave two Layouts owning one Graph (ADR 0045).

A Layout owns a non-empty ordered collection of Graphs over its Cards. Several Graphs may share Cards within that Layout. A Layout may also name which of its Graphs opens active; otherwise its first Graph opens active.
_Avoid_: Computed View, placement as a synonym (a Layout *holds* a placement, and adds an identity, a title and its owned Graphs), diagram, manual and custom and free-form (a layout is authored, so the qualifiers say nothing).

**Placement**:
The card-to-rect map itself — which Cards are present, where they sit, whether each is **Open** or **Closed**, and its remembered **Open Size**, and nothing more. A **Layout** is the authored thing a Space holds; the placement is the map inside it. Every Closed Card has the same **Closed Size** by domain rule, so that fixed size is not authored alongside each Card. Placement is also what an automatic **layout strategy** computes and what the positioned strategy reads, and it is the same value in both directions: editing a Computed View copies the computed placement into the new Layout, which is the crossing ADR 0025 describes.

A Layout's placement is **sparse** relative to the Space, and omission is meaningful: a Card the map leaves out is not in that Layout and is not rendered there. Adding an existing Card to a Layout writes its position. Removing it from the Layout removes that entry and the incident Edges the Layout owns without deleting the Card from the Space. Omission is never the origin.

**Add Card** creates a new Card and adds it to the current Layout. **Add to Layout** adds an existing Card with its initial position. **Move Card** changes the position of a Card already in the Layout. **Open** and **Close** change whether a Card is Open, and **Resize** changes its Open Size. Closing preserves that size for the next Open; a Card without one receives the default when first Opened. **Remove from Layout** removes its membership, rect and incident Layout-local Edges. “Place” is not a separate domain operation: every Card in a Layout necessarily has a position.

An Open Card **displaces** the Cards `+x` and `+y` of it, each taking its growth on its own coordinate. The displacement is derived from which Cards are Open and is never part of the placement: closing a Card removes it exactly, and the authored coordinates are what the author wrote whatever is open (ADR 0064). A drawn position is therefore not an authored one, and a Card that moved reports where it was drawn.

This is not the placement layer ADR 0004 rejected. That was an entity sitting *between* a Card and its position, which Edges and Graphs referenced instead of the Card, so one Card could occupy two positions. A placement is keyed by Card and holds at most one position for each.
_Avoid_: arrangement (ADR 0005 — applying a strategy produces no separate entity), layer.

**Layout strategy**:
A named strategy for arranging a space's cards — how they are organised and positioned. Which cards it arranges is the Space View's choice, not the strategy's.

A strategy is either **automatic** or **positioned**. An automatic strategy computes placement from the Cards and Graphs alone — a grid, Cards ordered by name, a tree, a cluster map, a Graph-driven placement — so it needs nothing from the Space and carries no authored data. The positioned strategy reads a **Layout**. Every Layout has a strategy that renders it; not every strategy has a Layout behind it.

No strategy is the primary one. A space is arranged by whichever the author or the application chose, the set of them grows, and any particular graph-layout engine is one member of it rather than the thing layout means.

An automatic strategy has nowhere to record where an author put a card, so editing a Computed View **converts** it: the positions the strategy computed are copied into a new Layout and the edit is written there. That crossing — computed positions becoming authored — is the only one between them, and an edit is what triggers it.
_Avoid_: arrangement (applying a strategy produces no separate entity — the cards themselves carry the positions), algorithm, engine.

**Cards View**:
An application-supplied collection of the Space's Cards absent from the selected Layout. Its current rendering is a Sidebar, but that mounting location is not part of the collection's identity.
_Avoid_: Space-card palette, Card panel, Sidebar as the domain name.

**Exporting**:
Projecting a space into the repository-friendly form an author can review, commit and share. Exporting is not what makes an edit durable; it records the space outside Hyper at a chosen revision.
_Avoid_: saving, publishing, syncing.

**Opening**:
Bringing a single card's content up **on the Card itself**, by growing it where it already sits. A Markdown Card opens on its Title and rendered Markdown; putting a caret in its source is a separate Edit. An Alias opens on its own Title and its immutable Target's content read-only, while the Target Card must be opened explicitly to author that content. A Space Card opens on the Space View it selects. Opening is not presenting — the canvas it happens on is still the thing being worked in — and Open Markdown content reads through the same renderer used while presenting.

A Card is **Open** or **Closed**, and that state is a property of the **Layout**, not of the Card and not of the viewer: opening a Card is an Edit, it survives a reload, and any number of a Layout's Cards may be Open at once. Every Closed Card has the fixed Card size. Every Open Card has an **Open Size**: the concrete dimensions authored when it first Opens and changed by Resize. Close preserves the Open Size, so reopening returns to it. Resizing is a Card capability, not behavior supplied by a Card kind; a kind decides what its Open Card contains.

Putting a caret in one of an Open Card's fields is a separate gesture from Opening. The surface may keep transient caret and content-edit state locally while that interaction is live; only the authored Space must not persist which field is being typed into, exactly as it does not persist which title field is currently being renamed on the graph.
_Avoid_: Expanded and expansion as state beside Open and Opening, preview, popup, modal, dialog, drill-down, view mode and edit mode for content Opening (which has one surface, the Card). The still-built Alias metadata-authoring dialog is the explicit exception until ADR 0070 is built: the dialog is not content Opening and does not make the Alias Open.

**Entering**:
Crossing into the Space a Space Card references, so that Space takes the canvas and brings its own command surface. Entering is not Opening: Opening draws the target's Space View inside the Card and leaves the containing Space on the canvas, while Entering replaces what is being worked in. An entered Space is edited exactly as one opened directly is. It begins on the Space View and Graph its Space Card selects, and changing either while inside is navigation rather than an Edit — the Space Card and the target Space both keep their authored selections. **Exit** is the one action that closes an entered Space, and it refuses while that Space holds work it cannot save.
_Avoid_: drilling in, zooming in, descending, push and pop, navigating into (as a name for the action — Entering is the name).

**Open Spaces**:
The Spaces open at once in one session, and the surface that draws them beside the Space Sidebar. Each entry names one Space. Selecting an entry switches to that Space and closes nothing, and an entry remembers nothing about how it was reached, so closing one Space never closes another. Every open Space keeps its own live Space View and Graph selection for as long as it is open. An entry may mark a Space that has stopped saving.
_Avoid_: rail (that is a Card's toolbar), tab (that is a browser's), stack (the model in which selecting an outer Space closes everything inside it, considered and rejected), breadcrumb, depth.

**Presenting**:
Traversing a Graph through a Space View for an audience, drawn close enough that one Card fills the screen. At the Active Card, the presenter follows one of the Active Graph's outgoing Edges, including the applicable cross-Space Edges carried through Space Cards. A Graph that is a line traverses as a line; a Graph that forks offers a choice. There is no separate artefact and no second surface — a presentation is not a thing a Graph is turned into, it is a way of moving through one.
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

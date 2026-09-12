# Hyper

Graph-native technical content. Things hold the content and live in spatial Diagrams; authors connect them into curated directed Graphs and offer different Diagrams onto them. This glossary is the shared language for that domain — it holds no implementation detail (file formats, storage, and rendering libraries are out of scope here), with one exception noted at the end.

## The space

**Space**:
The whole authored world, and the top-level of the domain model: Things organised into spatial Diagrams, with each Diagram carrying the Graphs authored across its Things. Everything else — Things, Diagrams and their Graphs — belongs within a Space. Spaces may reference one another through Space Things, and whichever Space is loaded independently is the root of that navigation context — loading a Space changes what you are navigating, never what owns it.
_Avoid_: presentation (that is one view of a space), manifest (a shipping-ledger word, wrong for an authored, reshapeable entity — retired from the code, not merely avoided), deck, document, canvas, board, file, subgraph, workspace (used loosely for the loaded Space and for the app chrome around it — say Space, or Dock/canvas for the chrome).

A Space has its own **name**, stored on the Space document. A Space Thing that points at a Space carries its own Title, and that Title is what the Thing front draws (ADR 0083). The two are independent values: creating a Space Thing writes one name into both, so they agree at creation, and either one may be renamed afterwards without the other. Neither is the authority for the other, and nothing propagates between them. A Space is renamed from inside it, by one Edit on that Space's own session.

A **new space** is one Thing in one centered Diagram with one empty Graph — not an empty canvas (ADR 0018, ADR 0079). One Thing is the starting state, not a permanent minimum: deliberate deletion may later leave the Space with no Things.

**Meta Space**:
The one permanent Space, at the root of Space Thing ownership. No Space Thing creates it and no deletion reaches it, so it is the only Space that need not be referenced to survive (ADR 0074). Every ordinary Space is created by creating its first Space Thing and deleted by deleting its last, which is what makes every Space operation a Thing operation.

Its identity is repository state rather than a kind or property of Space, and there is one of it per repository: first initialization establishes it and nothing later moves it, so no Space becomes or stops being Meta by being flagged, ordered, counted or referenced (ADR 0077, ADR 0078). Opening the application without another destination opens the Meta Space's canonical URL; a repository that has none is initialized before anything is served, and stored state the Meta identity contradicts fails explicitly rather than being repaired or guessed at. Any Space loaded independently is still the root of its own navigation context — Meta is where navigation starts, not what owns the Space you are in.
_Avoid_: root Space, home Space, default Space, Space directory, Entry Space (a mutable per-repository flag, retired with the lifecycle above).

**Aggregate**:
Every Space at once, with the Meta Space named as its root. It is what Exporting projects and what Importing replaces, and it is the unit those two operations work in — never one Space chosen from among them. What makes a set of Spaces an aggregate rather than a pile is the rooting rule: every ordinary Space must be reached by some Space Thing, and one that nothing reaches is refused (ADR 0074). The aggregate **contains** the Meta Space; it is not the Meta Space, and it is not one Space and its Things either — that is a **Space snapshot**, the complete, fully identified form of a single Space (ADR 0088).
_Avoid_: aggregate as a name for one Space and its Things (say snapshot), aggregate root as a name for the stored Meta identity (say the Meta identity row), catalog, tree, bundle, collection as a second name for the same thing.

**Id**:
The durable UUID that names a referenceable entity — a Space, Thing, Diagram, or Graph. It is the entity's only identifier and is unique within that entity's scope: Space and Thing ids are global, while Diagram and Graph ids are unique within their owning Space. Thing ids are aggregate-global because a complete Meta-rooted aggregate indexes Things across independently stored Spaces; a Graph belongs to one Diagram but its id is unique across the whole Space. Different entity kinds may carry the same UUID, and Diagram or Graph ids scoped to one Space may be reused in another. References carry the id directly in the scope that resolves it rather than pairing it with a second authored or machine-facing name.

An author need not supply one when introducing an entity. Anything accepted into Hyper receives an id before it becomes part of a Space; once assigned, changing it is a real edit because every reference names it.
_Avoid_: guid, key, slug, local id, authored id, and any pairing of a "human" id with a "durable" one.

## Things

**Thing**:
A single addressable piece of a space, and what a Graph's Edges run between.

A Thing has a **Title** and a **kind**, which owns everything else: the additional fields, the opened editor, and what the Thing front draws around the Title. Thing fronts keep one uniform geometry across kinds. Markdown owns its body; Alias owns its Target. There is no shared Description, summary, or second content slot on Thing, and the Thing front draws no text the author did not write there — a kind shows as treatment, not as a line of prose beneath the Title.

A Title is one or more **Title Lines**. The first line is the Thing's **name**: it is what every surface that lists or refers to the Thing shows, and it is the Thing's accessible name. The lines after it draw only on the Thing front, beneath the name, at descending typographic weight. They name and qualify the Thing — they are not content, which lives in the body an Open Thing reads. A Title with one line is the ordinary case and the whole of what most Things have.
_Avoid_: heading, label, caption as a name for the Title itself (a caption is the role the third and later Title Lines take), and description or subtitle as a name for a separate field — there is no separate field.

A Thing is one of three kinds, and the kind is what its content is: **Markdown** — written directly by the author; a **space** — a nested graph the viewer opens and explores in place; or an **alias** — another Thing, shown again here.
_Avoid_: Card (retired by ADR 0085), node, slide, page, tile, subgraph. For the content: prose (it may be a table, a drawing or code, not only writing), body (works for markdown, but a Space Thing's content is a graph).

**Space Thing**:
A Thing of kind **space**: a reference to another Space, shown through the target's selected Diagram and Graph. The Space reference is immutable but the selections are authored on the Thing; many Space Things may show the same Space differently. The Space Things referencing a Space own its lifetime together: deleting one leaves the target alive while another reference remains, and deleting the last one deletes the target and every Space below it that nothing else references (ADR 0074). Space Thing references may converge but may not form a cycle.
_Avoid_: subspace, portal, link, nested space (as a second name for the same entity — it is a Space, full stop).

**Alias**:
A Thing that shows another Thing's **content** read-only: the same content appearing again elsewhere in the space, with a single source of truth, so editing the Target changes every place it appears. An Alias carries its own Title and chooses its immutable Target when created; it may target any non-Alias Thing kind, including a Markdown Thing or a Space Thing, but never itself or another Alias.

An Alias is authorable as a Thing and through the Diagrams and Graphs that contain it: it may be renamed, moved, connected, Opened, Closed and Resized. An Open Alias renders its Target's content without authoring it; the Target Thing must be opened explicitly to author that content or its kind-specific configuration.
_Avoid_: reference, link (an alias shows content, it does not merely jump), copy, transclusion, mirror.

## Graphs

**Graph**:
A curated directed structure over the Things in one Diagram — a narrative an author wants a viewer to traverse. Graphs are a Diagram's only connection structure: there is no separately authored connection between Things. A Graph belongs to exactly one Diagram and is authored only through that Diagram.

A Graph is a set of directed **Edges** between Things, and the set may be empty while an author prepares a new narrative. A Thing may have several Edges out — a **fork** — and several in — a **merge**; Graphs may also contain cycles and self-Edges. A Graph is not a line; a line is the shape a Graph takes when every Thing has one Edge out.

A Diagram keeps its one or more Graphs in a stable authored order. This order organises Graphs and supplies the fallback Active Graph; it does not order traversal within a Graph. New Graphs append, deletion preserves the relative order of survivors, and manual reordering is a separate authoring operation. The last Graph cannot be deleted through Graph management.

A Diagram holds one or many Graphs; each Graph has a title and may have a colour so Graphs can be told apart when the Diagram shows several at once. An empty Graph is fully authored and may be active, but cannot be presented until it has an Edge. A Space with no Diagram has no Graphs; creating a Diagram also creates its initial empty Active Graph in the same Edit.

Every Edge in a Graph connects two Things present in the Graph's Diagram. Removing a Thing from a Diagram therefore removes every Edge incident to that Thing from all Graphs in that Diagram as part of the same Edit; Graphs that become empty remain. The Thing still belongs to the Space and may remain present in other Diagrams.
_Avoid_: route, path, track, tour, journey, sequence, rail, step.

**Edge**:
A directed connection from one Thing to another, and the element a Graph is made of. An author draws one and the Graph records it. An exact Edge appears at most once in a Graph; drawing it again changes nothing. An Edge belongs to one Graph, so two Graphs crossing the same pair of Things hold two Edges.
_Avoid_: link, connection, transition, arrow, step, relationship.

**Active Graph**:
The one Graph selected in the current Diagram — drawn emphasized, and the Graph an author's new Edges join. There is one concept here, not two: a Graph is active, and highlighting is how that is shown. A Diagram may name which Graph opens active; failing that it is the Diagram's first Graph. Changing it is a deliberate act, never a side effect of drawing or reading.

Activating is not itself an edit — it touches no Thing and no Graph. Which Graph is active may become the authored selection when an Edit records the surrounding Diagram.
_Avoid_: selected Graph and current Graph as a second concept alongside this one, focus, mode.

**Authoring**:
Interacting with a Space in a way that may change its authored Things, Graphs, or Diagrams. Authoring includes attempts that produce no change; only a successful authoring interaction produces an **Edit**. Navigating a Diagram, activating a Graph, selecting a Thing or an Edge, and presenting are not authoring because they do not change the Space. **Opening a Thing is authoring**, because which Things are open is a property of the Diagram (ADR 0064) — it was not, while opening drew a Thing on a surface over the canvas and left nothing behind.

**Interaction draft**:
A transient value owned by the surface conducting an unfinished authoring interaction — a title field's changed text, a picker's unconfirmed target, React Flow's connection or drag attempt, an armed destructive control's confirmation state. None of these is part of the Space or an Edit waiting to be persisted, so cancelling discards the draft and needs no compensating Edit.

A completed Edit is authoritative local work rather than a draft, and a draft may outlive the Edit that opened it: Add Thing and Add Graph complete before their follow-up title fields open, so cancelling that rename keeps the entity the Edit created. Replacing the working Space invalidates the drafts outstanding against the Space it replaced.
_Avoid_: Draft Space, pending Edit, unsaved Edit, working copy.

**Edit**:
A validated transition from one Space to another that changes its authored Things, Graphs, or Diagrams. An attempted gesture is not itself an Edit: cancelling it, drawing an Edge the Graph already holds, or moving a Thing away and back produces no Edit because the Space does not change.

One Edit may change several authored parts atomically. Creating a Thing at the end of a drawn Edge may create the Thing, mint the Diagram's first Graph, add the Edge, and write the Thing's position into a Diagram; together they are one Edit, not a sequence of smaller Edits.

**Completion outcome**:
What an authoring attempt produces: **completed**, **unchanged** or **refused**, and never more than one. Completed is an Edit. Unchanged is the value the author already authored — a rename to the stored title, a swatch already chosen, a drag returned to where it began — so it produces no Edit and needs no explanation. Refused is an operation that cannot happen now — stale context, or a domain rule the author has run into — and produces no Edit either, but carries a stable machine identity (a **refusal** code) and only the typed domain context that code needs; application composition owns the wording and where it is shown, never the domain (ADR 0057).

None of the three is an error. A refusal is an anticipated outcome of attempting an Edit, not an exception, which is why it is named apart from one. A broken invariant is neither completed, unchanged, nor refused — it throws, or is reported through the non-throwing reporter, because dressing a programming defect as a refusal would put it in front of the author as their own mistake.
_Avoid_: error, failure, exception (all reserved for a broken invariant or a thrown/reported defect — never for one of the three outcomes), validation error.

**Availability**:
Whether an authoring operation may be started now, given what is already in progress. A live rename, a creation pane over the canvas, an Open Thing, a Diagram whose placement has not resolved — each withholds some operations and leaves others available. Availability is one question with many answers, not one rule per control: the same facts decide what the Space's command surface offers and what the canvas offers, and an answer omitted at one of them is how two surfaces come to disagree about the same operation.

An unavailable operation is **not a refusal**. Nothing was attempted, so there is no Edit to refuse and no refusal code to name; the three completion outcomes describe an attempt that was made, and availability decides which attempts a surface offers to make in the first place.

Availability reads what is in progress and never reads the Space. Whether a proposed Edge may exist is a different question with a different answer, taken against the Space itself.
_Avoid_: eligibility (that is the Space's answer about a proposed entity — an Edge between two Things — and this one never reads the Space), permission, enabled and disabled (how a surface draws an answer, not the answer; a withheld command may equally be absent), refusal (reserved for an attempt that was made), mode.

**Replacement epoch**:
Which epoch of the working Space a piece of local work was made against. Replacing the working Space wholesale — accepting the stored Space is the only operation that does it — advances the epoch once, as part of the same transition that installs the replacement. Nothing else advances it: retrying, keeping local work, a change in persistence status, choosing another Diagram, and completing an Edit all leave it where it is.

It is invalidation rather than a registry. Nothing learns which fields, pickers, drags or armed controls are open; each owner remembers the epoch its work was made under, or is keyed by it, and discards that work itself once the epoch no longer matches. Completed work is covered as well as Interaction drafts: an authoring operation that completed but is still waiting its turn behind an earlier one names identities and positions read from the Space it was derived from, so an epoch that has moved on means that work is discarded rather than applied to the Space that replaced it. Discarding it produces no Edit and is not a refusal the author asked for.
_Avoid_: revision (that is what a stored Space is versioned by, and the two move for unrelated reasons), version, generation, session, dirty flag, cancellation registry, and _opening_ (the code's superseded name for this counter, and already the word for bringing a Thing up).

## Diagrams

**Diagram**:
A Thing-to-rect map the author wrote — which of a Space's Things are in the Diagram, where they sit, their Open/Closed state, and the Open Size each remembers. It belongs to the Space and is part of what the Space is. A working Space always has at least one Diagram and may hold several. Membership, position, Open/Closed state and Open Size are properties of the Diagram, never of the Thing: the same Thing may be absent from one Diagram, sit at different coordinates in others, and be Open at different sizes in each. A Diagram may not name Things the Space does not have.

A Diagram owns a non-empty ordered collection of Graphs over its Things. Several Graphs may share Things within that Diagram. A Diagram may also name which of its Graphs opens active; otherwise its first Graph opens active.
_Avoid_: Layout (retired by ADR 0085 — it named both this entity and the behaviour that arranges Things, which is why a **layout strategy** keeps the word and this does not), View, placement as a synonym (a Diagram *holds* a placement, and adds an identity, a title and its owned Graphs), manual and custom and free-form (a Diagram is authored, so the qualifiers say nothing).

**Placement**:
The Thing-to-rect map itself — which Things are present, where they sit, whether each is **Open** or **Closed**, and its remembered **Open Size**, and nothing more. A **Diagram** is the authored entity a Space holds; the placement is the map inside it. Every Closed Thing has the same **Closed Size** by domain rule, so that fixed size is not authored alongside each Thing. Placement is also what an automatic **layout strategy** computes and what the positioned strategy reads.

A Diagram's placement is **sparse** relative to the Space, and omission is meaningful: a Thing the map leaves out is not in that Diagram and is not rendered there. Adding an existing Thing to a Diagram writes its position. Removing it from the Diagram removes that entry and the incident Edges the Diagram owns without deleting the Thing from the Space. Omission is never the origin.

**Add Thing** creates a new Thing and adds it to the current Diagram. **Add to Diagram** adds an existing Thing with its initial position. **Move Thing** changes the position of a Thing already in the Diagram. **Open** and **Close** change whether a Thing is Open, and **Resize** changes its Open Size. Closing preserves that size for the next Open; a Thing without one receives the default when first Opened. **Remove from Diagram** removes its membership, rect and incident Diagram-local Edges, giving back the room it held if it was Open. “Place” is not a separate domain operation: every Thing in a Diagram necessarily has a position.

Opening a Thing **displaces** the Things `+x` and `+y` of it, each taking the Thing's growth on its own coordinate. The displacement is applied **by the Edit that causes it** and written into the placement like any other authored move: Open applies the growth, Close applies its negation, and Resize applies the difference (ADR 0084, which reverses ADR 0064 on this point). Between those Edits nothing is derived — a drawn position **is** an authored one, and a Thing that moved reports where it now sits. Open and Close each read the placement as it is at that moment and remember nothing about how it got there, so Close reclaims from every Thing currently beyond the closing Thing, including ones the author moved there while it was open — and, the same rule read from the other side, from none at all when the Thing being closed has itself been dragged past the neighbours its own Open displaced.

This is not the placement layer ADR 0004 rejected. That was an entity sitting *between* a Thing and its position, which Edges and Graphs referenced instead of the Thing, so one Thing could occupy two positions. A placement is keyed by Thing and holds at most one position for each.
_Avoid_: arrangement (ADR 0005 — applying a strategy produces no separate entity), layer.

**Layout strategy**:
A named strategy for arranging a Space's Things — how they are organised and positioned. Which Things it arranges is the Diagram's choice, not the strategy's.

It keeps the word *layout*, which here is the verb. The **Diagram** is the authored artifact; a layout strategy is the behaviour that positions Things, and two of the three that ship read no Diagram at all (ADR 0014, ADR 0085).

A strategy is either **automatic** or **positioned**. An automatic strategy computes placement from Things and Graphs alone — a grid, Things ordered by name, a tree, a cluster map, a Graph-driven placement — so it needs no authored positions and carries no authored data. Automatic strategies are non-addressable application capabilities. The positioned strategy reads a **Diagram**, and it is the strategy V1 uses to render selectable Diagrams.

No strategy is the primary one. A space is arranged by whichever the author or the application chose, the set of them grows, and any particular graph-layout engine is one member of it rather than what layout means.

_Avoid_: arrangement (applying a strategy produces no separate entity — the Things themselves carry the positions), algorithm, engine.

**Things View**:
An application-supplied collection of the Space's Things absent from the selected Diagram. Its current rendering is a drawer reached from the Command Dock's Things cluster, but that mounting location is not part of the collection's identity (ADR 0082).
_Avoid_: Space-Thing palette, Thing panel, drawer or Dock as the domain name.

**Exporting**:
Projecting the complete aggregate into the repository-friendly form an author can review, commit and share. The unit is every Space at once, rooted at the Meta Space, rather than one Space chosen from among them. Exporting is not what makes an edit durable; it records each Space outside Hyper at the revision it was read at.
_Avoid_: saving, publishing, syncing; exporting a single Space.

**Aggregate directory**:
The on-disk form Exporting projects and Importing replaces: a directory holding `hyper.json` (naming the Meta Space) and one child directory per Space, each named for that Space's Id in lower case and holding `space.json` plus Thing markdown (`*.md` beside the space file and under `things/`). Anything else in those directories is preserved across a round trip; what Exporting removes is exactly what Importing scans. Reading an Aggregate directory also identifies any omitted nested Ids before the persistence seam sees the Aggregate.
_Avoid_: catalog, bundle, export root as a second name for the same artifact.

**Importing**:
Taking a complete aggregate from outside Hyper and making it the stored one. It either establishes the aggregate of a repository that has none, or replaces the stored one outright — never both, and never partly. Importing does not merge, reconcile or add to what is stored, and it does not rewrite what it read.
_Avoid_: loading, restoring, syncing; merging.

**Opening**:
Bringing a single Thing's content up **on the Thing itself**, by growing it where it already sits. A Markdown Thing opens on its Title and rendered Markdown; putting a caret in its source is a separate Edit. An Alias opens on its own Title and its immutable Target's content read-only, while the Target Thing must be opened explicitly to author that content. A Space Thing opens on the Diagram it selects. Opening is not presenting — the canvas it happens on is still what is being worked in — and Open Markdown content reads through the same renderer used while presenting.

A Thing is **Open** or **Closed**, and that state is a property of the **Diagram**, not of the Thing and not of the viewer: opening a Thing is an Edit, it survives a reload, and any number of a Diagram's Things may be Open at once. Every Closed Thing has the fixed Thing size. Every Open Thing has an **Open Size**: the concrete dimensions authored when it first Opens and changed by Resize. Close preserves the Open Size, so reopening returns to it. Resizing is a Thing capability, not behavior supplied by a Thing kind; a kind decides what its Open Thing contains.

Putting a caret in one of an Open Thing's fields is a separate gesture from Opening. The surface may keep transient caret and content-edit state locally while that interaction is live; only the authored Space must not persist which field is being typed into, exactly as it does not persist which title field is currently being renamed on the graph.
_Avoid_: Expanded and expansion as state beside Open and Opening, preview, popup, modal, dialog, drill-down, view mode and edit mode for content Opening (which has one surface, the Thing).

**Entering**:
Crossing into the Space a Space Thing references, so that Space takes the canvas and brings its own command surface. Entering is not Opening: Opening draws the target's Diagram inside the Thing and leaves the containing Space on the canvas, while Entering replaces what is being worked in. An entered Space is edited exactly as one opened directly is. It begins on the Diagram and Graph its Space Thing selects, and changing either while inside is navigation rather than an Edit — the Space Thing and the target Space both keep their authored selections. **Exit** is the one action that closes an open Space, whether it was Entered or opened directly. It waits on an in-flight commit and refuses for `failed` and `conflicted`, each of which names a recovery — Retry, or Accept remote and Resolve; it warns and permits Exit for `rejected`, where the work is certainly lost and there is no recovery to name.
_Avoid_: drilling in, zooming in, descending, push and pop, navigating into (as a name for the action — Entering is the name).

**Open Spaces**:
The Spaces open at once in one session, and the surface that draws them. Which surface that is, and whether it is the Space's own command surface or one beside it, is treatment (ADR 0082). Each entry names one Space. Selecting an entry switches to that Space and closes nothing. Every open Space keeps its own live Diagram and Graph selection for as long as it is open. An entry may mark a Space that has stopped saving.

Every open Space records its **Opener**: the Space it was Entered from, or none for one opened directly. A Space is never its own Opener. An address is not a crossing, so a Space a URL *opens* records none — the Space being worked in when the location changed is left beside it rather than above it. The Opener is recorded once, at the crossing that first opened the Space, so a URL resolving to a Space already open changes nothing: crossing back into a Space is returning to it rather than Entering it, and it keeps the Opener it joined the set with.

**The Opener is a history and never a containment**, which is what keeps closing one Space from closing another. Exit closes only the Space exited, whether or not anything was Entered from it; what was Entered from an exiting Space stays open and takes over that Space's own Opener, so every open Space has one and the record stays whole.
_Avoid_: rail (that is a Thing's toolbar), tab (that is a browser's), stack (the model in which selecting an outer Space closes everything inside it, considered and rejected), breadcrumb, depth, switcher (it named the set after `switchTo`, the operation that spends it; the Command Dock's disclosure over the set is the Open Spaces menu).

**Presenting**:
Traversing a Graph through a Diagram for an audience, drawn close enough that one Thing fills the screen. At the Active Thing, the presenter follows one of the Active Graph's outgoing Edges, including the applicable cross-Space Edges carried through Space Things. A Graph that is a line traverses as a line; a Graph that forks offers a choice. There is no separate artefact and no second surface — a presentation is not an artefact a Graph is turned into, it is a way of moving through one.
_Avoid_: deck, slide, step, slideshow, playback, present mode (that is a mode name, not the activity).

**Graph navigation**:
Moving keyboard focus through the Active Graph while working in its Diagram. It uses the same fork, merge, cycle, and backtracking rules as Presenting but remains a separate transient interaction rather than an audience-facing presentation.
_Avoid_: overview traversal, browsing, walking.

**Traversal history**:
The ordered Things actually visited during one Graph navigation or presentation interaction. It is transient viewer state used to retrace the path actually taken through merges and cycles; the Space never owns or persists it.
_Avoid_: Walk, route, trail, session, playthrough.

**Selected Thing**:
The Thing an authoring gesture will act on, named without being read. It is not opening and not activating: selecting a Thing shows nothing new and changes nothing about the Space, it says *this one*. One Thing is selected at a time, and it is what reveals the controls drawn on a Thing and what a keyboard rename acts on. Selecting is not authoring, because it produces no Edit.
Selecting a Thing clears any Selected Edge, and selecting an Edge clears the Selected Thing: authoring has one selected subject, never a multi-selection.
_Avoid_: focus (that is the browser's, and a Thing may be selected without it), highlight, current Thing, Active Thing (that belongs to Graph navigation or Presenting).

**Selected Edge**:
The one Edge an authoring gesture will act on in the Active Graph. Selecting it reveals the controls that reconnect or delete that Edge; it does not author the Edge, activate its Graph, or move keyboard focus by itself. An Edge outside the Active Graph cannot remain selected. Selecting an Edge clears the Selected Thing, and selecting a Thing clears the Selected Edge: authoring has one selected subject, never a multi-selection.
_Avoid_: Active Edge (Active belongs to the Graph and Thing used by Graph navigation or Presenting), focused Edge (focus is the browser's), highlighted Edge.

**Active Thing**:
The Thing currently reached during Graph navigation or Presenting, whose outgoing Edges are the moves available. It pairs with the **Active Graph**: the Graph names what is being traversed, and the Thing names the position in it. Going back reads Traversal history rather than the Graph, because a Thing reached by a merge has several Edges in and only the path taken says which one was used.
_Avoid_: current slide, cursor, position, step.

## At the render layer

Terms below are **React Flow's**, not ours. They are listed because we build against them directly and need to speak them precisely — not because the domain contains them. Nothing in the domain should be named after one, and no bridging term should be invented between the two.

**Edge (React Flow's)**:
React Flow's drawn line between two nodes, and the gesture that draws one. It shares its name with the domain's **Edge** because it is the same relation seen twice — the one place a render-layer word and a domain word coincide, deliberately, rather than a bridging term.

**Handle**:
React Flow's attachment point on a node, where an edge meets it or an author begins or ends drawing one. A Thing has four Graph-independent anchors, one on each side; the side is interaction geometry and is not authored. A handle is role-typed, so each side carries both roles and a Thing declares eight in all. They are **anchors** before they are affordances: every Thing carries all four sides, an Edge attaches to whichever of them faces the other Thing, and that choice is made while the Edge is drawn from where the two Things are at that moment. Only where an author may take hold of one is withheld — coloured as the Active Graph, revealed on hover or Selection, and absent from a Thing the canvas does not author. None of it is a rule the model obeys.
_Avoid_: port (that is the word a graph-layout engine uses for the same attachment point, and any such engine is one implementation choice among several).

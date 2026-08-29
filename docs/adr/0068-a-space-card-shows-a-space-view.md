# A Space Card shows a Space View

Status: accepted
Supersedes: 0055, 0058, 0059, 0060
Refines: 0053, 0057
Related: 0018, 0025, 0040, 0048, 0064, 0069, 0073

The Space Card UX has been exercised by the review prototypes under
`packages/app/stories/review/`, and this decision is accepted on what they
settled. What is still a hypothesis is named where it appears: how a cross-Space
Edge is drawn, and how several leaving one Card are offered as a fork.

A **Space View** is one way of seeing a Space's Cards. It is the product-facing
term shared by Computed Views and authored Layouts, replacing **canvas
renderer**: the distinction between computed and authored remains, but someone
choosing how to see a Space should not have to translate both through a
render-layer name.

Computed Views and Layouts share one Space View identity namespace. A Space
View is selected and addressed by that id alone; whether resolution finds an
application-supplied Computed View or an authored Layout is an implementation
detail, not part of its public identity. A Computed View has one globally stable
UUID independent of its product name, while a Layout's UUID remains scoped to
its Space. A Layout whose id collides with a Computed View available to that
Space is invalid.

A Space Card references its target Space and selects which of the target's Space
Views and Graphs it displays. Many Space Cards in many Spaces may reference the
same Space. The reference is not ownership: the target Space exists
independently of every Space Card that shows it and remains directly loadable as
a root when no Space Card references it. Deleting a Space Card never deletes its
target. Deleting a Space is a separate operation, refused while any Space Card
still references it.

Space Card references may converge but not cycle. Intake rejects a reference
cycle so authored Open Space Cards cannot recursively render one another
without end. The UI may create a new Space together with its first Space Card or
point a new Space Card at an existing Space; both produce the same Card shape.

The selections belong to the Card; the selected Space View and Graph do not.
Layouts and Graphs remain owned by their Space, and Computed Views remain
supplied for that Space. Changing the Space Card's selection does not change the
Space's own active Space View or Active Graph. Every placement of one Space
Card therefore shows the same selection. Showing a different view of the same
Space requires another Space Card, rather than breaking Card identity by
putting its kind-specific configuration in a Layout.

**An entered Space carries a live selection that authors nothing.** Entering
seeds a navigation context from the Space Card's selection, and changing the
Space View or Active Graph while inside is navigation rather than an Edit: it
writes neither the Card nor the Space. Leave that Space and return to it and the
selection is the one you left, because the surface behind its entry stays
mounted. Reload and it is the Card's selection again, because nothing stored it.
**Exit closes the entry outright**, so entering that Space again seeds from the
Card exactly as the first crossing did — switching away and exiting are not the
same act, and only one of them keeps a selection alive.

This is the mechanism ADR 0069 already establishes, reached by a gesture instead
of a URL: an explicit context "wins for that navigation and never edits the
authored active selections". It is a second instance of that mechanism and not
the same object as the ordered crossings ADR 0069 encodes for a presentation
point, which belong to a traversal rather than to what is open. So the paragraph
above holds exactly as written — every placement of one Space Card still shows
the same *stored* selection, and showing a different one still needs another
Space Card. What an author does while inside an entered Space is not a placement.

The Space reference itself is immutable. A Space Card is never retargeted to a
different Space; an author creates another Space Card instead. This keeps the
Card's identity and every cross-Space Edge naming it stable, while the Card's
Space View and Active Graph selections remain editable.

The active Space View is authored for the context in which the Space is being
seen. A standalone Space, or one opened in a new browser tab, uses the Space's
selection. An embedded Space Card uses the Card's independent selection, and
entering that Card preserves it as the starting value. A new tab is the
browser's own: ADR 0069 gives every Space a durable address, so opening one
independently is a link and the application builds no tab of its own. It carries
no containing navigation or presentation state. Stored selections may remain optional for
simple manual authoring, but the UI always writes the target Space, Active Space
View and Active Graph explicitly. When manual authoring omits either selection,
the Space Card resolves it from the target Space's active selection. A Space
with no Graph still displays as an overview and editing surface; it simply
offers no Graph selection or presentation.

Deleting a Layout or Graph selected by any Space Card is refused until those
Cards select something else. One deletion never silently changes independently
configured Cards in other Spaces.

Creating a Space through the UI creates its initial Markdown Card, an authored
Layout containing that Card, and the Layout's initial empty Active Graph in one
Edit. That Layout is the new Space's active Space View. This replaces ADR
0059's no-Layout starting state; absence remains a shape manual authoring may
express rather than the state the UI creates.

Opening a Space Card embeds its selected Space View in the Card by default. The
same opened Card may be entered, adopting the target Space's full command
surface until an explicit Exit closes it, or its Space may be opened
independently in a new browser tab. Editing inside the embedded or entered
Space authors that Space; moving or resizing the containing Space Card authors
the containing Layout.

## Open Spaces

Entering does not unwind. Every Space an author enters and has not exited stays
open, and **Open Spaces** is the surface that draws them: a vertical set of
entries beside the Space Sidebar, one per open Space. Selecting an entry
switches to that Space and closes nothing. Exit is a separate, explicit command
in that Space's own Sidebar, and the root Space is never closable.

Open Spaces draws only once more than one Space is open. A surface offering a
choice between one thing does not earn permanent width from a spatial canvas,
which is the cost ADR 0053 weighed and accepted once already. It comes out of
`SIDEBAR_WIDTH` rather than adding to it, so depth costs a row and never any
width. Below the breakpoint the Sheet is a fixed width with nothing to its left,
so it has to come out of the panel there whatever the desktop does; taking it
out everywhere keeps one behaviour rather than two.

**This refines ADR 0053 twice.** That decision's command surface stays one
Space's: Open Spaces sits beside one Space Sidebar per open Space, each composed
exactly as the application composes one today, with only the active one showing.
What is session-scoped is Open Spaces, not the Sidebar. And an entry may carry a
status mark for a Space that has stopped saving — `conflicted`, `failed` or
`rejected`, and nothing else. ADR 0053's "status is not a command" is untouched:
it forbids status in a command list, and an entry is a place rather than a
command. The save lifecycle stays in that Space's own Sidebar footer.

**An entry names a Space and remembers nothing else.** It does not keep the
chain of Space Cards crossed to reach it, so closing one Space never closes
another. This amends the sentence above that once had entering last "until Back
or Escape returns to the containing Space", which is now withdrawn: Exit is the
one thing that closes a Space, Back is the browser's linear history under ADR
0069 rather than a pop, and Escape keeps the meaning ADR 0048 gives it
everywhere else. Closing a Space is too large an action to reach by the key that
cancels an edit.

**Entering a Space that is already open focuses its existing entry.** A second
entry on one Space would be two live selections over one Space identity, and the
second would show a stale derivation the moment the first edited. Two views of
one Space at once is what a second browser tab on its address is for.

**Naming.** Rail is ADR 0073's word, for a Card's toolbar, and is not reused
here. Tab is not a domain word, so it keeps meaning a browser tab. The
collection is an ordered set of open Spaces and is deliberately not a stack: a
stack is the model in which selecting an outer Space closes everything inside
it, and that model was built, compared and rejected.

## Persistence across open Spaces

More than one Space is open at once, so a Space may be left while it is still
saving, and may sit in a state it cannot save out of while the author is looking
at something else. This refines ADR 0057 with three rules.

**Switching Spaces awaits any in-flight commit on the Space being left.** That
is sufficient for the arrival case: `failed`, `rejected` and `conflicted` are
published only from the commit-result handler, so a Space cannot go bad while
idle — only as the outcome of a write it started. At the moment you leave, it
has either settled or has just landed in a bad state while you are still there.

**A conflict dialog does not open until you switch to the Space that owns it.**
The entry carries the mark instead. A dialog for a Space that is not on screen
asks for a decision about something the surface is not conducting.

**Exit waits on an in-flight commit and refuses on `failed` or `conflicted`.**
`submit` returns early when the previous state is either, so a Space parked in
one is not merely unsaved but un-saving, and `conflicted` cannot self-heal.
Closing an entry is not a way to discard state the session could not save. The
refusal carries a stable code, per ADR 0057, and names the recovery that already
exists: Retry for `failed`, Accept remote or Resolve for `conflicted`.

**Exit warns and allows on `rejected`.** This reads backwards — it is the state
in which the work is certainly lost — and it is deliberate. A permanent failure
has no recovery to point at, so refusing there would trap the entry with nothing
the author could do about it. A refusal is only worth making when it names an
action.

## Cross-Space Edges

A Space Card may be an overview in one containing Graph and a presentation
bridge in another. The working UX hypothesis is that, while the Space Card is
open, an author drags from any Card in the containing Space to a Card in the
embedded target Space. The gesture creates an Edge in the Active Containing
Graph to that Card in the Space Card's Active Graph. Exiting is the visual
inverse: dragging from a target Card to any Card in the Active Containing Graph
creates another Edge in that containing Graph.
The two Active Graphs select what each gesture connects; changing either
selection later does not retarget the Edge.

These are Edges rather than separate presentation constructs. Both directions
are owned by the containing Graph in the Layout that contains the Space Card;
the target Graph owns neither and has no knowledge that another Space
connects to it. The Space Card is the boundary each Edge passes through, not a
required endpoint.

Every Edge has symmetric `from` and `to` endpoints. A local endpoint is its Card
id, scoped by the Edge-owning Graph and Space exactly as it is today. A remote
endpoint names a Space Card in the owning Graph's Layout, then a Graph and Card
in the Space that Card references:

```text
GraphEdgeEndpoint = CardId | { spaceCard, graph, card }
GraphEdge = { from: GraphEdgeEndpoint, to: GraphEdgeEndpoint }
```

Two Card ids make a local Edge. Exactly one qualified endpoint makes a
cross-Space Edge; its direction distinguishes entry from exit. Two qualified
endpoints are invalid because one Edge crosses exactly one Space Card. The Space
Card's immutable reference supplies the remote Space, so an Edge does not repeat
it and cannot disagree with it. Intake resolves both endpoint forms to fully
qualified Space, Graph and Card locations before traversal or rendering reads
them. The Graph containing the Edge remains its sole owner.

Presentation pauses on a Space Card only when an authored Edge actually reaches
that Card. A direct Edge from another containing Card into the target Space does
not manufacture a hidden Space Card stop. Entry is optional: a Space Card needs
no Edge into its Space when it serves only as an overview or an ordinary
containing-Graph Card.

Leaving the target Space is explicit and symmetric rather than an automatic
return at a terminal Card. A second Edge in the carried containing Graph exits
the target Graph across the same Space Card; without one, the presentation
legitimately terminates there. Back retraces either crossing through normal
Traversal history. No hidden traversal phase suppresses or manufactures Edges.
Presenting the target Graph independently carries no containing Graph and
therefore sees none of its entry or exit Edges.

Presentation carries the containing Graph when it follows one of that Graph's
entry Edges. At a Card in the target Graph, the available moves are the target
Graph's own outgoing Edges plus the carried containing Graph's exit Edges whose
qualified source is that Card. Several are an ordinary fork. Nested crossings
carry a stack of those Graph contexts, one per Space Card. The same target Graph
therefore has only its own Edges when presented independently, and the
applicable entry and exit Edges of the particular containing narrative when
reached from one.

Whether a cross-Space Edge is drawn across the open Space Card and how several
cross-Space Edges are offered as a fork remain for UX exploration. They are not
limited to one: several leaving a Card are the same kind of fork as several
local Edges leaving any other Card.

Removing a Space Card from a Layout removes its incident local and cross-Space
Edges from that Layout's Graphs, as Card removal does today. The Space Card is
semantically incident to every Edge that crosses its boundary even when it is
not an endpoint. Deleting a Card, Graph or Space targeted by an Edge another
Space owns is refused until those external Edges are deleted or reconnected; one
local deletion never silently edits many independently authored Spaces. Stored
dangling Edges remain invalid.

## UX prototype

The Ladle review story compared the two canvas models that change
the authoring interaction:

- **Nested canvases:** the target Space has an independent React Flow instance
  and camera. Local target-Space authoring remains native to that instance, but
  cross-Space Edge drawing and drag completion require coordination across the
  two instances.
- **Compound canvas:** target Cards are subflow nodes in the containing React
  Flow instance. Cross-boundary authoring and reconnection remain native, but
  the embedded Space no longer has an independent camera.

Both variants exercise the same compact Space View and Graph controls, Open and
Close, resize, Enter, independent new-tab opening, entry and exit treatment,
local editing, and presentation traversal. The story was a decision surface. The
review it existed for has happened, and what it settled is written above.

The first UX review favors the **compound canvas**. It keeps local and
cross-Space Edge authoring, exit, and reconnection in React Flow's one existing
interaction model instead of introducing a modifier and coordination layer for
cross-instance drags. This is the current implementation direction, not yet an
accepted decision: editing must still establish whether sharing the containing
camera is an acceptable cost. The nested-canvas variant remains in the story as
the counterfactual for that comparison.

**Enter is exempt from that preference.** An entered Space gets its own React
Flow instance and its own camera, and is edited exactly as a Space opened
normally is. The compound canvas is a question about the *embedded* open-Card
case, where two Spaces are drawn at once and an Edge is dragged between them.
Entering draws one Space, so it has nothing to coordinate and no reason to give
up a camera.

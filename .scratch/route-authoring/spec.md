# Route authoring

Status: resolved — issues `01`–`07` resolved.

Issues `01`–`06` delivered the authoring half. User story 32 — a cyclic Route
remaining presentable — was never ticketed with them, and the gesture `04`
shipped reached it: a self-connection minted a Route that `present()` silently
declined to start. Issue `07` closed that. `routeStartCard` falls back to the
first Edge's `from` when no Card is an entry, so every schema-valid Route has a
place to begin; `routeEntryCards` still reports `[]` for a loop, which is the
honest answer to what it asks. Where a walk of a loop *ends* stays out of scope
below, with the rest of the repeated-visit presentation UX.

Decisions: ADR 0032 — Routes may contain cycles; ADR 0033 — Route authoring
uses spatial handles coloured as the active Route.

All six increments are implemented: cyclic Route intake and Edge uniqueness,
existing-Card connections, Algorithmic View conversion, first-Route minting,
Option/Alt empty-drop create-and-connect, and disabling unsupported deletion.
The problem and solution below are retained as the historical specification for
that completed stream. Detached Card creation remains out of scope: the only
built Card-creation gesture also authors an Edge from an existing Card.

## Original Problem Statement

Hyper renders authored Routes but does not yet let an author draw them. The
current card-edge dots are overview rendering machinery rather than a designed
authoring surface, and React Flow is configured with connection authoring
disabled. A new Space therefore opens with one Card and no way to grow its
structure, while an existing Space can activate and present Routes but cannot
connect its Cards.

The earlier proposal was also incomplete UX: one visually neutral handle hid
which Route would receive an Edge, and dropping a missed connection on empty
canvas created irreversible authored content by default. It additionally
forbade cyclic Routes for presentation convenience, coupling what an author may
draw to how a later surface traverses it.

## Solution

Give each hovered or selected Card four small circular, route-independent
authoring handles, one centered on each side and coloured as the active Route.
Dragging a handle to a target handle on any Card draws a directed Edge into the
active Route. During the drag, target handles appear on every Card and the
preview uses the active Route's colour and an arrowhead. The completed Edge is
stored only as its source and target Cards; chosen sides remain interaction
geometry rather than authored data.

A normal drag released on empty canvas cancels. Holding Option on macOS or Alt
elsewhere turns empty-drop into an explicit new-Card operation. A translucent
preview of the next `Card N` appears centered under the pointer; release creates
the blank Markdown Card, records its position in the current Layout, and adds
the Edge atomically. New Spaces begin with `Card 1`, and neutral Card titles use
the same highest-surviving-number rule as `Layout N`.

If no Route exists, the handles preview the first palette colour and the first
successful connection atomically creates and activates `Route 1`. Cycles,
self-edges, forks and merges are all valid authored structure. Drawing an exact
duplicate Edge in one Route changes nothing, while domain intake rejects such a
duplicate in imported or persisted data.

Every successful connection is one completed Edit. From an Algorithmic View it
copies the current card positions into a new selected positioned Layout and
applies the structural change there. From a Layout it updates that Layout. The
complete resulting Space snapshot flows through the existing session and
automatic persistence seam; cancelled and duplicate gestures do not convert or
persist.

## User Stories

1. As an author, I want to see route-authoring handles when I hover a Card, so that I can discover how to draw an Edge.
2. As an author, I want a selected Card's handles to remain visible, so that I can continue authoring without reacquiring it.
3. As an author, I want a handle on every side of a Card, so that no direction on a spatial canvas is privileged.
4. As an author, I want every handle coloured as the active Route, so that I know which Route will receive my Edge.
5. As an author in a route-less Space, I want the handles to preview the first Route's colour, so that minting the Route causes no visual surprise.
6. As an author, I want target handles to appear on Cards during a connection drag, so that valid drop targets are explicit.
7. As an author, I want target handles on the source Card too, so that I can author a self-edge.
8. As an author, I want the in-progress connection to show the active Route's colour, so that its destination remains clear throughout the gesture.
9. As an author, I want the in-progress connection to show an arrowhead, so that its direction is visible before I release it.
10. As an author, I want dragging from Card A to Card B to record `A → B`, so that gesture direction and Route direction agree.
11. As an author, I want the target Card selected after a successful connection, so that I can immediately continue the Route from it.
12. As an author, I want all Layout-visible Routes to remain on screen while editing, so that activating a Route emphasizes rather than filters.
13. As an author, I want inactive Routes dimmed, so that the active Route remains the obvious write target without hiding context.
14. As an author, I want existing Edges to appear as coloured lines without permanent endpoint controls, so that rendering detail is not mistaken for authoring UX.
15. As an author, I want releasing an ordinary connection drag on empty canvas to cancel, so that missing a target does not create authored content.
16. As an author, I want Option/Alt plus empty-drop to create a Card, so that creating content requires explicit intent.
17. As an author, I want a translucent new-Card preview under the pointer, so that I can see the exact result before committing it.
18. As an author, I want the preview and created Card centered at the same position, so that creation does not jump on release.
19. As an author, I want a new blank Card to receive the next neutral `Card N` title, so that it is immediately distinguishable on the graph.
20. As an author, I want a new Space to begin with `Card 1`, so that neutral naming is consistent from the first Card onward.
21. As an author, I want Card numbering to continue after the highest surviving exact `Card N`, so that authored custom titles do not affect neutral naming.
22. As an author, I want Card creation, placement and connection to complete atomically, so that no partial structure becomes a Space.
23. As an author, I want the first successful connection in a route-less Space to mint and activate `Route 1`, so that authoring can begin from the initial Card.
24. As an author, I want cyclic Routes and self-edges to be accepted, so that presentation concerns do not constrain what I can draw.
25. As an author, I want drawing an existing Edge again on the same Route to change nothing, so that an accidental duplicate is harmless.
26. As an importer, I want duplicate Edges within one Route reported as invalid input, so that a Route remains a set without silently normalising authored data.
27. As an author, I want the same Card pair to be usable in different Routes, so that each Route remains independent.
28. As an author working in an Algorithmic View, I want the first successful connection to create and select a positioned Layout without moving existing Cards, so that the structural Edit also freezes the arrangement I saw.
29. As an author working in an existing Layout, I want a connection Edit to update that Layout rather than create another, so that its authored identity is preserved.
30. As an author, I want cancelled and duplicate gestures to leave renderer selection and persistence unchanged, so that only completed Edits have durable consequences.
31. As an author, I want a completed connection to persist automatically as one whole Space snapshot, so that cards, routes and positions cannot be committed separately.
32. As a viewer, I want cyclic Routes to remain presentable through deliberate Walk moves, so that the authoring model does not imply automatic infinite traversal.

## Implementation Decisions

- ADR 0032 supersedes the per-Route acyclicity decision. Domain intake accepts cycles and self-edges and rejects an exact duplicate source/target pair within one Route.
- ADR 0033 supersedes the single-neutral-handle proposal. Four spatial handles express one route-independent authoring operation; none of their side choices enter the Edge data.
- React Flow owns the connection lifecycle and target interaction. Application code translates only a successfully completed connection into the next complete Space snapshot.
- The connection surface uses React Flow's loose/floating connection model so any side handle may start or receive a drag while completed Edges attach to facing Card borders.
- Source handles are contextual to hover or selection. Target handles are contextual to an active connection drag. Existing Edge attachment geometry is not rendered as permanent authoring controls.
- The active Route supplies handle, preview and completed-Edge colour. With no Route, the first palette entry previews the Route that will be minted.
- Route activation remains navigation, not an Edit. It changes emphasis and handle colour without changing the Layout's Route filter or submitting persistence.
- A completed existing-Card connection selects its target. A modifier-created Card is likewise selected. Neither action opens Card content.
- Empty-drop creation is gated by Option/Alt at release. The modifier may be pressed or released during the drag; the preview follows the current modifier state.
- New Cards are blank Markdown Cards titled with the next neutral `Card N`. Neutral numbering scans exact matching surviving titles and uses the greatest number plus one, matching `Layout N`; it does not add a persisted sequence counter.
- The first connection in a route-less Space creates `Route 1`, adds its first Edge and sets it active in both runtime state and the surrounding authored Layout in one Edit. Its colour remains absent in authored data so the existing palette supplies it.
- A pure completed-connection command computes the authoritative next snapshot before the imperative shell updates editor, renderer selection and session state. Intermediate React Flow gesture state never becomes a shared Draft.
- A successful connection from an Algorithmic View copies every currently resolved Card position, adds any new Card at the previewed point, creates the next `Layout N`, applies the structural change and selects that Layout. A successful connection in a Layout updates it in place.
- Cancelled empty drops and duplicate connections return no completed Edit. They do not create a Layout, advance an editor revision, select a different renderer or submit persistence.
- The current `SpaceSession` remains the persistence boundary. This work adds no database-adapter behavior and never writes imported source files.
- Existing Layouts remain sparse under structural editing: only the active Layout gains a newly created Card position; other Layouts are not backfilled.

## Testing Decisions

- Tests assert externally observable domain and user behavior rather than React Flow store shape, Zustand event ordering or private helper calls.
- Domain intake tests prove cycles and self-edges are accepted, duplicate Edges within one Route are rejected, and the same Edge in different Routes is accepted. Property tests cover arbitrary cyclic shapes and duplicate insertion.
- Pure completed-connection tests prove atomic snapshot composition: existing Route connection, route-less minting and activation, `Card N`/`Route N`/`Layout N` naming, modifier-created placement, duplicate no-op, Algorithmic View conversion, existing Layout update and preservation of unrelated Layouts.
- Playwright drives real pointer gestures against React Flow. It covers source/target handle visibility, active-route colour, directional preview, existing-Card connection, continued authoring selection, empty-drop cancellation, Option/Alt preview and creation, first-Route minting, Layout conversion and automatic persistence.
- The existing fixture supports multi-Route emphasis and existing-Card connection. The new-space Playwright project proves `Card 1`, first-Route minting and modifier creation without introducing a database dependency.
- The read-only import test continues proving that a durable structural Edit leaves fixture source bytes unchanged.
- `pnpm verify` and `pnpm e2e` are required for every UI/graph ticket before resolution.

## Out of Scope

- Detached Card creation.
- Inserting a Card on an existing Edge.
- Deleting Cards, Edges or Routes.
- Explicit creation, naming, recolouring or reordering of additional Routes.
- Editing Card titles, descriptions or Markdown content.
- Copy and Alias authoring gestures.
- Persisting handle sides or otherwise authoring Edge attachment geometry.
- A shared mutable Draft; incomplete gestures remain inside React Flow.
- Presentation UX for explaining, limiting or visualising repeated visits through a cycle.
- Database repository, HTTP backend or exporter implementation.
- Keyboard-only and touch alternatives for the Option/Alt new-Card gesture.

## Further Notes

The older graph-editing spike remains useful evidence for controlled React Flow
state, connection lifecycle and transient preview loops, but its single-handle,
Auto-arrange and acyclic assumptions are not the design. The current
React-Flow guidance remains binding for controlled-node ownership and avoiding
measurement loops when overlaying a transient preview Card.

Issue `.scratch/active-route/issues/06-a-minted-route-is-set-active.md` is
absorbed by this effort: minting and explicitly activating `Route 1` is one
line of the first route-less completed connection, not a standalone increment.

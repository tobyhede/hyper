# Routes are authored as React Flow edges; handles are neutral, not per-route

Status: accepted
Refines: 0013
Related: 0022, 0023, 0025, 0026

On a positioned layout, an author connects two cards by dragging an edge between
them — React Flow's native connect gesture — and creates a card by dragging an
edge to empty canvas (React Flow's own add-node-on-edge-drop). Edges use React
Flow's floating-edge model: an edge attaches to the border of each card facing the
other. A node keeps a single **neutral** connection handle — React Flow needs one
to start a drag from — and that is the whole of it; there are no per-route,
per-side handles to name, place, or keep in sync. Drawing an edge from A to B
records the edge `(A→B)` on the active route (ADR 0023); dropped on empty canvas
it creates the target card first, at the drop point. That is the whole authoring
surface.

## The active route

An edge has to join *some* route, and the answer is the one already on screen:
**the active route is the selected route**, seeded on load by the Layout's
`activeRoute` (ADR 0022). Every edge drawn joins it. A second edge out of one card
is a **fork** within that route — allowed now that a route is a graph, where the
old step-line would have rejected it. Creating a *new* route is an explicit action,
never a side effect of drawing. In a brand-new space with no routes yet, the first
edge drawn lazily mints the route it lands in, so authoring can start from the one
card a new space opens with.

## Why

The need is small — drag to connect, drag out to create — and React Flow ships
exactly it, in two of its own examples. Building it React Flow's way is a handful
of handlers. Building it our way was a research project.

The prototype grew a per-route handle scheme in service of the ELK-computed
**overview**, where several routes overlaid on one arrangement and needed distinct
attachment points to stay legible: `<routeId>::out`/`::in` handle ids,
`FIXED_SIDE` ELK ports, `<cardId>##<handleId>` namespacing, and
`useUpdateNodeInternals` to re-measure when they moved. Every line of it earns its
place in that view. None of it is needed to draw one edge between two cards. It
leaked out of the overview and was written up in AGENTS.md as if it were a rule the
authoring model had to obey. It never was — it is one read-only view's rendering,
mistaken for a domain constraint.

Floating edges delete the part that generated the rules. With a single neutral
handle and no fixed per-side handles there is nothing to measure, no `#008`
handle-id warning, no side-ordering (`FIXED_SIDE` vs `FIXED_ORDER`), no
namespacing. The failure modes the gotchas warn about stop existing rather than
being managed.

## What this does not touch

ADR 0007 stands: routes are the only structure. What a route *is* changes — from
an ordered step-line to an acyclic graph of card edges (ADR 0023) — but it is still
the only authored structure, and "edge" is still React Flow's word for the drawn
line, now also the authoring gesture and the route's stored element. CONTEXT.md
already says a route renders as one edge per transition — now it is authored and
stored that way too.

ADR 0013 stands, and this leans on it. Connecting and creating both write structure
or placement, and only a positioned layout has anywhere to write them, so both
gestures live there and an automatic view offers neither. Creating a card by
dropping on canvas is coherent only because the drop point *is* an authored
position — which is exactly 0013's reason automatic views are read-only.

The **overview** — the route-driven graph, read-only, one colour per route — is a
different view and out of scope here. How it draws overlaid routes is its own
concern; legibility-under-overlay was always its problem, and the per-route
handles were its answer, not the domain's. This ADR governs the authoring surface,
which is a positioned layout.

## Consequences

`react-flow-adapter`'s handle machinery, for the authoring view, collapses to a
single neutral connection handle per node; the overview's rendering is untouched.
The AGENTS.md gotchas about port namespacing, `FIXED_SIDE`, `opacity`-not-`display`,
and `useUpdateNodeInternals` describe the overview and the old model — they are cut
or scoped to the overview in the docs pass that follows this ADR, and CONTEXT.md's
Handle entry ("distinct handles per route") narrows to an overview note.

## The cost we accept

Floating edges draw two routes that share the same card pair on top of each other
in the authoring view. Acceptable: authoring is one active route at a time, and the
overview — where many routes show at once — keeps its own rendering. If simultaneous
multi-route *authoring* ever needs visual separation, that is new work with its own
decision, not a reason to keep the handle scheme now.

A future review will find plain React Flow nodes with one neutral handle and,
remembering the AGENTS.md rules, suspect something was lost. This ADR is that
suspicion answered: the bookkeeping served the overview and was mistaken for a
domain requirement.

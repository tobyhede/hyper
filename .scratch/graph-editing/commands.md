# Graph editing — commands & triggers

The reference map for editing the graph. Design note, not a plan; we implement
incrementally and pick increments off this. Companion to the layout-feel spike
(`README.md`, `packages/app/spike.html`).

## Frame (settled)

- **React Flow input → Route → render.** Edges are *derived* from routes (ADR
  0007); React Flow is an input device onto the card/route model and never owns a
  node or an edge. Every gesture translates to a mutation on the Draft, then the
  graph is re-derived and re-laid-out.
- **Commands vs triggers.** A **command** is a domain operation on the Draft
  (create a card, add a route step, alias a card…). A **trigger** is a way to
  invoke it. Every command is assumed to have several: **mouse gesture,
  right-click menu, keyboard shortcut, toolbar/UI.** The command is the unit; the
  trigger is binding. A gesture usually carries its context inline (which handle,
  which card); keyboard/toolbar rely on the current selection plus defaults, so
  they need to resolve ambiguity a gesture resolves by where you point.

## The Draft (the substrate)

The mutable, possibly-invalid working copy ADR 0010 reserves the word for. Editing
mutates the Draft; it re-validates into a `Space` (via `loadSpace`) to render and
present. Editing forces the Draft to tolerate what a Space forbids:

- **Orphan (route-less) cards** — a card exists before it is on any route.
- **Zero routes** — a brand-new space, mid-construction.
- **The editing view draws all Draft cards**, not just route-visited ones (the
  read-only projection only draws cards a route reaches).

A route-less Draft can't go through `loadSpace` (schema requires ≥1 route), so the
editing intake is looser than the presenting intake — that gap *is* the Draft.

## Gesture vocabulary (the principle)

The gesture matches **what you grab**:

- Grab a **handle** (a connection point) → author **structure** (routes).
- Grab a **card** (content) → make another **instance** of that content (copy or
  alias).
- Grab **empty canvas** → **new content** from nothing.

~~Card-drag is free to mean "duplicate" because ELK owns placement — dragging a card
is never "reposition."~~ **No longer true (ADR 0013).** Card-drag is reposition —
placement is authored, so plain drag moves a card and copy/alias both become
modifier+drag. That settles the "which of copy/alias is modifier-free" question
below by removing the modifier-free slot entirely.

## Placement (settled by spike — the pivot)

Editing happens in a **manual ("Positioned") layout**: a `card -> {x,y}` map the
user authors, which is CONTEXT.md's already-named "hand-placed" layout kind.
Positions are a property of the *layout*, not the card — the same card sits at
different coordinates in the ELK view vs the manual one (ADR 0002 / 0005). A
`positionedLayout(map)` sits in the same seam as `elkLayout()` / `gridLayout()`;
it *reads* positions from the map where the others *compute* them.

- **Drop is placement.** A new card lands where you release it and stays; dragging
  a card writes its coordinate. No global re-layout, so nothing reshuffles.
- **ELK is a command, not the layout.** "Auto-arrange" runs `elkLayout` once and
  writes its positions *into* the same map; the ELK linear view is one layout to
  *switch to* for reading. You edit in the manual layout.
- This reverses the earlier "ELK owns placement, drop discarded" call. Three
  ELK-during-editing increments proved a global optimiser can't honour local
  placement (it reshuffles, the new card lands "randomly"). Validated by the spike
  (increment 4): direct manipulation is the answer.

## Command × trigger matrix

Bindings are illustrative where marked; the point is that each command is
reachable four ways.

| Command | Mouse gesture | Right-click | Keyboard | Toolbar |
| --- | --- | --- | --- | --- |
| New Card on Route | drag off a **handle** → drop on pane | on card → "Continue / branch route" | select card → ⏎ / Tab | "Add card" (card selected) |
| New Detached Card | double-click empty canvas | on canvas → "New card here" | ⌘N | "+ Card" |
| New Copy | drag the **card** (+modifier) | on card → "Duplicate" | ⌘D | "Copy" |
| New Alias | drag the **card** (+modifier) | on card → "Alias" | ⌘⇧D | "Alias" |

## Commands — create

### 1. New Card on Route
- **Effect.** A new *blank* markdown card + a route step. Append if dragged from a
  route's end; **branch** (a new route diverging) if dragged from a card that
  already continues.
- **Grab.** A route handle.
- **Open.** Append-vs-branch: automatic by where you drag, or an explicit pick?
  Branch **prefix** — does branching at C make `A B C E` (inherit the narrative to
  the fork, *leaning this*) or `C E` (fresh)? Non-gesture triggers must resolve
  *which* route (a card can be on several).
- **Status.** Spiked (append only), with landing preview + continuous re-layout.

### 2. New Detached Card
- **Effect.** A new blank markdown card on *no route* — an orphan.
- **Grab.** Nothing — a canvas trigger (double-click / menu / ⌘N / toolbar).
- **Why it matters.** This is the pivot: it's what forces orphan cards, a
  route-less Draft, and "draw all cards." It *is* "New Space starts with one card."
- **Open.** Placement — a detached card has no structure, so the drop point is its
  position (hand-placed until routed). New-space seed: orphan card (real model) vs
  a one-step route `[A]` (works with today's `loadSpace`, but a "route" with no
  journey).

### 3. New Copy
- **Effect.** A new *independent* markdown card, content duplicated from the source
  at copy time; no ongoing link (edits diverge). Effectively "New Detached Card,
  pre-filled with this content." Not a domain relationship — just bytes.
- **Grab.** The card (with the copy/alias modifier).

### 4. New Alias
- **Effect.** A new alias card (ADR 0009) pointing at the source: shared content,
  single source of truth, its own title. Single-hop — aliasing an alias resolves to
  the alias's target.
- **Grab.** The card (with the copy/alias modifier).

**Copy vs alias share the card-drag**, distinguished by a **modifier** (agreed);
*which* is default vs modifier is deferred. Leaning: default = alias (shared
content is the graph-native move), modifier = copy.

## Commands — structure & lifecycle (rest of the surface, less detailed)

- **Connect to existing** — drag a handle onto an existing card (not the pane): a
  route step onto a card that already exists (how branches re-merge / cross-link).
- **Insert on route** — drop on an existing *edge* (or a "+" on it): the card goes
  *between* two steps of that route (`A B C` ⇒ `A B X C`).
- **New route** — start a route (its own affordance; not an edge-drop).
- **Delete** — a card (and its steps) / a route step (an "edge") / a route.
- **Reposition** — first-class now: dragging any card body writes its coordinate
  into the manual layout's map (React Flow's native drag).
- **Edit content / metadata** — the trivial one (title, description, Markdown body).

## Open decisions (rolled up)

- Copy-vs-alias modifier: which is default. **Closed by ADR 0013** — plain drag is
  reposition, so there is no modifier-free slot; both copy and alias take one.
- Branch prefix: inherit (`A B C E`) vs fresh (`C E`). **Leaning inherit.**
- New-space seed: orphan card vs one-step route. **Orphan for the model, one-step
  for the spike.**
- Append-vs-branch: automatic-by-grab vs explicit.
- Non-gesture triggers: how they resolve route ambiguity from selection.

## Status

- **Spiked & validated:** the **manual (Positioned) layout** as the editing model
  — drag a card to reposition (it stays), drag off an edit handle to append/branch
  a card at the drop point, "Auto-arrange" runs `elkLayout` once into the map.
  Direct manipulation confirmed the right feel (increment 4).
  `packages/app/.scratch/spike/`, served at `/spike.html`.
- **Decided:** editing = a manual Positioned layout; ELK is a command/view, not the
  layout (see Placement). New Card on Route append + branch (inherit prefix) also
  spiked.
- **Next, either:** productionize — wire a `positionedLayout(map)` into the real
  `Layout` seam and decide where the position map persists in the space file (earns
  an ADR: positions become authored content, and the Positioned layout kind) — or
  spike more commands (New Detached Card / New Space, copy / alias, connect /
  insert).

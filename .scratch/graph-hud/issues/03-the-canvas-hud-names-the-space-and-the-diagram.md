# 03 — The canvas HUD names the Space and the Diagram

Status: ready-for-agent
Blocked by: 02. The identity line and the key have to agree, and until the
fixture stops flattening every Diagram's Graphs together the story would draw
`Collection 1` over a key holding a Graph that Diagram does not own.

**What to build:** The canvas HUD says what the Graphs it keys belong to. A
reader looking at the corner of the canvas learns which Space they are in and
which Diagram is drawn, without opening the Command Dock:

```
Space
Diagram
Graphs
 — Long
 — Mid
 — Short
```

## The two lines are read-only

Which Diagram is open is the Command Dock's to change, and the HUD is where it
is read. A row that looks live and answers nothing is worse than one that never
looked live, and a second place to switch Diagrams is a second thing to keep in
step with the first. The Graph rows are a separate question and not part of this
ticket — the key already marks the Active Graph and nothing here changes that.

**This was decided rather than defaulted** (prototype branch `space-structure-hud`,
story `Review/HUD Space and Diagram`), and it is the cheapest thing here to
reverse if the review disagrees.

## What it does not become

Four earlier prototype variants are on that branch and all four were rejected,
for one reason worth keeping: **a HUD that repeats the Dock earns nothing.**
The Dock already names the current Space, Diagram and Graph on its face, and
draws the open Spaces in its own menu. What the HUD adds is not those names
again in the corner — it is that the key below them finally says what it is a
key *to*. Specifically, and from the branch:

- Do not draw the open Spaces here. They are not a tree, the Dock owns the open
  set, and hanging them off each other by opener was wrong twice over.
- Do not add a collapsed pill naming Space, Diagram and Graph. At rest it is the
  Dock's three names, redrawn, for the cost of a corner.
- Do not list the Space's Diagrams. Two identity lines are not a navigator.

## Acceptance

- [ ] The HUD names the Space and the open Diagram above its Graph key
- [ ] Neither line is a control; nothing on them presses
- [ ] The names come from what the canvas is actually drawing, not from a second resolution
- [ ] The Ladle story and the application agree on all three names at once
- [ ] `pnpm e2e:ladle` green; `pnpm verify` green; `pnpm e2e` green

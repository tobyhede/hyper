# 04 — The HUD stops nesting React Flow's MiniMap

Status: resolved
Blocked by: nothing. It **supersedes ticket 03**, which is closed unbuilt, and it
deletes the constants ticket 01 introduced while keeping the assertion that
ticket 01 added.

**What to build:** The canvas HUD is React Flow's own minimap, drawn the way
React Flow draws it, plus one panel naming the current Space, the open Diagram
and the Graph key. Nothing customises the minimap beyond its documented props.

## Why this exists

`GraphHud` puts `<MiniMap>` inside a hand-rolled card inside a second `<Panel>`.
`MiniMap` is not built to be contained: it renders its own `Panel`, positions
itself, sizes itself and themes itself. Nesting it meant undoing each of those,
and the style block that resulted is four overrides deep, every one of them
damage control for that single decision:

```
position: 'relative'   // undo the Panel it renders for itself
margin: 0              // undo that Panel's inset
border: 'none'         // undo its own border
width: '100%'          // make it fill a parent it never expected
```

The fourth is not a number, and `MiniMap` divides by it — which is the `NaN`
viewBox of ticket 01. Ticket 01 answered that with a numeric width derived from
the card's own width, which is a **fifth** override propping up the other four.
Two further symptoms follow from the same root and are not separately fixable:
the map letterboxes, because `viewScale` forces the viewBox to the map element's
aspect ratio and a 212×86 box is nothing like the canvas's; and the card's
spacing is hand-rolled because the card is hand-rolled.

So the fix is not another override. It is to stop containing the component.

## What it becomes

Two siblings inside `<ReactFlow>`, each doing its own job:

- **The minimap, stock.** React Flow's visual and interaction defaults — no
  colour props, no `pannable` or `zoomable`, no `className`, no position
  override and no wrapper. Its numeric 200×150 default dimensions are repeated
  through `style` because that is the sizing input React Flow reads when it
  calculates the viewBox. The accessible product name remains.
- **The key panel**, carrying what the canvas is drawing:

```
Space
Diagram
Graphs
 — Long
 — Mid
 — Short
```

Neither identity line is a control. Choosing a Diagram is the Command Dock's
command; this is where the choice is read.

## The key stays attached, in the same corner

**The HUD does not move.** A `.react-flow__panel` is `position: absolute` against
its corner with a 15px margin, so two Panels at `bottom-right` would land on the
same point — which is the constraint that produced the nesting in the first
place. Stacking them is what removes it:

```
MiniMap     bottom-right, its own Panel, size given as numbers through `style`
Key Panel   bottom-right, marginBottom = the Panel inset + the map's height
```

Our panel is offset up by exactly the map's height, so the two meet and read as
one object in the corner they have always occupied. **Nothing about the MiniMap
is overridden**: its size comes from the documented numeric `style` (the only
sizing input it has), its skin from React Flow's own `--xy-minimap-*` variables,
and a `className` if one is wanted — all supported API. The four undo-overrides
go because nothing is containing the component any more.

**The map's height is one constant used twice, and that is not ticket 01's
problem.** There it existed only to make a child match the parent it was
fighting. Here both uses are the same fact — the map is that tall, and the key
sits that far up — so they cannot disagree about anything.

To make the two read as one card rather than two: give them a common background
through the minimap's CSS variable, and round only the key's top corners.

## What moves with it

- The `PANEL_WIDTH` / `MINIMAP_WIDTH` constants from ticket 01 are deleted. Its
  regression assertion is **kept** — a finite viewBox and a node rect smaller
  than the map are still exactly what a broken minimap fails.
- The Ladle spec asserts the key sits above the map by geometry. That assertion
  was about the nested arrangement and has to be re-read against two panels.
- `GraphHud.test.tsx`, the story fixture and the parity claims all move with the
  new props.
- Ticket 03's "What it does not become" list still stands and should be carried
  into this ticket's review: no open-Space tree, no collapsed pill repeating the
  Dock's three names, no list of the Space's other Diagrams.

## Acceptance

- [ ] `<MiniMap>` keeps React Flow's default colours and interactions, with only its accessible
      name and numeric 200×150 default dimensions supplied; no `className` or wrapper element
- [ ] The only shared number is the map's own height, and both its uses are that same fact
- [ ] The key panel names the Space and the open Diagram above the Graph key, and neither line presses
- [ ] The HUD stays in the corner it occupies today, with the key attached above the map
- [ ] The minimap draws the Diagram at a sane scale at several zoom levels, and nothing overflows its box
- [ ] `pnpm verify`, `pnpm e2e:ladle` and `pnpm e2e` green, each run once on the finished state

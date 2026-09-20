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

- **The minimap, stock in skin and interactive in behaviour.** React Flow's
  visual defaults — no colour props, no `className`, no position override and
  no wrapper. Its numeric 200×150 default dimensions are repeated through
  `style` because that is the sizing input React Flow reads when it calculates
  the viewBox. The accessible product name remains. **`pannable` and `zoomable`
  are kept**, which this ticket originally dropped as "interaction defaults":
  `XYMinimap.update` attaches d3-zoom to the minimap's SVG unconditionally and
  gates only the handlers, so dropping them bought back no canvas and cost the
  pan and the zoom — the box captured the gesture either way. Reviewed and
  reversed after the fact; see the review follow-up below.
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

Their aligned edges make them read as one HUD while their skins remain separate:
the key uses the product card surface and the MiniMap keeps React Flow's stock
theme variables. Only the key's top corners are rounded by product code; no
MiniMap colour or class override is introduced.

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

- [x] `<MiniMap>` keeps React Flow's default colours, with its accessible name, its numeric
      200×150 default dimensions and `pannable`/`zoomable` supplied; no `className` or wrapper
      element. **Amended:** this line first read "default colours and interactions" and was
      checked against a MiniMap with neither prop. That was wrong — see the follow-up below.
- [x] The only shared number is the map's own height, and both its uses are that same fact
- [x] The key panel names the Space and the open Diagram above the Graph key, and neither line presses
- [x] The HUD stays in the corner it occupies today, with the key attached above the map
- [x] The minimap draws the Diagram at a sane scale at several zoom levels, and nothing overflows its box
- [x] `pnpm verify`, `pnpm e2e:ladle` and `pnpm e2e` green, each run once on the finished state

## Answer

`GraphHud` now renders two bottom-right React Flow siblings. The key is a normal
`Panel`, offset upward by the MiniMap's 150-pixel height plus React Flow's
15-pixel panel inset. The `MiniMap` renders itself with only its accessible name
numeric 200×150 dimensions and `pannable`/`zoomable`; it has no wrapper, class,
colour or mask override. Its stock theme is deliberately independent of the
product card surface above it.

The key names the current Space and Diagram as read-only text, then lists the
open Diagram's Graphs with the Active Graph emphasised. Ladle coverage holds the
sibling geometry, identity semantics, finite MiniMap geometry and scale across
multiple zoom levels; application E2E holds the same identity on the real
canvas. The finished tree passed `pnpm verify`, `pnpm e2e:ladle` and `pnpm e2e`.

## Review follow-up

Two acceptance lines above were checked against code that did not do what they
claimed, and PR #248's review caught both.

**Interaction was not a default worth taking.** The ticket reasoned that passing
no `pannable` and no `zoomable` left "React Flow's interaction defaults". It
does — but the defaults leave a capturing dead zone rather than a pass-through
one. In `@xyflow/system`, `XYMinimap.update` ends with
`selection.call(zoomAndPanHandler, {})`, attaching d3-zoom to the SVG whatever
the props say, and gates only the handlers
(`.on('zoom', pannable ? panHandler : null)`). d3-zoom's own wheel and mousedown
handlers `preventDefault` and `stopImmediatePropagation` regardless. So the
stock minimap swallowed the gesture and did nothing with it. Both props are
restored.

The Ladle assertion that covered this was hollow in the same way: it hovered the
minimap and wheeled under a comment saying "at several canvas zooms", but
asserted only on the minimap's own drawing, which never changed. It now asserts
`.react-flow__viewport`'s computed transform actually moves.

**The key panel hands back the pointers it does not need.** Un-nesting roughly
doubled the HUD's height, and `.react-flow__panel` carries no `pointer-events`
rule of React Flow's own, so the key covered the bottom-right corner of anything
drawn under it — which is where a Thing's resize control lives, the same harm
`command-dock.css` already offsets the bottom-edge Dock to avoid. The key panel
takes `pointer-events: none`, with `pointer-events: auto` on the two truncated
name spans so their `title` stays hoverable. The minimap keeps its pointers,
being genuinely interactive again.

Three E2E tests had been edited to work around the occlusion — a `{x: 40}` grab
offset, a 1600px viewport widening and an extra zoom-out. All three are reverted
and pass at the default viewport, and the `grabAt` parameter added to `dragBy`
for the first of them is removed. The new parity claim
`graph-hud-key-hands-back-the-pointers-it-does-not-need` holds the mechanism at
both levels.

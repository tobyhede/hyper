# A Graph's Edges share one head shape, and direction always shows

Status: accepted
Refines: 0100
Related: 0033, 0104

A Graph carries a **head shape**, one of `arrow`, `vee`, `dot` or `diamond`. Every Edge in the Graph draws it at its head, meaning the `to` end. Its job is to tell Graphs apart where colour cannot: in greyscale, in print, and for a viewer who cannot tell the palette's hues apart. The head shape is authored per Graph, beside colour, because ADR 0104 already put the line's appearance with the Graph. A per-Edge style would give an Edge a second way to say which Graph it belongs to.

## What it is

- **Head only.** Nothing is drawn at the tail. One end is enough to tell Graphs apart. A tail shape would crowd every Resource that Edges leave from, and at a fork-and-merge it would sit among other Graphs' heads.
- **Direction always shows.** There is no `none`. A Graph is directed and is presented by traversal from tail to head (ADR 0024). A Graph drawn without heads would look undirected while still being traversed in one direction.
- **The four shapes** are chosen to stay distinct at small zoom, filled in the Graph's colour. `tee` and `box` are left out because they read as "blocked" and "container". They are drawn once, in `@project/ui` (`GraphHeadShapeGlyph`, and `GraphHeadMarker` around it), and every surface that shows a head shape draws them from there.
- **Every drawn Edge carries it, including Edges that stop short.** This refines ADR 0100. Under ADR 0100, only the connecting Edge carried a head, and a Graph that is not active stopped short and carried none. Now every drawn Edge ends in its Graph's head shape at its drawn head end: the end of the line as drawn, for an Edge trimmed short of its Resource. It is drawn at the Edge's own opacity. The Graphs that recede are the ones colour must tell apart, so leaving their heads off would defeat the job. The Active Graph is still the one that connects, and that is shown by its being centred, running anchor to anchor, and drawn wider and on top (ADR 0100). A head shape no longer says an Edge connects. The head is a custom SVG marker, because React Flow's built-in markers are only `Arrow` and `ArrowClosed`. It follows React Flow's own marker practice otherwise: each Graph's marker is drawn once per canvas, in one shared hidden `<defs>` (`GraphHeadMarkers` in the adapter), rather than once per Edge, and each Edge names it as the Edge object's `markerEnd`, which React Flow hands the custom Edge to forward as its path's `marker-end`. Its id is keyed by the Graph's UUID alone, which is unique on the page because a page draws Graph Edges in one `<ReactFlow>`: an embedded Map's Edges are drawn in the host canvas's flow, not a flow of their own, and the same Graph drawn twice there names the same marker with the same content. One marker serves every Edge of a Graph because every Edge of a Graph is stroked in the Graph's colour and ends in its head shape. The marker is drawn in that colour, is painted at the opacity of the path that names it, and is sized in stroke widths, so the Active Graph's wider line draws a proportionally larger head.
- **Every new Graph starts as `arrow`.** This covers `newSpace`, first-load initialization, Add Map and Add Graph. Unlike colour, nothing picks a head shape to stand apart from the Map's other Graphs. Colour already tells Graphs apart by default, and the head shape is the channel an author changes when colour is not enough. This asymmetry is deliberate.
- **Stored the way colour is stored.** `headShape` is optional on the Graph document and every creation path writes it. An absent value draws as `arrow`. Choosing the head shape a Graph already has is `unchanged`. It lives on the Graph inside the stored Map document, so it needed no migration and survives the aggregate round trip. `graphHeadShape` in `@project/core` is the one place an absent value becomes `arrow`, and `newGraph` in `@project/graph` is the one constructor every creation path uses.

## Where it shows

- The Graph menu has **Shape…** directly under **Colour…**. It opens a grid of the four shapes, the same size as the colour swatches, drawn in the Graph's colour. Choosing one is the `changed-graph-head-shape` Edit, beside `recolored-graph`; choosing the shape the Graph already draws, `arrow` for a Graph that stores none, is `unchanged`. Shape… is disabled whenever Colour… is, and an Open Space Resource's Graph menu offers it against the target Space's Graph, as it does recolour. The two grids are one `SwatchGrid`: a single tab stop on the current choice, arrow keys moving focus without choosing — except ArrowLeft at the first column, which closes the submenu onto its trigger — and Enter, Space or a click choosing. The current colour is checked over its swatch; the current head shape is checked by a badge in the swatch's corner, so the check does not cover the glyph.
- The mark beside every Graph title is a miniature Edge: a short line in the Graph's colour ending in its head shape. This applies in the overview legend, the Command Dock's Graph choices and an Open Space Resource's Graph choices. Those lists name every Graph on the Map, not just the active one, so they are where a viewer matches a receding Edge's shape to its Graph without colour. `GraphIcon`, which names only the Active Graph or the Graphs heading, is not the legend.
- The connection preview draws the Active Graph's head shape, because that is the Graph the new Edge joins. Presenting draws the same Edges and needs nothing extra.

## Vocabulary

In graph theory, an arc's **tail** and **head** are its `from` and `to` ends. `CONTEXT.md` takes those two words for the Edge and uses **head shape** for what is drawn at the head. "Marker", "end marker" and "arrowhead" are how React Flow and SVG draw it, and they stay in the render layer. The anti-slop rule against `shape` in symbol names allows the compound `head shape` and no other, so the term is written in code as `headShape`.

## Left open

- **Tail shape.** It would be a sibling property with the same shape, added if a need for it appears.
- **A per-Edge override.** It would reuse the name `headShape` and override the Graph's. It must answer ADR 0104's objection first.
- **Notation.** Ends that carry meaning, such as cardinality or composition, are a different job and are not decided here.

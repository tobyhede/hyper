# 03: The mark beside each Graph title ends in its head shape

**What to build:** The mark that pairs a Graph's title with its appearance becomes a miniature Edge: a short line in the Graph's colour ending in its head shape (ADR 0105). This applies everywhere a list names every Graph — the overview legend, the Command Dock's Graph choices and an Open Space Resource's Graph choices — so a viewer can match a receding Edge's shape to its Graph without colour. The Active Graph's icon is not the legend and keeps its present form.

**Blocked by:** 01

**Status:** done

- [x] The overview legend's mark for each Graph ends in that Graph's head shape.
- [x] The Dock's Graph choice rows and an Open Space Resource's Graph choices draw the same mark.
- [x] A Graph with no stored head shape shows `arrow`.
- [x] The mark reads the Graph's head shape from the Space, so a changed head shape redraws it in every list (proved against fixtures with differing head shapes).
- [x] Existing stories showing the mark are updated, with Ladle and application proof.

Built as `GraphLegendMark` (`packages/ui/src/GraphLegendMark.tsx`), which replaces `GraphColorLine`: a 14×10 box holding a line in the Graph's colour that runs into `GraphHeadShapeGlyph`, so the mark and the canvas's markers draw one set of glyphs. Each caller resolves the head shape through `graphHeadShape` beside `graphColor` — the HUD key and the Dock's Graph rows off the Space's own Graphs, an Open Space Resource's rows off `SpaceResourceTarget`, whose Graphs now carry `headShape`. The box lives on a wrapping span because a menu row sizes an unclassed `svg` to 16px. The two parity claims are renamed `graph-choice-rows-draw-the-graph-legend-mark` and `open-space-resource-graph-rows-draw-the-graph-legend-mark`; the Command Dock story's Mid and Short now store `dot` and `diamond` as the tracked fixture's do, with Long left as the default arrow. Redrawing on a changed head shape is proved against fixtures with differing head shapes; there is no Edit to change one until 02 lands.

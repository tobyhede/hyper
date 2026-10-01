# 05: The Resource's delete confirmation names the Maps and Graphs it reaches

**What to build:** Delete from Space's question lists, under its description, the Maps that place the Resource and the Graphs holding an Edge connected to it, each by its short name. A Graph is named with its Map when more than one Map is listed, since a Graph's name is only unique within its Map. A Resource no Map places and no Edge touches lists nothing. A Space Resource's cascade sentence stays alongside the lists.

**Blocked by:** 01 — One delete confirmation for every kind of subject

**Status:** done

- [x] What a Resource's deletion reaches is a pure domain derivation beside Delete from Space's own Edit, not worked out in the dialog.
- [x] A property test holds the derivation to the deletion: every Map it names loses the Resource's position, every Graph it names loses at least one Edge, and no other Map or Graph changes.
- [x] A Resource on two Maps with Edges in one Graph lists both Maps and that Graph; one on no Map with no Edges lists neither.
- [x] The rail's Delete from Space shows the lists for a placed, connected Resource in the running app.

**Revised after review:** the two flat lists became one tree, `MapGraphList` in `@project/ui` — each Map that places the Resource, with the Graphs it owns that hold an Edge to it beneath, each Graph marked in its colour and head shape as the Graph lists and the HUD mark it. Ownership now reads from the shape, so a Graph is no longer suffixed with its Map. The description became "Permanently deletes the Resource from the Space and all Maps and Graphs." with no sentence introducing the tree. The question stops at 32rem or the viewport, whichever is less, and the reach scrolls inside it with the caret opening on Cancel. Layout options A–D were compared in a review story and A chosen; the story was removed once A shipped.

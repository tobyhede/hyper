# Only an Edit on the canvas moves where a Space opens

Status: accepted
Refines: 0079, 0112
Related: 0028, 0115

A Space opens on its `defaultMap` (ADR 0079). An Edit through the canvas's Map records that Map as `defaultMap`, Add Map included, and writes the Map's resolved `activeGraph`. An Edit through a Map drawn inside an Open Space Resource writes that Map's content where it stands, keeps the Map's stored `activeGraph`, and leaves the target Space's `defaultMap` unchanged. Choosing or viewing a Map without editing records nothing.

This narrows ADR 0079, which said a later Edit *may* record the selection, to the rule above. It is also a difference ADR 0112 requires to be recorded, because a drawn Map otherwise offers and does everything the canvas Map does.

The reason is that `defaultMap` and a Map's Active Graph record where the author was working in that Space, and that is navigation (ADR 0028). Editing on the canvas is working in the Space the canvas shows. Editing a Map drawn inside another Space's Resource does not navigate into the drawn Map's Space. If it counted, editing a preview would change where that Space opens, and would write the drawing's Graph into the target Map as its Active Graph.

**Rejected: every Edit in a Map records it, wherever the Map is drawn.** This is the simpler reading of "a Space opens on the Map most recently edited in", and it would make the two Maps identical in this respect too. It was rejected because it moves another Space's opening selection as a side effect of authoring somewhere else.

**Cost accepted:** a Space edited only through embedded Maps keeps opening on the Map last edited on its own canvas, even when another Map has changed more recently.

The current statement of this rule, beside the rest of the Map and Graph contract, is R10 in [`docs/agents/maps-and-graphs.md`](../agents/maps-and-graphs.md).

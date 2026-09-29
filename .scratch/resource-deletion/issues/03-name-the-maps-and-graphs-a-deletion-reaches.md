# 03 — Name the Maps and Graphs a Resource's deletion reaches

Status: ready-for-agent

**What to build:** The Delete from Space confirmation lists, under its description, the Maps that place the Resource and the Graphs holding an Edge connected to it, each by its name. A Resource that no Map places and no Edge touches lists nothing.

**Why:** "Permanently deletes the Resource from the Space." says that it is gone but not what else changes. The Maps it disappears from and the Graphs that lose Edges are exactly what an author would otherwise have to go and check, and the Maps may include ones not drawn on the canvas right now.

## Build

- [ ] A pure derivation in `@project/graph` — e.g. `resourceParticipation(space, resourceId)` answering `{ maps: { id, title }[], graphs: { id, mapId, title }[] }` — read from `map.positions` and from each Map's `graphs[].edges`. It does not live in the dialog: the rule "what a deletion reaches" is domain knowledge, and `SnapshotEdit.deleteFromSpace` is the operation it has to agree with. Curate it onto the package index and `test/unit/graph-package-surface.test.ts`.
- [ ] `DeleteResourceConfirmation` renders both lists, names through `shortTitle`, in the Maps' stored order and each Map's Graphs in stored order. A Graph is named with its Map when more than one Map is listed (a Graph name is only unique within its Map).
- [ ] The Space Resource's cascade sentence stays; the lists are in addition to it.
- [ ] The UI goes through `$shadcn-first-ui`.

## Tests

- [ ] Unit/property: the derivation agrees with `deleteFromSpace` — every Map it names loses the Resource's position, every Graph it names loses at least one Edge, and no other Map or Graph changes.
- [ ] Component: a Resource on two Maps with Edges in one Graph lists both Maps and that Graph; one on no Map with no Edges lists neither.
- [ ] Application/e2e: the rail's Delete from Space shows the lists for a placed, connected Resource.

## Comments

- Asked in review of PR #325 ("would it be complicated to add the Maps and Graphs the Resource is currently participating in?"). Not complicated: the data is all on the loaded Space, the derivation is pure, and the dialog already receives the Resource; the one design point is that the rule belongs beside `deleteFromSpace` rather than in the component.

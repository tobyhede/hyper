# 03 — The other Graphs' fade follows the Active Graph

Status: resolved
Blocked by: 02

**What to build:** How strongly Graphs other than the active one recede is passed to the render adapter as a second option, `emphasis` (`equal` or `subtle`), beside the Active Graph. The one production caller derives it from the Active Graph — no Graph active is `equal`, a Graph active is `subtle` — so the two always agree in the application. The adapter still accepts them independently, which makes two pictures expressible that the product never draws: a Graph active with every other Graph at full strength and animated yet trimmed short with no arrowhead, and no Graph active with every Graph faded.

Derive the fade from the Active Graph inside the adapter and delete the option. It leaves both the Thing and the Graph Edge projections' options. The copy the Thing projection writes onto every Thing's data is read by nothing — handle dimming reads the Active Graph — so it is deleted rather than derived.

Blocked by 02 because both edit how Graph Edges are projected, not because it needs the split. It ships as its own pull request stacked on the lane work, retargeted to main once that merges.

- [x] Neither projection accepts an emphasis option; the fade is decided from the Active Graph alone.
- [x] Things no longer carry an emphasis field.
- [x] The application draws exactly what it drew before, with and without a Graph active.
- [x] Tests that passed an emphasis now pass only the Active Graph, or none.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green.

## Answer

`GraphEmphasis` and the `emphasis` option are gone from both projections, and `OTHER_GRAPH_OPACITY` is one number: an Edge is at full strength and animated when its Graph is active or no Graph is, and recedes otherwise. The unread `emphasis` field left Things. The fade tests now assert through the Active Graph alone. The doc comment the type carried argued for "a level rather than a boolean" in case a view wanted more than on/off; no view did, and the one caller derived it. `pnpm verify` (2846 tests), `pnpm e2e` (222) and `pnpm e2e:ladle` (111) green.

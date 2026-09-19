# 03 — The other Graphs' fade follows the Active Graph

Status: ready-for-agent
Blocked by: 02

**What to build:** How strongly Graphs other than the active one recede is passed to the render adapter as a second option, `emphasis` (`equal` or `subtle`), beside the Active Graph. The one production caller derives it from the Active Graph — no Graph active is `equal`, a Graph active is `subtle` — so the two always agree in the application. The adapter still accepts them independently, which makes two pictures expressible that the product never draws: a Graph active with every other Graph at full strength and animated yet trimmed short with no arrowhead, and no Graph active with every Graph faded.

Derive the fade from the Active Graph inside the adapter and delete the option. It leaves both the Thing and the Graph Edge projections' options. The copy the Thing projection writes onto every Thing's data is read by nothing — handle dimming reads the Active Graph — so it is deleted rather than derived.

Blocked by 02 because both edit how Graph Edges are projected, not because it needs the split. It ships as its own pull request stacked on the lane work, retargeted to main once that merges.

- [ ] Neither projection accepts an emphasis option; the fade is decided from the Active Graph alone.
- [ ] Things no longer carry an emphasis field.
- [ ] The application draws exactly what it drew before, with and without a Graph active.
- [ ] Tests that passed an emphasis now pass only the Active Graph, or none.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green.

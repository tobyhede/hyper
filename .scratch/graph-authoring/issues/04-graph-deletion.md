# 04 — Graph deletion through both context adapters

Status: ready-for-agent
Blocked by: 03

**What to build:** Add `map(mapId).graph(graphId).delete`, an asynchronous capability answering the surviving `{ kind: 'completed', mapId, graphId }`. The last Graph of a Map is unavailable at read and at invocation (ADR 0079); every Space Resource that selects the deleted Graph is repointed in the same Edit (ADR 0076). Survivor preference mirrors `.scratch/command-outcomes/issues/08`: the Active Graph the context shows when it is not the one going, otherwise the Map's `activeGraph ?? graphs[0]` among the survivors. `graph-delete` becomes a reported channel. See `../spec.md`.

**Why:** Deletion carries the largest locality gain — today the Dock passes `preferredGraphId: null` and the rail the Map's `activeGraph`, so the two contexts disagree on where the author lands.

- [ ] Both surfaces spend delete through `offered`; the rail's `deleteDisabled` and the Dock's `editsDisabled` for delete are replaced by the capability's `available`.
- [ ] The embedded adapter refuses while the containing Space is unsettled; the top level relies on the lifecycle's own recovery refusal.
- [ ] Contract tests hold the survivor rule against both contexts, including an author moving the Active Graph while the deletion runs.
- [ ] The Dock's `navigation.activateGraph` follow-up is removed if removing it fails no test; if something fails, the ticket records what.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green.

## Comments

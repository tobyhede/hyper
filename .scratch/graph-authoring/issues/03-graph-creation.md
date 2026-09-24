# 03 — Graph creation through both context adapters

Status: ready-for-agent
Blocked by: 02

**What to build:** Add `map(mapId).create`, an asynchronous capability completing `added-graph` and answering `{ kind: 'completed', mapId, graphId }` of the Graph it made. The embedded adapter owns what `coordinatedContextCreate` does today: wait for both Spaces, recheck, create, wait for the target to save, write the Space Resource's selection, wait for the containing Space. Add a `graph-create` reported channel with "Graph not created", "Graph not saved" and "Graph not selected", mirroring Map creation. The Dock's gate stays `entityEdits`. See `../spec.md`.

**Why:** Creation is one Graph Edit with two context-specific sequences, exactly as Map creation was (`.scratch/command-outcomes/issues/07`).

- [ ] Both surfaces spend create through `offered` and publish on `graph-create`; `graph-edit` no longer carries creation.
- [ ] Space state is rechecked at invocation and again after the embedded wait; a target exited during the wait creates nothing.
- [ ] Coordination failures return complete reports under the three titles; a throw is a break.
- [ ] Each surface keeps its current continuation behaviour; the rail still does not continue into the new Graph's name.
- [ ] The contract suite covers completed, withdrawn, refused, unchanged and the embedded ordering ("persists a new Graph before the Resource refers to it").
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green.

## Comments

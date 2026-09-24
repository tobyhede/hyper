# 02 — Graph rename and recolour through both context adapters

Status: ready-for-agent
Blocked by: 01

**What to build:** Introduce `packages/app/src/graph-authoring-commands.ts` with `map(mapId).graph(graphId)` answering synchronous `rename` and `recolor` capabilities, and a public constructor per context (`topLevelGraphAuthoringCommands`, and the embedded one) built over one private definition of each context shared with the Map module — addressing, completion, before/after waits — extracted from `map-authoring-commands.ts` in this ticket. Top level addresses only the Active Graph of the selected Map; embedded addresses any Graph of the target while it is the open entry. `graph-edit` becomes a reported channel: Graph authoring owns "Graph unchanged" and its message. See `../spec.md`.

**Why:** Rename and recolour are the synchronous slice, so they prove the interface and the shared context before asynchronous coordination joins it — as ticket 06 of `.scratch/command-outcomes` did for Map rename.

- [ ] Both surfaces spend rename and recolour through `offered`; the Dock's rename gate stays `chromeTitleEdit` and recolour's stays `entityEdits`.
- [ ] Invocation rechecks Graph existence and addressing (and, embedded, entry identity); a stale invocation answers `unavailable` and publishes nothing.
- [ ] A refused rename or recolour returns the complete report; `graph-edit` holds and dismisses it. The rail's local sentence for these is gone.
- [ ] A refused rename is said twice on both surfaces: inline (the editor holds the draft) and as the `graph-edit` notice. The Dock's Graph branch of `renameChromeTitle` goes.
- [ ] `graph-authoring-commands.test.ts` runs a rename and a recolour contract against both adapters, plus what each context addresses; a source scan holds that the module imports no continuation, React or DOM.
- [ ] The Map module's contract suite still passes over the shared context.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green.

## Comments

# 05 — Contract the old Graph command interface

Status: ready-for-agent
Blocked by: 04

**What to build:** Make the Command Dock and the Open Space Resource rail consume only the Graph authoring capabilities. Delete `coordinated-context-create.ts`, the Graph arm of `coordinated-context-delete.ts`, `runGraphEdit`, `DockGraph.editsDisabled`, the rail's `deleteDisabled`, and the second command shape in `SpaceResourceSelectors` so Map and Graph commands reach `@project/ui` in one shape. Remove App-mount Graph tests whose rule the contract suite now holds. See `../spec.md`.

**Why:** Tickets 02–04 expand the new form beside the old so each lands green; this completes the refactor, as `.scratch/command-outcomes/issues/09` did for Maps.

- [ ] Each surface derives a Graph command's unavailable treatment and invocation from one capability; no separate flag can disagree with it.
- [ ] `coordinated-context-create.ts` is deleted; `coordinated-context-delete.ts` is deleted or holds nothing Graph-specific.
- [ ] `SpaceResourceSelectors` takes one command shape for both selectors; `ui` still names no app type.
- [ ] Superseded tests are removed (`graph-delete-notice.test.tsx` and the Graph cases of `space-resource-context-commands.test.ts` are the candidates); tests proving distinct surface treatment remain.
- [ ] The deletion test holds: removing the Graph module would redistribute availability, the last-Graph rule, persistence ordering, the survivor rule and report translation across both callers.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green.

## Comments

# 02 — Map, Graph and Reference refusals through command outcomes

Status: ready-for-agent
Blocked by: 01

**What to build:** Move the Authoring-refusal notices onto their channels: Map create → `map-create`, Map manage (rename, recolour and the like) → `map-manage`, the Graph cluster's commands (`reportGraphEdit`, `App.tsx:1400`) → `graph-edit`, and `createReferenceFrom` (:972-1016) → `reference-create` with its `continueAt`. See `../spec.md`.

**Why:** `createMapRefusal` and `mapManagementRefusal` share one notice whose title switches on which was written last (:1389, :1767); four more `useState` slots each hand-roll narrow → describe → set.

## Build

- [ ] `createMapRefusal`, `mapManagementRefusal`, `graphRefusal`, `referenceRefusal` and `mapRefusal` are deleted from App.
- [ ] Map create and Map manage are two notices with fixed titles, each dismissing only itself.
- [ ] `createReferenceFrom` keeps its offset maths (`Placement.growth`, ADR 0093) and hands the continuation to `continueAt`.
- [ ] Their `refusedUnder` lines go; the reset covers them through the table.

## Tests

- [ ] `command-outcomes.test.ts` gains the four channels' titles and describers.
- [ ] One `Application` test: a refused Map creation and a refused Map rename can stand at once, as two notices.

## Done when

- [ ] `rg "setCreateMapRefusal|setMapManagementRefusal|setGraphRefusal|setReferenceRefusal" packages/app/src` is empty.
- [ ] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` is not applicable.

## Comments

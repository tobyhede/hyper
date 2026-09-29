# 01 — An Open Resource is deletable

Status: done
Tags: regression

**What to build:** Delete from Space is offered on a Resource's Actions menu whether or not that Resource, or any other Resource on the Map, is Open.

**Why:** `authoring-availability.ts` withdrew `deleteResource` while `resourceIsOpen`, which `map-view.ts` computed as "any Resource on the selected Map is Open". Opening one Resource therefore removed Delete from every Resource's menu, leaving Remove from Map as the only removal in sight.

The rule was a regression rather than a decision. Before ADR 0064 moved Open/Closed onto the Map, Navigation held one session-level `openedCardId` that nothing cleared on a Delete, so deleting the opened Card left a dangling id. `aeff31374` ("fix: reconcile card deletion after rebase") translated `openedCardId === null` into "no Card in the Layout is Open" to keep it compiling. That widened the rule from one Card to every Resource, and kept a rationale that no longer held: the Open state is now the Resource's position entry, and `SnapshotEdit.deleteFromSpace` reclaims the room it held and removes that entry from every Map.

## Build

- [x] `deleteResource = entityEdits`; the comment states why an Open Resource stays deletable.
- [x] `resourceIsOpen` is deleted from `AuthoringInProgress` and `MapView`, since the rule was its only reader.

## Tests

- [x] `resource-rail-actions.test.tsx`: an Open Resource offers both Remove from Map and Delete from Space.
- [x] `editing.spec.ts`: with B Open, A still offers Delete from Space, and deleting B removes it and persists.
- [x] `space-resource-context-menu.ts`: an Open Space Resource's trailing group is `['Remove from Map', 'Delete from Space']`.
- [x] The availability-table row, the "withholds only Delete Resource while a Resource is open" case and `mapView`'s `resourceIsOpen` case are deleted with the field.
- The reclaim itself was already held by `packages/graph/test/snapshot-edits.property.test.ts` ("leaves every other Resource where a delete before Open would have").

## Done when

- [x] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` is not applicable: no story changed.

## Comments

- The fix was written before this ticket existed, so its tests were not driven red-first.

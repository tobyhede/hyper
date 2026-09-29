# 02 — Delete from Space in the Resources list

Status: ready-for-agent

**What to build:** Every Resource row in the Dock's Resources list (`ResourcesPopover`, `place` purpose) offers Delete from Space. It arms the same `resourceDeletion` confirmation the Resource's Actions menu arms, and it is offered exactly when that menu's Delete is (`availability.deleteResource`). Space rows (the Meta Space's Spaces) offer no delete: a Space is not a Resource of this Space. The `connect` purpose offers no delete.

**Why:** Delete from Space only appears on the toolbar of a Resource placed on the Map being drawn. After Remove from Map, the Resource lives only in the Resources list, which offers placing and nothing else. So a Resource on no Map cannot be deleted without first putting it back on a Map, and one on another Map only after switching to that Map.

## Build

- [ ] A Resource row carries a Delete from Space control beside its placing button, as a sibling rather than nested inside it. It is named `Delete <name> from Space` and is keyboard-reachable.
- [ ] Pressing it calls `resourceDeletion.arm(resource)`. The existing App-root confirmation, `resource-delete` / `space-resource-delete` channels and refusals (`resource-has-references`) are reused unchanged.
- [ ] The control is absent while `deleteResource` is unavailable.
- [ ] The UI goes through `$shadcn-first-ui`: `@project/ui` first, then the registry. Any new hand-rolled block in `styles.css` is recorded in `design-system-inventory.ts`.

## Tests

- [ ] Component: a Resource row offers `Delete <name> from Space`; a Space row and a `connect` row do not; activating it calls the handler with that Resource and does not place it.
- [ ] Application: removing a Resource from the Map and then deleting it from the Resources list removes it from the Space, and it no longer appears in the list.
- [ ] e2e: the same journey through the confirmation, persisted.

## Done when

- [ ] `pnpm verify`, `pnpm e2e` and, if a `ResourcesPopover` story changes, `pnpm e2e:ladle` are green.

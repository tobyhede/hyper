# 05 — Option/Alt empty-drop creates and connects `Card N`

**What to build:** Add the explicit create-and-connect gesture. A normal connection released on empty canvas cancels; holding Option on macOS or Alt elsewhere previews and atomically creates the next neutral Card at the chosen position with an Edge from the source Card.

**Blocked by:** 04 — The first connection mints and activates `Route 1`.

**Status:** resolved

- [x] Releasing an ordinary connection drag on empty canvas creates nothing, advances no completed-Edit revision and submits no persistence.
- [x] Pressing Option/Alt while a connection is over empty canvas shows a translucent preview of the Card that would be created.
- [x] Releasing Option/Alt during the drag removes the preview and restores cancellation behavior; pressing it again restores the preview.
- [x] The preview is centered at the eventual persisted position and carries the exact next neutral `Card N` title.
- [x] Releasing with Option/Alt creates a blank Markdown Card, its active-Layout position and the directed Edge from the source Card atomically.
- [x] The created Card becomes selected without opening its content, leaving its source handles visible for continued authoring.
- [x] Neutral Card naming scans exact surviving `Card N` titles, uses the greatest number plus one, ignores custom titles and adds no persisted sequence counter.
- [x] Creating in an existing Layout updates that Layout only; other Layout position maps remain sparse and are not backfilled.
- [x] Creating from an Algorithmic View copies existing resolved positions, adds the previewed Card position and selects the next `Layout N` without moving existing Cards.
- [x] Creating in a route-less Space additionally mints and activates `Route 1` in the same complete snapshot.
- [x] Transient preview measurement changes cannot enter the authoritative node list or cause a controlled React Flow render loop.
- [x] Pure tests cover Card naming, blank Markdown content, exact placement, existing-Layout update, Algorithmic View conversion and route-less atomic creation.
- [x] Playwright proves ordinary cancellation, live modifier preview, centered `Card N` creation, target selection, resulting Edge and automatic persistence.
- [x] Imported fixture source bytes remain unchanged after Card creation.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Evidence

- `packages/app/src/edit-completion.ts` composes the blank Markdown Card, exact
  position, directed Edge, optional `Route 1` and optional `Layout N` conversion
  into one validated completed Edit while preserving unrelated sparse Layouts.
- `packages/app/src/components/GraphView.tsx` keeps the live Option/Alt preview in
  a viewport portal outside the authoritative node array and converts real
  pointer coordinates through React Flow's public flow-position API at release.
- `packages/app/e2e/new-space.spec.ts` proves cancellation, live modifier
  toggling, centered creation, selection, continued authoring, route-less
  minting and automatic persistence. `editing.spec.ts` proves Algorithmic View
  conversion without moving existing Cards.
- `packages/app/e2e/read-only.spec.ts` compares the complete imported fixture
  tree and every source byte before and after Card creation.
- Final verification on 2026-08-01: `mise exec -- pnpm verify` passed 63 test
  files and 528 tests; `mise exec -- pnpm e2e` passed all 50 tests.

# 04 — The first connection mints and activates `Route 1`

**What to build:** Let the one Card in a new route-less Space begin Route authoring immediately. Its first successful connection creates a valid first Route, makes it active, converts the Algorithmic View and persists the complete result atomically.

**Blocked by:** 03 — Connecting from an Algorithmic View converts atomically.

**Status:** resolved

- [x] A new Space's initial Card is titled `Card 1` rather than `Start here`.
- [x] A route-less Space shows the four authoring handles on its hovered or selected Card even though no active Route exists yet.
- [x] Those handles and the connection preview use the first palette colour that the minted Route will receive.
- [x] A successful first connection creates `Route 1` with no authored colour override and adds the completed Edge as its first Edge.
- [x] The new Route becomes the runtime active Route and is written as the new Layout's `activeRoute` in the same completed Edit.
- [x] A self-edge is a valid first connection.
- [x] The new Layout copies the resolved position on screen, is selected and becomes the Space's `defaultView` without visual movement.
- [x] Route creation, activation, Layout conversion and Edge creation submit exactly one complete snapshot.
- [x] Cancelling the first connection leaves the Space route-less, keeps the Algorithmic View selected and submits nothing.
- [x] Pure tests cover neutral Route naming, palette continuity, route activation and atomic route-less snapshot composition.
- [x] The new-space Playwright project proves the `Card 1` seed, first connection, `Route 1` activation, Layout conversion and automatic persistence.
- [x] Resolving this ticket also resolves `.scratch/active-route/issues/06-a-minted-route-is-set-active.md` with a pointer to the implementation and verification evidence.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Evidence

- `packages/app/src/edit-completion.ts` composes the minted neutral Route, first Edge, explicit `activeRoute`, positioned Layout and `defaultView` into one validated snapshot, then installs and activates that Route through the completed-edit operation.
- `packages/app/src/App.tsx` reserves the route-less Space's prospective Route UUID so attachment handles are declared before the first Edge renders; `packages/app/src/components/GraphView.tsx` and the card projection use the first palette colour before and after minting.
- `packages/graph/src/new-space.ts` seeds `Card 1`.
- `packages/app/test/completed-connection.test.ts` proves the exact atomic self-edge snapshot and palette continuity; `packages/graph/test/new-space.test.ts` proves the seed title.
- `packages/app/e2e/new-space.spec.ts` proves route-less handles and preview colour, cancellation with revision 0, self-connection, runtime activation, selected `Layout 1`, unchanged placement and exactly revision 1.
- Final verification on 2026-07-31: `mise exec -- pnpm verify` passed 63 test files and 526 tests; `mise exec -- pnpm e2e` passed 47 tests, including all 8 tests in the new-space project.

# 04 — The first connection mints and activates `Route 1`

**What to build:** Let the one Card in a new route-less Space begin Route authoring immediately. Its first successful connection creates a valid first Route, makes it active, converts the Algorithmic View and persists the complete result atomically.

**Blocked by:** 03 — Connecting from an Algorithmic View converts atomically.

**Status:** ready-for-agent

- [ ] A new Space's initial Card is titled `Card 1` rather than `Start here`.
- [ ] A route-less Space shows the four authoring handles on its hovered or selected Card even though no active Route exists yet.
- [ ] Those handles and the connection preview use the first palette colour that the minted Route will receive.
- [ ] A successful first connection creates `Route 1` with no authored colour override and adds the completed Edge as its first Edge.
- [ ] The new Route becomes the runtime active Route and is written as the new Layout's `activeRoute` in the same completed Edit.
- [ ] A self-edge is a valid first connection.
- [ ] The new Layout copies the resolved position on screen, is selected and becomes the Space's `defaultView` without visual movement.
- [ ] Route creation, activation, Layout conversion and Edge creation submit exactly one complete snapshot.
- [ ] Cancelling the first connection leaves the Space route-less, keeps the Algorithmic View selected and submits nothing.
- [ ] Pure tests cover neutral Route naming, palette continuity, route activation and atomic route-less snapshot composition.
- [ ] The new-space Playwright project proves the `Card 1` seed, first connection, `Route 1` activation, Layout conversion and automatic persistence.
- [ ] Resolving this ticket also resolves `.scratch/active-route/issues/06-a-minted-route-is-set-active.md` with a pointer to the implementation and verification evidence.
- [ ] `pnpm verify` and `pnpm e2e` pass.

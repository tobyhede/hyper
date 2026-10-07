# 01: Withdraw authoring while presenting

**What to build:** While presenting, nothing on the canvas is authorable. The presented Resource and its neighbours offer no connection handles, so an Edge can no longer be drawn mid-presentation. This lands while presenting is still drawn on the canvas, and the Stage in ticket 02 inherits it.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Authoring availability withdraws canvas connection while presenting, like every other canvas authoring capability; the presenting exception and the comments that justify it are removed.
- [ ] The unit test asserting the exception is replaced by one asserting connection is withdrawn while presenting.
- [ ] The e2e test that draws an Edge while presenting is replaced by one asserting no connection handle is visible or reachable on the presented Resource or a neighbour.
- [ ] Every other presenting behaviour and its tests are unchanged.
- [ ] `pnpm typecheck`, `pnpm typecheck:packages`, targeted lint and the affected unit and e2e specs pass locally; the draft PR's `CI passed` gate is observed green before resolution.

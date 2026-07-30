# 05 — Option/Alt empty-drop creates and connects `Card N`

**What to build:** Add the explicit create-and-connect gesture. A normal connection released on empty canvas cancels; holding Option on macOS or Alt elsewhere previews and atomically creates the next neutral Card at the chosen position with an Edge from the source Card.

**Blocked by:** 04 — The first connection mints and activates `Route 1`.

**Status:** ready-for-agent

- [ ] Releasing an ordinary connection drag on empty canvas creates nothing, advances no completed-Edit revision and submits no persistence.
- [ ] Pressing Option/Alt while a connection is over empty canvas shows a translucent preview of the Card that would be created.
- [ ] Releasing Option/Alt during the drag removes the preview and restores cancellation behavior; pressing it again restores the preview.
- [ ] The preview is centered at the eventual persisted position and carries the exact next neutral `Card N` title.
- [ ] Releasing with Option/Alt creates a blank Markdown Card, its active-Layout position and the directed Edge from the source Card atomically.
- [ ] The created Card becomes selected without opening its content, leaving its source handles visible for continued authoring.
- [ ] Neutral Card naming scans exact surviving `Card N` titles, uses the greatest number plus one, ignores custom titles and adds no persisted sequence counter.
- [ ] Creating in an existing Layout updates that Layout only; other Layout position maps remain sparse and are not backfilled.
- [ ] Creating from an Algorithmic View copies existing resolved positions, adds the previewed Card position and selects the next `Layout N` without moving existing Cards.
- [ ] Creating in a route-less Space additionally mints and activates `Route 1` in the same complete snapshot.
- [ ] Transient preview measurement changes cannot enter the authoritative node list or cause a controlled React Flow render loop.
- [ ] Pure tests cover Card naming, blank Markdown content, exact placement, existing-Layout update, Algorithmic View conversion and route-less atomic creation.
- [ ] Playwright proves ordinary cancellation, live modifier preview, centered `Card N` creation, target selection, resulting Edge and automatic persistence.
- [ ] Imported fixture source bytes remain unchanged after Card creation.
- [ ] `pnpm verify` and `pnpm e2e` pass.

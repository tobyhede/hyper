# 06 — Any open Space's replacement holds navigation

**What to build:** Hold Back, Forward and Open Spaces navigation while any open Space is replacing an image, not only the followed or active one.

**Blocked by:** 03.

**Status:** ready-for-agent

**Spec:** `.scratch/a-map-is-a-map/spec.md` (decision 7). **Decision:** ADR 0112.

## Acceptance criteria

- [ ] Open Spaces answers one question — is any open Space replacing — over its whole set, observable as one busy state.
- [ ] `browser-location`'s `deliberateMove` and `navigationHeld`, and `assertNavigationAvailable`, read that answer instead of the followed or active entry's replacement.
- [ ] A replacement started inside an embedded Map holds Back and Forward, proved in a unit test and in a real browser.

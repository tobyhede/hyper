# 06 — Any composed Space's replacement holds navigation

**What to build:** Hold Back, Forward and Open Spaces navigation while any composed Space — listed or only drawn — is replacing an image, not only the followed or active one.

**Blocked by:** 03.

**Status:** ready-for-agent

**Spec:** `.scratch/a-map-is-a-map/spec.md` (decision 7). **Decision:** ADR 0112.

## Acceptance criteria

- [ ] One question — is any composed Space replacing — is answered over every composed Space, listed or held only by a drawing, as one observable busy state.
- [ ] `browser-location`'s `deliberateMove` and `navigationHeld`, and `assertNavigationAvailable`, read that answer instead of the followed or active entry's replacement.
- [ ] A replacement started inside an embedded Map holds Back and Forward, proved in a unit test and in a real browser.

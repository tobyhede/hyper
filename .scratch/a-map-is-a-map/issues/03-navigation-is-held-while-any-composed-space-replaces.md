# 03: Navigation is held while any composed Space replaces an image

**What to build:** Back, Forward and Open Spaces navigation are held while any composed Space — listed or only drawn — is replacing an image, not only the followed or active one.

**Blocked by:** 02.

**Status:** ready-for-agent

**Spec:** `.scratch/a-map-is-a-map/spec.md`. **Decision:** ADR 0112.

- [ ] One observable answer says whether any composed Space is replacing an image.
- [ ] Every navigation hold reads that answer rather than the followed or active Space's replacement.
- [ ] A replacement running in an only-drawn Space holds Back and Forward, proved in a unit test and in a real browser.

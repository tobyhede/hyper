# 03: Navigation is held while any composed Space replaces an image

**What to build:** Back, Forward and Open Spaces navigation are held while any composed Space — listed or only drawn — is replacing an image, not only the followed or active one.

**Blocked by:** 02.

**Status:** implementation under verification

**Spec:** `.scratch/a-map-is-a-map/spec.md`. **Decision:** ADR 0112.

- [ ] One observable answer says whether any composed Space is replacing an image.
- [ ] Every navigation hold reads that answer rather than the followed or active Space's replacement.
- [ ] A replacement running in an only-drawn Space holds Back and Forward, proved in a unit test and in a real browser.

## Answer

Browser-location navigation reads the replacement state of every composed Space, including only-drawn targets. The application browser proof holds Back and Forward during embedded replacement and verifies the target owns the completed Edit. The browser-exit guard also observes unsaved work in every composed Space.

Targeted verification is recorded on draft PR #332; the full CI gate must pass before this work is complete.

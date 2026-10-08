# 03: Navigation is held while any composed Space replaces an image

**What to build:** Back, Forward and Open Spaces navigation are held while any composed Space — listed or only drawn — is replacing an image, not only the followed or active one.

**Blocked by:** 02.

**Status:** resolved

**Spec:** `.scratch/a-map-is-a-map/spec.md`. **Decision:** ADR 0112.

- [x] One observable answer says whether any composed Space is replacing an image.
- [x] Every navigation hold reads that answer rather than the followed or active Space's replacement.
- [x] A replacement running in an only-drawn Space holds Back and Forward, proved in a unit test and in a real browser.

## Answer

Browser-location navigation reads the replacement state of every composed Space, including only-drawn targets. The application browser proof holds Back and Forward during embedded replacement and verifies the target owns the completed Edit. The browser-exit guard also observes unsaved work in every composed Space. The Command Dock's navigation availability reads the same answer, so its Open Spaces and Map and Graph controls are drawn unavailable while an only-drawn Space replaces an image (`dock-navigation-hold.test.tsx`).

Delivered by PR #332, merged 2026-10-04 with its CI gate green. A verification pass on 2026-10-08 checked every criterion against `main` and added the tests it found missing in the closeout PR.

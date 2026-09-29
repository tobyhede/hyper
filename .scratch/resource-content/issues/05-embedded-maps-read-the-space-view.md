# 05: Embedded Maps read the Space view

**What to build:** Discovering the Maps an Open Space Resource embeds, and the canvas code that frames them, read the Space view from the display rather than a separate node field, and take read-only-ness from `via`. The body-height report that clips an embedded Map attaches by the Resource's kind (a Space Resource or a Reference Resource), as it attaches today even while Closed, so an embedded Map is clipped correctly on the first frame after it Opens.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] An Open Space Resource, and an Open Reference Resource to one (read-only), embed their Map exactly as before.
- [ ] A discovery test: a Space Resource that goes from Closed to Open has its body height on the first request.
- [ ] The existing embedded-map application proofs, including their clipping assertions, pass.
- [ ] `pnpm verify` and `pnpm e2e` pass.

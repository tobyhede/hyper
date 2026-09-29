# 03: Open and presented Resources draw from the resolved content

**What to build:** Every canvas node carries what it shows now — Closed (no content), Open or presented, each with the resolved content — and the Resource front and presenting draw from that through one exhaustive switch over the content kind, instead of inferring content from which node fields are present. Presenting-over-Open is decided once, in the projection. Read-only is decided once, at the top of the Resource front. A dangling Target draws a notice built from `Empty`, not an empty document. Presenting a Space Resource draws its Title only (07 asks what it should really draw). The presenting component is renamed `PresentedResource`, freeing `ResourceContent` for the content type. The old node fields stay populated until 06. Starts with `$shadcn-first-ui`.

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] A Closed node carries no content; an Open node and a presented node carry the resolved content; a Resource both Open and presented is presented.
- [ ] Authored Open state and the display cannot disagree unnoticed: the front's rule for which one it reads is stated once and tested for a Resource that is both presented and Open.
- [ ] A Resource's own kind and its resolved content kind agree whenever `via` is `'self'` (property test over the projection).
- [ ] Markdown, image and Space content and Reference Resources to each draw exactly as before, proved by the existing unit, application and Ladle proofs.
- [ ] An unresolved Target draws the notice in the Open front and when presented (unit tests; no stable story, since intake makes it unreachable — recorded in the design-system inventory if the catalogue check asks).
- [ ] Presenting a Space Resource draws its Title and no empty document.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass.

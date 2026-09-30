# 08 — An image shows a skeleton while it loads

**What to build:** Between an Open Image Resource's content mounting and its picture loading, the content area shows a skeleton in the picture's place instead of an empty box, replaced by the picture on load or by the failed-image state on error. The same applies to a Reference Resource drawing an Image Resource Target and to presenting. `Skeleton` is not in `@project/ui` (it was removed with the registry `Sidebar`), so it is regenerated from shadcn. Starts with `$shadcn-first-ui`.

**Blocked by:** None (can start immediately)

**Status:** needs-triage

- [ ] A picture that has not loaded yet draws the skeleton; loading replaces it with the picture; an error replaces it with the failed-image state.
- [ ] A picture already in the browser's cache draws no skeleton flash.
- [ ] Ladle story and application proof (ADR 0052).

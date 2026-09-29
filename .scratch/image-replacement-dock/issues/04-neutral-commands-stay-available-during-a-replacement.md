# 04: Copy link, Open in New Tab and moving the Dock stay available during a replacement

**What to build:** Commands that neither navigate nor author stay usable while a replacement is in flight: Copy link and Open in New Tab in the Space, Map and Graph menus and on a Resource, and moving the Command Dock by its grip or its slot menu. The menus open, their navigation rows are drawn unavailable, and their neutral rows work. Offering an unavailable row inside a choice menu likely needs `ChoiceMenu` in `@project/ui` to draw a row unavailable on its own (`$shadcn-first-ui`).

**Blocked by:** 02

**Status:** wontfix

**Decision (product owner):** Copy link and Open in New Tab are disabled during a replacement, as they are while presenting. That is what the tree already does: the Space, Map and Graph menu buttons are drawn unavailable and do not open (ticket 02), and a Resource's actions menu is disabled while authoring is withdrawn. Nothing here is built. Moving the Dock during a replacement is not covered by this decision.

- [ ] During a held replacement, the Map and Graph menus open, their choice rows are unavailable, and Copy link copies.
- [ ] During a held replacement, a Resource's Copy link is available.
- [ ] During a held replacement, the Dock can be moved.
- [ ] Any `@project/ui` change carries a Ladle story proof and passes `pnpm e2e:ladle` (ADR 0052), with a matching application proof.

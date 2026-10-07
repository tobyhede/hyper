# 01: A Resource has a size, and Open changes none

**What to build:** a Map entry is `{ x, y, open?, size?, shape? }`. `size` defaults to the Closed Size and is the one floor for every kind; `open` defaults to Closed and is refused on an Ur Resource. Open and Close change only `open`; Resize changes only `size` (and displaces as today), Open or Closed. Fixtures and seeds roll forward preserving what is drawn. Open Size, the magnetic Close, displacement on Open/Close, first-Open sizes and kind-specific Open minimums retire. An Ur Resource offers no Open. The new ADR and the contract §6/§7 and CONTEXT.md are written.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Schema, intake (named refusal for `open: true` on Ur), and the entry's default resolvers.
- [x] Space Authoring: Open/Close change nothing but `open`; Resize changes `size` in either state; refusals worded.
- [x] Projection and front draw every Resource at its `size`; content adapts.
- [x] Fixtures/seeds rolled forward with nothing changing on screen; round trip holds.
- [x] ADR, contract and CONTEXT.md.

**Resolution:** ADR 0122 (supersedes 0066; refines 0064, 0084, 0093, 0106, 0113, 0114, 0121). The entry is strict `{ x, y, open?, size?, shape? }`, resolved by `resourceSize` and `resourceOpen` in `@project/core`; intake and the Open Edit refuse an Ur Resource Open as `open-requires-content`, and `resource-not-open` is gone. `Placement.displace(placement, subject, before, after)` measures from the size before the Resize; `growth` and `reclaim` are gone, so Open, Close, Remove and Delete move nobody. Retired from core: `DEFAULT_OPEN_SIZE`, `DEFAULT_SPACE_RESOURCE_OPEN_SIZE`, `SPACE_RESOURCE_MIN_OPEN_SIZE`, `IMAGE_FIRST_OPEN_BOUND`, `OPEN_RESOURCE_CHROME`, `firstOpenSize`, `openSizeFloor`, and `naturalSize` on `ResourceContent`; from app, `snapResourceSizeToClose`. The tracked fixture's one Open entry renamed `openSize` to `size`; no Closed entry carried one. The resize control is still offered only on an Open Resource (ticket 02), so an Ur Resource cannot be resized in the app until 02 lands. An Image Resource's stored `naturalSize` is still measured and written, but no rule reads it any more.

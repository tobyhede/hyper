# 01: A Resource has a size, and Open changes none

**What to build:** a Map entry is `{ x, y, open?, size?, shape? }`. `size` defaults to the Closed Size and is the one floor for every kind; `open` defaults to Closed and is refused on an Ur Resource. Open and Close change only `open`; Resize changes only `size` (and displaces as today), Open or Closed. Fixtures and seeds roll forward preserving what is drawn. Open Size, the magnetic Close, displacement on Open/Close, first-Open sizes and kind-specific Open minimums retire. An Ur Resource offers no Open. The new ADR and the contract §6/§7 and CONTEXT.md are written.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Schema, intake (named refusal for `open: true` on Ur), and the entry's default resolvers.
- [ ] Space Authoring: Open/Close change nothing but `open`; Resize changes `size` in either state; refusals worded.
- [ ] Projection and front draw every Resource at its `size`; content adapts.
- [ ] Fixtures/seeds rolled forward with nothing changing on screen; round trip holds.
- [ ] ADR, contract and CONTEXT.md.

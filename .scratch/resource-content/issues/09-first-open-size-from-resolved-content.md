# 09: First Open Size is answered from resolved content

**What to build:** The image arm of `ResourceContent` carries the Image Resource's recorded `naturalSize`, and `resource-content.ts` gains `firstOpenSize(content): Extent` from the same table. `SnapshotEdit.open` resolves the opening Resource's content and asks it; `openSizeDocument` and `firstOpenSize`'s own kind cascade in `graph/src/snapshot-edits.ts:386-419` are deleted. Resolution in `snapshot-edits` uses the same single-hop rule as `resolveResourceContent` rather than a second hand-written one.

**Behaviour change (ADR 0114):** a Reference Resource to a Space Resource first Opens at `DEFAULT_SPACE_RESOURCE_OPEN_SIZE`, not `DEFAULT_OPEN_SIZE`. A Reference Resource to an Ur Resource or a Markdown Resource is unchanged, and a Reference Resource to an Image Resource still reads its Target's natural size synchronously (ADR 0106).

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] A `snapshot-edits` property test proves a Reference Resource first Opens at exactly the size its Target would, for every Target kind. Its Space case fails before this change.
- [ ] `openSizeDocument` is gone, and nothing in `graph` decides Open Size from a stored `kind`.
- [ ] Any existing test that asserted the default size for a Reference to a Space is flipped, and the flip is named in this ticket's Comments.
- [ ] CI passed on the draft PR.

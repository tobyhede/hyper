# 10: Resize floor and Map embedding reach the node as answers

**What to build:** `resource-content.ts` gains `openSizeFloor(content): Extent` and `embedsMap(content): boolean`. The projection, which already resolves each Resource's content, publishes both on `ResourceNodeData` for every Resource, Closed included, because a Closed display carries no content (ADR 0070). `canvas-resource-decoration.ts:184` takes the resize floor from the node, and `reportsBodyHeight` (`embedded-open-space-resource.ts:171`) reads `embedsMap` from the node. After this, the node's `kind` is read only for the glyph.

**Behaviour change (ADR 0114):** a Reference Resource to a Space Resource has `SPACE_RESOURCE_MIN_OPEN_SIZE` as its resize floor. Only a Reference Resource whose Target embeds a Map reports its body height; a Reference to Markdown, Image or Ur no longer does.

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] `core` property test: `embedsMap` and `openSizeFloor` are independent of `via`.
- [ ] A projection test proves a Reference Resource to a Space Resource publishes the Space floor and `embedsMap: true`, and a Reference to Markdown publishes neither. This replaces the decoration test's hand-built `kind: 'space'` floor case.
- [ ] No source site reads `node.data.kind` for anything but the glyph.
- [ ] CI passed on the draft PR.

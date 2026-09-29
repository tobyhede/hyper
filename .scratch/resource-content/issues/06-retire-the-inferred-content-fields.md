# 06: Retire the inferred content fields (contract)

**What to build:** Nothing infers a Resource's content any more, so the fields and fallbacks that did are deleted: the node's optional body, image URL (and the image arm of the node's kind), Space content, presenting flag, body editor and image replacer; the old single-hop resolution and its result type; the presenting component's own content union; and every empty-string fallback. The docs that name them are brought into line. After this, "no content where content is owed" cannot be written.

**Blocked by:** 04, 05

**Status:** ready-for-agent

- [ ] None of the retired fields, types or functions remains in source, tests or stories.
- [ ] `graph`'s package surface no longer lists the old resolution.
- [ ] `AGENTS.md` (the ADR 0070 entry's resolution sentence) and `docs/agents/rendering.md` describe the content value and display.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass.

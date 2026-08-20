# 01 — Purge "arrangement" from the render layer

**What to build:** Stop using "arrangement" — a word `CONTEXT.md` explicitly
avoids for Placement, Layout strategy and Algorithmic View — across
`packages/app` and the two stray `packages/graph` sites. See `spec.md` for the
full reasoning, including why this is not a blind rename to "placement."

**Status:** ready-for-agent

- [ ] Reword every prose/comment site listed in `spec.md`'s Scope section away
  from "arrangement," choosing the accurate word per sentence (usually
  "placement," sometimes "the Cards on the canvas").
- [ ] Pick one replacement name for `canvas-content.ts`'s `'arrangement'` kind
  and `hasArrangement` parameter — the thing being named is "Cards currently
  mounted on the canvas, independent of whether a new placement is being
  computed" — and apply it consistently across `canvas-content.ts`,
  `App.tsx`'s call site, and `canvas-content.test.ts`.
- [ ] Reword `packages/graph/src/grid.ts:15` and
  `packages/graph/src/space.property.test.ts:55`.
- [ ] Run this as its own commit, separate from any structural change, per
  `docs/agents/workflow.md`'s Renames rule.
- [ ] `pnpm verify` and `pnpm e2e` pass; `pnpm e2e:ladle` if a touched file
  backs a story.

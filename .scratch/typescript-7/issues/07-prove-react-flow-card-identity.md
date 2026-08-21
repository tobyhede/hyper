# 07 — Prove Card identity across the React Flow boundary

**What to build:** Possibly nothing. This is a design improvement to consider on its merits, not an obligation created by a lint rule.

**Status:** needs-triage

**Why the framing changed:** this ticket was written when issue 06 meant clearing 79 findings, making these 13 sites a blocker. Under ADR 0062 they are recorded in the suppressions baseline and stand on their reviewed `SAFETY:` comments. Nothing forces this work.

What remains genuinely open is narrower and worth stating precisely, because the earlier effort already answered part of it.

React Flow widens a Card id to `string` in its `Node` and `Edge` types, so 13 production sites re-narrow it: `render-adapter.ts` (8), `placement.ts` (2), `AuthorableEdge.tsx` (2), and one more. Ids are branded — `z.string().uuid().brand<'UUID'>()` in `packages/core/src/schema.ts`.

The anti-slop sweep considered parsing at these sites and rejected it, in a comment still in the code:

```
// SAFETY: the same `Node.id` erasure as `placementFromNodes` above.
// Parsing here instead would put a throw on the per-pointer-frame
// path for a failure the other readings agree cannot happen.
```

That reasoning holds and this ticket does not reopen it.

**What it did not consider** is containing the erasure once rather than at each site. The projection already knows every node's `CardId` when it mints the node; carrying that identity so the reverse direction is a typed lookup would remove all 13 assertions with no runtime cost. Whether that is an improvement or just displacement depends on what it does to `canvasProjection`, which is a pure module and deliberately not a hook.

- [ ] Judge it as a design question: does containing the erasure once make the render adapter clearer, or does it add a structure whose only purpose is to satisfy a rule?
- [ ] Read `docs/agents/rendering.md` and ADR 0055 first.
- [ ] If it changes what the render adapter publishes, it earns its own ADR.
- [ ] If the answer is no, say so here and close it. "The library erases the brand and we re-narrow at the edge, documented" is a legitimate resting place.

**Do not** pursue this to drain the suppressions baseline. ADR 0062 explicitly rejects treating that file as scheduled debt.

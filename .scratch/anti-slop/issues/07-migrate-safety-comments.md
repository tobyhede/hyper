# Migrate `require-safety-comment-for-type-assertion`

Status: ready-for-agent

## Context

38 prod / 76 test across 53 files — the largest rule overall by a wide margin,
with a long tail (top 4 files carry 26 of 114 hits, ~45 files carry 1-3 each).
Deliberately last: every earlier phase either deletes an assertion outright
(fixing the type flow so no cast is needed) or already has the file open for
another rule, so this phase should only need to comment what survives, not the
full 114.

Representative production example, `packages/app/src/render-adapter.ts` (8
hits, the single largest prod file for this rule):

```ts
if (left.kind === 'card') return left.cardId === (right as { cardId: CardId }).cardId;
edge: { from: edge.source as CardId, to: edge.target as CardId },
return Placement.fromEntries(nodes.map((node) => [node.id as CardId, node.position]));
```

These are narrow casts on already-known-shape values — likely fast
comment-adds stating the invariant (e.g. "narrowed from the discriminated
union checked above"), not redesigns.

## Direction

Re-run the full scan first — earlier phases will have removed an unknown
number of these 114 sites as a side effect. Then split what's left:

1. Production first (38 sites across ~18 files before other phases land,
   fewer after). `render-adapter.ts` alone is 8 of the original 38.
2. Test/story/E2E after (76 sites across ~35 files) — lower stakes, but still
   worth a real invariant per `research.md`: "The 114 uncommented assertions
   show that the repository has no recorded invariant at many places where
   TypeScript is being overruled." A comment that just restates the cast
   ("cast to CardId") doesn't satisfy that — state why the cast is safe at
   that call site.

Enable `require-safety-comment-for-type-assertion` in `oxlint.config.ts` once
both halves are clean.

## Caution

Don't add comments to assertions that should have been deleted by an earlier
phase — if a site here turns out to have a real missing type boundary rather
than a truly safe narrowing, route it back to whichever phase (04/05/06) it
belongs to instead of commenting over it.

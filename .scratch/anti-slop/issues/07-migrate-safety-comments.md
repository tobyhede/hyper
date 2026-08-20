# Migrate `require-safety-comment-for-type-assertion`

Status: resolved

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

## Resolution

A re-scan on the clean stack found 90 sites across 42 files (down from 114 —
the earlier phases' side effects the ticket anticipated), split 30 prod / 60
test-e2e as the Direction asked, landed as two commits.

**Production half (30 sites, 14 files) — all fixed directly, no site
flagged as a missing boundary.** Investigated and delegated by package
cluster: `render-adapter.ts` alone (8 sites, the ticket's own example) got
its own agent; `graph/space.ts`+`placement.ts`+`card-file.ts` (7); UI
components — `sidebar.tsx`, `AuthorableEdge.tsx`, `SpaceCanvas.tsx` (6); and
the remaining app/core/http/persistence files (9). Every comment states the
actual checked invariant — a discriminated union already narrowed on one
side of an equality check, a value this module is the sole producer of, an
erasure a library's own type imposes (`CardId` widened to `string` by React
Flow's `Edge`, `React.CSSProperties` having no index signature for CSS
custom properties), or a real external contract (React's
`getDerivedStateFromError`, `CardCombobox`'s reported id type). Two sites in
`render-adapter.ts` and one in `placement.ts` needed a single-line `if` or
implicit-return arrow converted to a block body first — the rule's walker
only recognizes a `SAFETY:` comment immediately before one of
`ExpressionStatement`/`PropertyDefinition`/`ReturnStatement`/
`ThrowStatement`/`VariableDeclaration`, so a comment "before" an inline
single-line `if` (which precedes the `IfStatement`, not the `ReturnStatement`
nested inside it) doesn't count. No behavior changed in either restructure.

**Test/E2E half (60 sites, 28 files) — all fixed directly, no site flagged.**
Split into six file clusters and delegated in parallel: vite/http-server
tests (13), import/export tests (11), misc root `test/unit`+`vitest.setup.ts`
(11), http/persistence/ui tests (6), the app package's own test suite (9),
and a graph-test+E2E cluster (10). Patterns repeat heavily here: `expect(x)
.toBeInstanceOf(Y)` followed by `(x as Y).field` (`toBeInstanceOf` doesn't
narrow TypeScript's static type, so the cast recovers what the runtime check
just proved — by far the most common site in this half); a deliberately
malformed fixture cast straight into a real parser to exercise its refusal
path (the same `spaceWith`/`documentFailingIn` shape as issues 04/05); and a
handful of genuine external contracts (`PromiseLike.then`'s `onRejected`,
jsdom shim objects in `vitest.setup.ts`).

### Delegation

Ten parallel background agents in total (four production, six test/E2E),
following the same fork-based pattern as issues 04–06. Three agents this
time reported "completed" while having made **zero** actual file changes on
their first attempt — confirmed each time by checking `git status` and a
fresh `oxlint` scan directly rather than trusting the agent's own summary,
per the lesson issue 05 already recorded. Two of the three succeeded on a
straight retry (the UI/component cluster, and the vite/http-server tests
cluster, T1). The third (T5, the app package tests cluster) failed silently
**twice** — after the second failure I did its remaining 9 sites directly
instead of retrying a third time. One agent (the graph package cluster) hit
the platform's one-level nesting limit when it tried to delegate further
work of its own ("Fork is not available inside a forked worker") and
correctly stopped rather than attempting something invalid — noted here as
a real platform constraint, not a bug in the approach.

A stray instance of the vite/http-server fork was still marked "running"
well after its assigned files were already fully fixed (via a separate path
during an earlier autonomous continuation) — stopped it directly with
`TaskStop` once confirmed redundant, to avoid a late conflicting write.
Two separate `/code-review` invocations on the test/E2E diff also returned
confused, self-referential non-answers when resumed or re-queried instead
of restating their findings; a **fresh** invocation (not a resume) produced
a normal, useful zero-finding report. Lesson for future large-fan-out
phases: verify background-agent artifacts directly rather than trust a
resumed or re-queried agent's text, and prefer a fresh agent over resuming
one that's producing confused output.

### Code review response

Both halves reviewed separately (matching the two-commit split). Production
half: zero findings — spot-checked two comments' externally-verifiable
claims (`SpaceCanvas.tsx`'s "one caller" claim, `AuthorableEdge.tsx`'s
`CardCombobox` return-type claim) against the actual source and confirmed
both hold. Test/E2E half: zero findings — confirmed the diff is comment-only
plus two purely cosmetic reformats (semantically identical to what they
replaced), `pnpm lint:anti-slop` clean.

### Verification

`pnpm verify` (typecheck, typecheck:packages, ui:catalog:check, lint,
lint:anti-slop, format:check, test:coverage) run after each half and again
after the full diff landed — green throughout: 129 test files, 1296 tests
passed, 8 skipped, all 15 enabled anti-slop rules report 0 findings
repo-wide. This closes out every rule `spec.md` scoped except issue 08
(a human policy decision on Oxlint's own built-in categories, not phased
migration work).

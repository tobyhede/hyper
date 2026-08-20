# Migrate the remaining scattered rules: unsafe dictionary type, unknown returns, known-value widening, runtime typeof

Status: ready-for-agent

## Context

**Added after issue 02 landed**: `no-runtime-typeof` had no assigned phase in
the original plan. Issue 02 excepted its 13 hits in the two boundary-decoder
files (via a scoped `.oxlintrc.json` override, since those are genuine
boundary/closed-union `typeof` checks), but that left ~30 diagnostics
(~20 prod / ~10 test, ~14 files) with nowhere to land. Folded in here rather
than given its own ticket — the remaining spread has moderate concentration
(top 4 files carry roughly half), closer to this ticket's grouping than to a
single-boundary design exercise like issue 02's.

Four rules with low-to-moderate totals spread across many independent files,
no file carrying more than a handful of hits after issue 02 removes the
boundary-decoder share. Mostly there is no shared root cause to design
around here — this is a queue of independent per-site decisions, not a design
exercise, unlike issue 02 — except `no-runtime-typeof`'s heavier files, which
may warrant the same "read the whole file, fix the boundary shape once"
treatment issue 02 used.

- `no-unsafe-dictionary-type` — 4 prod remaining (`packages/app/src/space-authoring.ts`
  x2, plus whatever issue 02 didn't cover), 6 test, 9 files total.
- `no-unknown-returns` — 5 prod, 9 test, 10 files, max 2/file:
  `packages/core/src/schema.ts` (2), `packages/app/vite-space-http-plugin.ts` (2),
  `packages/persistence/src/observable-state.ts` (1), rest 1-2 each in test files.
- `no-known-value-widening` — 7 prod (6 after issue 02's `http-protocol.ts` hit),
  12 test, 18 files, every file 1-2 hits: `packages/persistence/src/http-protocol.ts`,
  `packages/react-flow-adapter/src/projection.ts`, `packages/app/src/renderer.ts`,
  `packages/app/src/edge-authoring-react.tsx`, `packages/app/workspace-aliases.ts`,
  `packages/app/src/colors.ts` in production; the rest test/story.
- `no-runtime-typeof` — remaining ~20 prod / ~10 test across ~14 files after
  issue 02: heaviest are `packages/graph/src/space.ts` (4),
  `test/unit/vite-space-http-plugin.test.ts` (4),
  `packages/persistence/src/observable-state.ts` (3),
  `packages/ui/src/components/sidebar.tsx` (3), `packages/core/src/schema.ts` (2),
  `packages/app/vite-space-http-plugin.ts` (2),
  `packages/app/src/space-authoring.ts` (2), rest 1-2 each. Re-scan before
  starting — issue 02's excepted 13 hits shift this count and issue 02 itself
  established the "boundary parser vs. closed-union discrimination vs. missing
  parse" triage this rule needs; reuse that judgment rather than re-deriving
  it. A closed-union `typeof` check (like `toRevision`'s in the boundary
  files) is a legitimate exception; a `typeof` on genuinely external/`unknown`
  data is a real fix (parse it).

## Direction

Work file by file, not rule by rule — several of these files also appear in
issues 03/05/06, so touching a file once for all its remaining anti-slop
findings is more efficient than separate passes. Each site needs the same
judgment call `research.md` describes: try a named contract or move
validation to the I/O edge first; only fall back to a narrowly-scoped
exception where the value genuinely crosses an external boundary the generic
rule can't model, or narrows an already-closed union rather than unparsed
external data (as issue 02 found for `no-runtime-typeof` specifically).

Enable each rule in `oxlint.config.ts` as its own count reaches zero — they
don't have to land together since they don't share files systematically.

## Caution

Don't batch-fix these with a single mechanical transform (e.g. blanket
`Record<string, unknown>` -> a shared dictionary type) just because the rule
name suggests one fix shape. The files are unrelated; each needs its own look.

**Two latent bugs in the vendored plugin itself, found by code review during
issue 02, affect the rules this ticket enables — read before trusting a clean
result:**

- `no-known-value-widening`'s `hasParentAssertion`
  (`tools/oxlint/anti-slop/rules/no-known-value-widening.ts`) checks
  `node.parent.type` directly without unwrapping a `ParenthesizedExpression`
  first, unlike the sibling `no-chained-type-assertions` rule's
  `isOutermostAssertionInChain`, which does. For a parenthesized chain like
  `(x as A) as B`, this can report the inner assertion as if it were
  outermost — a spurious/duplicate finding, not a real widening.
- `no-unsafe-dictionary-type`'s intersection-type handling
  (`tools/oxlint/anti-slop/shared/dictionary-types.ts` around line 209)
  requires *every* member of an intersection to be independently unsafe
  before flagging it. A type like `SomeNarrowShape & { [k: string]: unknown
  }` has one safe member and one open-dictionary member, so it's a real
  unsafe dictionary — but the current logic returns "not flagged," a false
  negative.

Do not patch these in the vendored plugin — it's pinned to an upstream commit
(`tools/oxlint/anti-slop/PROVENANCE.md`) and silently diverging from that
commit defeats the point of pinning it. If either bug actually produces a
wrong result while migrating this ticket's rules (a spurious widening report,
or a dictionary that should have been caught but wasn't), note it in this
ticket's resolution and handle the affected site by hand; consider reporting
upstream separately if it recurs.

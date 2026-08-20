# Migrate `no-conditional-empty-object-spread`

Status: resolved

## Context

28 prod / 17 test across 22 files, moderate concentration — the top 3 files
carry 13 of 45 hits (29%), the remaining 19 files carry 1-2 each:

| File | Hits | Kind |
| --- | ---: | --- |
| `packages/react-flow-adapter/src/projection.ts` | 5 | prod |
| `src/export/export-space.ts` | 4 | prod |
| `packages/react-flow-adapter/test/CardNode.test.tsx` | 4 | test |
| `packages/app/test/space-authoring.test.ts` | 4 | test |
| `packages/app/src/space-authoring.ts` | 4 | prod |
| `packages/app/src/edge-authoring-react.tsx` | 2 | prod |
| `packages/app/src/render-adapter.ts` | 2 | prod |
| `packages/app/src/snapshot.ts` | 2 | prod |
| remaining 19 files | 1-2 each | mixed |

`research.md`: "Rewriting them into explicit object construction may improve
the boundary semantics, even where the existing expression is type-safe" —
i.e. this rule isn't only catching bugs, some findings are legitimate style
even when the current code is correct.

## Direction

Migrate by package, in this order: `react-flow-adapter` (1 file, 5 hits) and
`export-space.ts` (1 file, 4 hits) first since they're single-file and
self-contained; then `app`'s `space-authoring.ts` / `edge-authoring-react.tsx`
/ `render-adapter.ts` / `snapshot.ts` together since they share the Space
Authoring module; then the remaining 1-2-hit files as a final sweep.

For each site, replace the conditional spread with explicit object
construction that states whether the property exists, rather than leaving it
implicit in a `...(cond ? { key } : {})` pattern.

Enable `no-conditional-empty-object-spread` in `oxlint.config.ts` once all 45
sites are clean.

## Caution

This is the second-largest rule by hit count. Land it in the package groupings
above rather than one 45-site commit — each group is independently reviewable.

## Resolution

A re-scan on the clean stack found 44 sites across 22 files (one fewer than
the ticket's 45 — negligible drift). All fixed directly; `no-conditional-
empty-object-spread` is now `"error"` repo-wide, no overrides needed anywhere.

**Delegation**: split into four parallel background agents along the ticket's
own package groupings — react-flow-adapter (`projection.ts`, `elk-strategy.ts`,
`CardNode.test.tsx`, 10 sites), export/import/persistence
(`export-space.ts`, `read-single-space.ts`, `memory-space-repository.ts`,
`postgres-import-decoding.test.ts`, 8 sites), the app Space Authoring module
(`space-authoring.ts`, `edge-authoring-react.tsx`, `render-adapter.ts`,
`snapshot.ts` plus their test files, 16 sites), and a final sweep of the
remaining nine 1-2-hit files (10 sites). Each got the same two established
patterns from issue 02 to choose between per site: mutate a `const` after
construction (`const x = {...base}; if (cond) x.key = val;`) when the
optional key's *position* in the object doesn't matter, or two full object
literals in a ternary when it does.

One agent (the final-sweep retry) misbehaved mid-run — it self-reported
"completed" once with zero files actually touched, and on retry
self-terminated partway through with a confused status message about a
"duplicate" agent. Both times, its actual file state was verified directly
(`git status`, a fresh `oxlint` scan) rather than trusting the reported
summary — the retry's work turned out to be complete and correct despite the
odd self-report. Worth remembering for future delegation: a fork's own
narration is not proof of what it did; check the artifacts.

**The one place order was load-bearing**: `src/export/export-space.ts`
serializes to on-disk JSON where key *insertion order* is part of the
contract (re-exporting untouched content must produce an identical diff — see
the file's own docstrings, pre-existing). `canonicalGraphs`'s `color` field
sits *between* `title` and `edges` in the exported object, so mutating a
`const` after construction would have appended it last instead — that site
correctly uses the two-full-literals ternary, now with a comment explaining
why (added during code review below). The other three optional fields in
this file (`activeGraph`, `layouts`, `defaultRenderer`) were already
last-positioned before this migration, so `{...base, key}` spread-append
preserves their order exactly and needed no literal duplication. Verified
against the existing `'exports one Space identically however its stored
objects were ordered'` test, which passed unchanged.

A few sites also needed a type, not just a restructure, to keep
`exactOptionalPropertyTypes` and `no-known-value-widening` (issue 04's rule,
already enabled) both satisfied: `export-space.ts`'s `layoutBase`/`fileBase`
needed explicit `Omit`/`Pick` annotations to stop a literal type like
`version: 1` widening to `number` through the intermediate spread, and four
test files that built a mutable accumulator object (`space-authoring.test.ts`,
`render-adapter.test.ts`, `card-document-equality.test.ts`,
`postgres-import-decoding.test.ts`) needed a named local `interface` instead
of the inline anonymous type each background agent had reached for — caught
only once every issue-03/04/05 rule ran together (see Verification), since
each agent's own scoped scan config had only this one rule enabled.

### Code review response

A background `/code-review` pass found no correctness bugs (cross-file
tracing confirmed no caller-visible behavior changed anywhere) and three
cleanup findings:

- **Fixed**: `render-adapter.ts`'s comment above `reconcile`'s merge still
  said "the conditional spreads are for `exactOptionalPropertyTypes`" after
  the code beneath it was rewritten to `if`-assignment — updated to describe
  the code that's actually there.
- **Fixed (as a comment, not a behavior change)**: added the one-line
  key-order rationale to `canonicalGraphs` described above, so the "why does
  this function duplicate two full literals instead of using this diff's
  usual mutation pattern" question the review raised is answered in the code
  rather than only in this ticket.
- **Did not hold up**: a finding claimed `prisma-next.config.ts` and
  `src/prisma/db.ts` use two different patterns for the same problem in the
  same diff. Re-checked both directly — `db.ts` already uses the same
  two-full-literals ternary as `prisma-next.config.ts` (confirmed via `git
  diff`), not the mutation pattern the finding described. No change made.

### Verification

`pnpm verify` (typecheck, typecheck:packages, ui:catalog:check, lint,
lint:anti-slop, format:check, test:coverage) run three times over this
ticket — after consolidating all four agents' work (which surfaced the four
issue-04-interaction sites above, fixed directly), and again after the
code-review fixes. Green every time: 129 test files, 1296 tests passed, 8
skipped, all five enabled anti-slop rules report 0 findings repo-wide.

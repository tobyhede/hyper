# anti-slop migration

Source: `research.md` in this directory decided *whether* to adopt anti-slop (yes,
vendor + Oxlint, migrate in rule families). This file scopes *how much work that
actually is* and breaks it into bounded tickets.

A second scan reproduced the original numbers exactly (167 prod / 173 test / 340
total, unchanged despite intervening commits) and added file-level detail the
first pass didn't keep: which files each rule hits, whether violations cluster or
scatter, and representative examples. That detail is what turned the original
8-step outline into the phases below — the rule-by-rule plan undersells one thing
and oversells another.

## What the file-level data changes about the plan

**Two files carry a disproportionate share of the debt.**
`src/persistence/postgres-space-repository.ts` and
`packages/persistence/src/http-protocol.ts` are top offenders in 5 of the 10
non-clean rules and together account for **43 of the 167 production diagnostics
(26%)**, concentrated at the actual DB-revision and wire-decoding boundaries.
These are exactly the "genuine missing parse boundary" cases `research.md`
flagged as needing real design attention rather than a mechanical fix or a
rubber-stamped exception. Doing a combined multi-rule pass over these two files
first (issue 02) resolves more production debt than any other single step in
this plan, and every later rule-specific phase inherits a smaller remaining
count in these files.

**Not every rule is a "migrate the rule" unit of work.** Some rules cluster
(`no-runtime-typeof`: top 5 files = 54% of hits), and those support a designed
fix at the boundary. Others are genuinely scattered across 10-28 independent
files with 1-2 hits each (`no-known-value-widening`, `no-unknown-returns`,
`no-unsafe-dictionary-type`, `no-unknown-parameters`) — there is no shared
boundary to redesign, so those are a queue of small independent decisions, not a
design exercise. Treating a scattered rule as one ticket and a concentrated rule
as one ticket looks identical on paper but is different work; the phases below
say which is which.

**`require-safety-comment-for-type-assertion` is the largest rule (114 hits, 53
files) and should run last, not third.** Every phase before it either removes an
assertion outright (fixing the type flow so no cast is needed) or documents the
invariant behind a cast it touches anyway. Running the comment sweep after
everything else means it only has to comment what's left, not what's about to be
deleted.

## Scope summary

| Rule | Prod | Test/E2E/story | Files | Pattern |
| --- | ---: | ---: | ---: | --- |
| `no-chained-type-assertions` | 1 | 8 | 7 | bounded, 1 prod file |
| `no-shape-in-symbol-names` | 2 | 11 | 4 | bounded, 1 prod file |
| `no-module-mocking` | 0 | 6 | 6 | bounded, zero prod |
| `no-runtime-typeof` | 29 | 14 | 16 | concentrated: top 5 files = 54% |
| `no-conditional-empty-object-spread` | 28 | 17 | 22 | moderate: top 3 files = 29%, real tail |
| `no-known-value-widening` | 7 | 12 | 18 | thin/scattered |
| `no-unknown-returns` | 5 | 9 | 10 | thin/scattered |
| `no-unsafe-dictionary-type` | 6 | 6 | 9 | thin/scattered |
| `no-unknown-parameters` | 52 | 13 | 28 | widest spread, no dominant file |
| `require-safety-comment-for-type-assertion` | 38 | 76 | 53 | largest, long tail — split prod/test |
| **Total** | **167** | **173** (my count: **167 prod / 173 test**) | **91 distinct files** | |

`no-known-value-widening`'s prod/test split is 6/13 or 7/12 depending on whether
`packages/app/stories/support/WorkspaceSidebarFixture.tsx` counts as production
or test-adjacent; the rule's total (19) is exact either way and the ambiguity
doesn't change any phase below.

The five already-clean rules (`no-object-parameters`, `no-reflect-apply`,
`no-reflect-get`, `no-unknown-type-aliases`, `no-widen-then-assert`) still
produce zero findings on the current branch.

Three unrelated built-in Oxlint findings also reproduced exactly:
`unicorn/no-useless-spread` (`packages/persistence/src/observable-state.ts:54`,
`packages/graph/test/card-file.property.test.ts:54`) and `unicorn/no-thenable`
(`packages/persistence/test/observable-state.test.ts:69`). These are not
anti-slop rules; issue 08 scopes whether to keep Oxlint's default categories at
all.

## Phases

- `01` — vendor the plugin, install Oxlint, enable the 5 clean rules in `verify` (done)
- `02` — combined pass on the two boundary-decoder files (highest leverage) (done)
- `03` — remaining bounded rules: chained assertions, shape-in-symbol-names, module mocking (done)
- `04` — remaining scattered rules: unsafe dictionary type, unknown returns, known-value widening, runtime typeof (done)
- `05` — conditional empty object spread (moderate concentration, split by package) (done)
- `06` — unknown parameters (largest remaining prod rule, split by package) (done)
- `07` — safety-comment sweep (largest overall, run last, split prod then test)
- `08` — decide on the 3 unrelated built-in Oxlint findings

Each phase after `01` produces its own before/after count via `pnpm lint:anti-slop
--rules <rule>` (or the full run) so the next phase starts from a verified
baseline rather than a stale count.

**Correction after issue 02 landed**: the original phase list above never
assigned a phase to `no-runtime-typeof`'s remaining diagnostics — issue 02
only covered its 13 hits in the two boundary-decoder files (via a scoped
override, since those are genuine boundary/closed-union `typeof` checks, not
missing parsing). The ~30 remaining diagnostics across ~14 files now fold into
issue 04, which is renamed accordingly. Also: issue 02 introduced a
`.oxlintrc.json` `overrides` block (glob-scoped rule exceptions with a
rationale comment) as the mechanism for "narrowly scoped exception" —
later phases should reuse that mechanism rather than inventing a new one.

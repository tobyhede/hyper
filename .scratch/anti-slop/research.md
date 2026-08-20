# anti-slop adoption investigation

Date: 2026-08-20
Branch: `anti-slop-spike`
Upstream tested: [`6d538555cb151d4121ed51a27db81890eacf8ae9`](https://github.com/dmmulroy/anti-slop/commit/6d538555cb151d4121ed51a27db81890eacf8ae9)

## Answer

Hyper should add anti-slop, but adoption is a code-quality migration rather than a
tool-only change. The full ruleset reports 340 anti-slop errors on the clean branch
baseline. That is evidence of debt to examine, not a reason to avoid the tool.

The practical sequence is:

1. Vendor the plugin at the tested commit with its MIT license and provenance.
2. Add Oxlint beside ESLint; anti-slop is an Oxlint JavaScript plugin and cannot be
   registered in Hyper's existing ESLint flat config.
3. Immediately enable the five rules with a clean baseline.
4. Migrate and enable the remaining rules in small, reviewable rule families.
5. Put the final Oxlint command in `pnpm verify` so the policy is enforced in CI.

Do not weaken a rule merely because it finds many existing violations. During each
migration, inspect whether the rule identifies lost type evidence or whether its
generic policy cannot model an external boundary. Any exception should name that
boundary narrowly in configuration and carry a concrete rationale.

## What it is

Anti-slop provides 15 generic TypeScript/JavaScript AST rules as a local Oxlint
plugin, plus a separate opt-in Effect rule. Upstream explicitly intends the source
to be vendored, read and adapted rather than consumed as a stable npm package. Its
package is `private`, version `0.1.0`, and exports raw TypeScript.
([README](https://github.com/dmmulroy/anti-slop/blob/main/README.md),
[entry point](https://github.com/dmmulroy/anti-slop/blob/main/src/index.ts),
[package metadata](https://github.com/dmmulroy/anti-slop/blob/main/package.json))

The upstream installer copies the plugin to `tools/oxlint/anti-slop/`, installs
matching current versions of `oxlint` and `@oxlint/plugins`, configures ignores,
enables every generic rule at error severity, and validates the result.
([installer skill](https://github.com/dmmulroy/anti-slop/blob/main/skills/install-anti-slop/SKILL.md))

As tested, upstream pins Oxlint and `@oxlint/plugins` 1.78.0. Hyper currently runs
only type-aware ESLint, so adoption adds a second lint engine and an owned copy of
the plugin. Hyper's Node >=24 is compatible with upstream's ES2024 target. The
upstream pnpm 10 and TypeScript 7 versions are its development stack; consumers are
instructed to install the matching Oxlint packages, not to replace their existing
package manager or TypeScript version.
([TypeScript configuration](https://github.com/dmmulroy/anti-slop/blob/main/tsconfig.json),
[package metadata](https://github.com/dmmulroy/anti-slop/blob/main/package.json))

The source is MIT licensed. It currently has no tags or releases, so Hyper must pin
an upstream commit and own upgrade diffs rather than depending on a versioned
compatibility promise. ([license](https://github.com/dmmulroy/anti-slop/blob/main/LICENSE),
[tags](https://api.github.com/repos/dmmulroy/anti-slop/tags),
[repository metadata](https://api.github.com/repos/dmmulroy/anti-slop))

## Evidence run

The full generic ruleset was run from a disposable clone against the clean
`anti-slop-spike` worktree. The scan covered `packages`, `src`, `test`, `e2e`, and
`scripts`; Oxlint's normal ignores excluded generated and dependency directories.
No fixes or suppressions were applied.

| Rule | Production | Test/story/E2E | Total |
| --- | ---: | ---: | ---: |
| `no-chained-type-assertions` | 1 | 8 | 9 |
| `no-conditional-empty-object-spread` | 28 | 17 | 45 |
| `no-known-value-widening` | 6 | 13 | 19 |
| `no-module-mocking` | 0 | 6 | 6 |
| `no-runtime-typeof` | 29 | 14 | 43 |
| `no-shape-in-symbol-names` | 2 | 11 | 13 |
| `no-unknown-parameters` | 52 | 13 | 65 |
| `no-unknown-returns` | 5 | 9 | 14 |
| `no-unsafe-dictionary-type` | 6 | 6 | 12 |
| `require-safety-comment-for-type-assertion` | 38 | 76 | 114 |
| **Total** | **167** | **173** | **340** |

Five enabled rules had a clean baseline and can be enforced immediately:

- `no-object-parameters`
- `no-reflect-apply`
- `no-reflect-get`
- `no-unknown-type-aliases`
- `no-widen-then-assert`

The run also produced three unrelated built-in Oxlint findings. Those need separate
evaluation if the Oxlint command retains its default rule categories; they are not
anti-slop results.

## What the findings say about Hyper

The high-volume findings are not merely cosmetic churn:

- One production chained assertion converts a database revision through
  `bigint -> unknown -> number`. That is exactly the kind of erased evidence the
  rule is meant to expose.
- The 45 conditional empty spreads obscure whether properties exist. Rewriting
  them into explicit object construction may improve the boundary semantics, even
  where the existing expression is type-safe.
- The known-value-widening findings identify places where inferred keys or concrete
  return values are replaced with anonymous/open contracts.
- The six module mocks show framework coupling in tests. They should be assessed as
  design feedback, not grandfathered because the tests already exist.
- The 114 uncommented assertions show that the repository has no recorded invariant
  at many places where TypeScript is being overruled.

The `unknown` and `typeof` families require the most careful migration. Some
findings are likely genuine missing parse boundaries. Others occur inside the
boundary parser itself, in JavaScript error handling, React error boundaries, or
framework callback signatures. Calling those automatically “intentional” would be
an excuse; calling every one removable before examining the owning API would also
prejudge the evidence. The migration should first try to introduce a named parsed
contract or move validation to the actual I/O edge. Only findings that cannot do so
without lying about an external value should receive a narrowly scoped exception.

## Recommended implementation plan

1. Vendor upstream `src/` under `tools/oxlint/anti-slop/` and preserve `LICENSE` plus
   a provenance file naming commit `6d538555cb151d4121ed51a27db81890eacf8ae9`.
2. Install matching `oxlint` and `@oxlint/plugins` versions and add
   `oxlint.config.ts` with Hyper's existing generated, worktree and agent-tooling
   ignores.
3. Add `lint:anti-slop` with only the five clean rules, then include it in `verify`.
4. Migrate `no-chained-type-assertions` first; it has one production violation and
   eight test-fixture violations, so the design discussion is bounded.
5. Migrate `no-known-value-widening` and `no-conditional-empty-object-spread`.
6. Migrate assertion safety comments, separating production code from tests so
   comments state real invariants rather than repeating the syntax.
7. Review module mocks one seam at a time.
8. Finish with `unknown`, dictionary and runtime-`typeof` rules, using explicit
   file/symbol exceptions only where a named external boundary makes the generic
   rule inapplicable.

This does not need a domain ADR. If the project commits to a permanently vendored
lint plugin and a second lint engine, a tooling ADR may be justified because the
ownership and upgrade cost are durable and the ESLint-only alternative is credible.

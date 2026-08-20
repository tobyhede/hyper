# Combined multi-rule pass on the two boundary-decoder files

Status: resolved

## Context

`src/persistence/postgres-space-repository.ts` and
`packages/persistence/src/http-protocol.ts` are top offenders in 5 of the 10
non-clean rules and together carry **43 of the 167 production diagnostics
(26%)**, all at the actual DB-revision and wire-decoding boundary:

| Rule | `postgres-space-repository.ts` | `http-protocol.ts` |
| --- | ---: | ---: |
| `no-chained-type-assertions` | 1 | 0 |
| `no-runtime-typeof` | 9 | 4 |
| `no-unknown-parameters` | 6 | 9 |
| `no-shape-in-symbol-names` | 2 | 0 |
| `no-unsafe-dictionary-type` | 2 | 2 |
| `require-safety-comment-for-type-assertion` | 4 | 1 |
| `no-conditional-empty-object-spread` | 2 | 0 |
| `no-known-value-widening` | 0 | 1 |
| **Total** | **26** | **17** |

These are the "genuine missing parse boundary" cases `research.md` says need
real design attention, not a mechanical per-rule fix or a rubber-stamped
exception. One representative example, `postgres-space-repository.ts:65`:

```ts
/**
 * Prisma Next 0.16.0 emits `int8` inputs as `number`, although its codec passes
 * values through unchanged and node-postgres supports bigint parameters. Keep
 * the upstream type workaround isolated here so revisions are never narrowed.
 */
const toDatabaseRevision = (value: bigint): number => value as unknown as number;
```

The invariant is already documented in prose; this needs a `SAFETY:`-form
comment, not a design change — but it's exactly the kind of case where reading
the surrounding code before choosing "convert the comment" vs. "restructure
the boundary" matters, which is why this is one ticket instead of six.

## Direction

Read both files fully before changing anything — the same value likely
triggers more than one rule (e.g. a `typeof` check feeding an unsafe-dictionary
parameter), so fix the boundary shape once rather than rule-by-rule inside the
same file.

For each site: introduce a named parsed contract or move validation to the
actual I/O edge where possible (per `research.md`'s general instruction).
Where the value genuinely crosses an external boundary Zod/TypeScript can't
express directly (e.g. the `bigint -> number` Prisma workaround above), add the
`SAFETY:` comment stating the concrete invariant, not a restatement of the
assertion.

Enable the 5 touched rules in `oxlint.config.ts`, scoped so they only run
where each rule's migration is complete — after this ticket, that means these
two files plus whatever issue 01 already covers. (Full per-rule enablement
happens as later phases finish the rest of the ruleset.)

## Caution

Don't let "these two files are the highest-leverage target" become "fix these
two files for every rule and skip the design work everywhere else" — the
concentration here is real but partial; `no-conditional-empty-object-spread`
and `no-known-value-widening` still have real tails elsewhere (issues 04-05).

## Resolution

All 43 diagnostics resolved — 5 by fixing the code, the rest by a scoped
`.oxlintrc.json` override with a documented rationale, per-site:

**Fixed:**

- `isSpacePrimaryKeyConflict`/`isCardPrimaryKeyConflict` (postgres repo): the
  `error as Record<string, unknown>` cast became `error as
  SqlPrimaryKeyConflictFields`, a named interface listing exactly the four
  fields inspected (each still `unknown` until compared) instead of an open
  dictionary — clears `no-unsafe-dictionary-type` outright, since the rule
  only flags index-signature dictionaries, not named-property literals. Both
  functions also became real type predicates (`error is
  SqlPrimaryKeyConflictFields`), a genuine precision improvement independent
  of lint. Added a `SAFETY:` comment for the cast, justified by the `typeof
  error !== 'object'` guard immediately above it.
- `toDatabaseRevision`: augmented its existing prose comment with `SAFETY:`
  and the reasoning research.md already anticipated — `bigint`/`number` have
  no direct assertion path, and a real `Number(value)` conversion (instead of
  the type-only relabel) could lose precision above
  `Number.MAX_SAFE_INTEGER`. Resolves `require-safety-comment-for-type-assertion`;
  `no-chained-type-assertions` still needs the override below, since that
  rule has no comment carve-out at all.
- `parseSnapshotShape` → `parseSnapshotSchema`: renamed for
  `no-shape-in-symbol-names`. The name states the actual distinction from
  `parseSnapshot` (which runs the full `loadSpaceSnapshot` domain intake) —
  this one only runs the Zod schema. Historical `.scratch/*.md` references to
  the old name were left alone; they describe decisions as they were made.
- Both `no-conditional-empty-object-spread` sites (`resolveImport`'s
  `document` construction, and the `Space.create` call in `importSpaces`):
  rewritten as "build in a variable, add the property only when present" per
  the rule's own suggested fix. The `Space.create` one needed a
  `Parameters<Orm['public']['Space']['create']>[0]` type alias so the
  optional-`id` property could be assigned conditionally without a cast.
- `decodeCommitRequest`'s explicit anonymous return type: replaced with a
  named `DecodedCommitRequest` interface (paralleling the file's existing
  `CommitRequestJson`/`LoadedSpaceJson` naming), clearing
  `no-known-value-widening` — a named type reference isn't a widening target,
  only an open dictionary or anonymous object literal is.
- `exactRecord`'s `value as Record<string, unknown>` cast: added a `SAFETY:`
  comment justified by the shape check immediately above it. The dictionary
  type itself stays — see the override below, this function is genuinely
  generic (parameterized by a runtime `keys` list, so no named shape fits).

**Excepted, via `.oxlintrc.json` overrides scoped to these two files:**

`no-unknown-parameters` and `no-runtime-typeof` for both files, plus
`no-chained-type-assertions` (postgres repo only) and
`no-unsafe-dictionary-type` (http-protocol.ts only, for `exactRecord`). Traced
every remaining site before excepting it — confirmed each is the boundary
parser itself, not a caller failing to parse first:

- Every `decode*`/`exactRecord` function in `http-protocol.ts` receives
  `value: unknown` and immediately validates it (Zod `safeParse`, `typeof`,
  regex) — this file **is** the "run the schema at the I/O boundary" step the
  rule's own message asks for; there's no earlier point to push the parsing
  to.
- `isSpacePrimaryKeyConflict`/`isCardPrimaryKeyConflict`'s `error: unknown` is
  a caught exception, structurally the same case the rule already exempts
  under the name `cause` — just not renamed to that (would be semantically
  wrong here, this is the caught error itself, not a wrapped cause).
- `toRevision`'s two `typeof` checks discriminate an already-closed
  `number | string | bigint` union declared in its own signature, not
  external/`unknown` data — the rule bans the `typeof` operator syntactically
  regardless of what's being narrowed, so this is a real detection-scope gap
  in the rule, not a missing boundary.
- `toJsonValue`'s `unknown` parameter and five `typeof` checks: a genuinely
  generic value→JSON serializer, recursing into arbitrary nested
  values by design — there's no narrower honest type for "any value,
  including deeply nested ones."

Verified with a temporary all-9-rules config (base rules + the two override
blocks): both files scan to 0 findings, and a full-repo scan with the same
overrides confirms no leak — every other file's findings are unchanged
(`packages/persistence/test/http-protocol.test.ts`, a different file from the
excepted `src/http-protocol.ts`, still reports normally).

The overrides sit inert in `.oxlintrc.json` today, since none of the four
excepted rules are enabled repo-wide yet (`no-unknown-parameters` →issue 06,
`no-chained-type-assertions`/`no-shape-in-symbol-names` → issue 03,
`no-unsafe-dictionary-type` → issue 04). `no-runtime-typeof` had no assigned
phase in the original plan — fixed by folding it into issue 04, see that
ticket and the correction note in `spec.md`.

### Code review response

A code review pass on this diff (before commit) surfaced eight findings.
Fixed the real ones, left the rest as documented tradeoffs or out of scope:

- **Fixed**: `resolveImport`'s rewritten `document` construction returned
  `input.document` by reference (instead of a fresh shallow copy) when
  `layouts` was undefined — a behavior change from the original, which always
  spread into a new object. Restored the always-copy semantics.
- **Fixed**: `isSpacePrimaryKeyConflict`/`isCardPrimaryKeyConflict` stayed
  byte-identical duplicated functions after the type-guard rewrite, including
  a duplicated `SAFETY:` comment. Factored a shared `isPrimaryKeyConflict(error,
  table, constraint)` predicate; the two named functions are now one-line
  wrappers.
- **Fixed**: the new `DecodedCommitRequest` interface wasn't re-exported from
  `packages/persistence/src/index.ts`, unlike its siblings `CommitRequestJson`
  and `LoadedSpaceJson`. Added the export.
- **Documented, not fixed** (vendored third-party plugin bugs — patching them
  would silently diverge from the pinned upstream commit): a
  `no-known-value-widening` false-positive risk on parenthesized assertion
  chains, and a `no-unsafe-dictionary-type` false-negative on intersection
  types. Both are inert today (neither rule is enabled repo-wide yet) — noted
  in issue 04's Caution section, which is where both get enabled.
- **Acknowledged, not changed**: the review pointed out that the
  `.oxlintrc.json` `overrides` mechanism this ticket introduces (per-file
  rule-off) is a hand-maintained list that only grows, when two of the four
  excepted rules already have a narrower built-in mechanism (a `SAFETY:`
  comment carve-out for `require-safety-comment-for-type-assertion`,
  `no-runtime-typeof`'s `allowInTypeGuards` option). Real point, but
  `allowInTypeGuards` alone wouldn't have removed the need for an override
  here — most of this ticket's `typeof` sites (closed-union discrimination,
  a generic recursive serializer) aren't type-guard functions at all, only
  the primary-key-conflict checks are. Restructuring the exception mechanism
  is a bigger decision than this ticket's scope; left as-is; a real question
  for a future phase.
- **Out of scope**: a suggestion to run `lint` and `lint:anti-slop` in
  parallel in `pnpm verify` (they're independent). Belongs to issue 01's
  script, not this ticket's file changes.

### Verification

Ran `pnpm verify` as one command (typecheck, typecheck:packages,
ui:catalog:check, lint, lint:anti-slop, format:check, test:coverage) after
the code-review fixes: **passes end to end** — 129 test files, 1296 tests
passed, 8 skipped. Also ran `packages/persistence/test/http-protocol.test.ts`
and `test/unit/postgres-import-decoding.test.ts` individually (23 tests) to
confirm the two changed files' own suites pass in isolation. Did not run the
opt-in `test:integration:postgres`/`postgres-space-repository.test.ts` suite
(needs Docker + `.env`, outside normal `verify`) — the changed functions are
exercised by the non-integration suite already run.

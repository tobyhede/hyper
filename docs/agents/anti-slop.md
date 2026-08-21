# Anti-slop

The 15 vendored rules are design constraints, not a formatting pass. Preserve type evidence from construction to use, parse external representations once at their I/O boundary, and give owned values named owner contracts. A green `pnpm lint:anti-slop` is the completion criterion; silencing a diagnostic without preserving that intent is not.

## Responding to a diagnostic

1. Read the diagnostic and its implementation under `tools/oxlint/anti-slop/rules/`; the implementation is the authoritative rule boundary.
2. Fix the lost evidence or misplaced boundary. Prefer inference or `satisfies` for known values, schema-derived or named owner types for contracts, and a parser at the first owned I/O boundary.
3. If the code is the boundary itself, implements an external contract, or exercises a real third-party seam, check `.oxlintrc.json` for the established exception category. Extend the narrowest existing file override with a site-specific rationale when the case genuinely matches. A new category must explain why the rule's preferred design cannot represent the code honestly.
4. Run `pnpm lint:anti-slop`. Every enabled rule must report zero unexcepted findings.

Do not reshape honest code merely to evade a syntactic rule: renaming an error to `cause`, replacing a justified dictionary with a `Map`, or moving a cast only hides the same design. Do not add a blanket disable, an inline suppression, or a rule downgrade. Repository exceptions live as file-scoped overrides in `.oxlintrc.json`, beside their rationale, so they remain reviewable.

## Evidence

- `no-known-value-widening` and `no-widen-then-assert`: keep a known value precise through use. Remove redundant broad annotations; use inference, `satisfies`, or a named owner contract.
- `no-chained-type-assertions`: a double assertion discards the missing proof. Preserve the source type or parse the value; `as const` chains are allowed.
- `require-safety-comment-for-type-assertion`: every non-const assertion needs an immediately preceding `SAFETY:` comment stating the checked invariant TypeScript cannot express. A comment that restates the target type is incomplete. Delete an avoidable assertion instead of documenting it. **This rule is unchanged by ADR 0062 and still applies to every surviving assertion** — see "Two rules on assertions" below, because it is no longer the whole of the policy.
- `no-object-parameters`, `no-unknown-parameters`, `no-unknown-returns`, and `no-unknown-type-aliases`: functions exchange parsed, named contracts. Keep `unknown` visible only inside an honest parsing, caught-error, or external-contract boundary; do not conceal it behind an alias.
- `no-unsafe-dictionary-type`: dictionaries carry a concrete owner/schema-derived value type. Parse an external payload before insertion.
- `no-runtime-typeof`: decode representations at I/O boundaries, then branch on domain values. Type predicates may use `typeof`; `.oxlintrc.json` records the boundary, platform-detection, closed-union, and value-under-test exceptions.

## Two rules on assertions

Since ADR 0062 a narrowing assertion faces two gates doing different jobs, and satisfying one says nothing about the other.

- `anti-slop/require-safety-comment-for-type-assertion` (oxlint) **demands a reason**. Unchanged, and it applies to every assertion still in the tree, including the ones the baseline below records.
- `@typescript-eslint/no-unsafe-type-assertion` (ESLint, type-aware) **caps the count**. A narrowing assertion is an error anywhere in the repository.

Do not weaken either to reduce the overlap. ADR 0062's reasoning is that a `SAFETY:` comment is satisfied by prose, prose is the cheapest thing an agent produces, and a comment does not survive the refactoring that moves the code it justifies — so the comment rule was never going to be the gate on new code. Equally, a count with no stated reason tells a reviewer nothing. Each rule is the other's blind spot.

### The suppressions baseline

`eslint-suppressions.json` at the repository root records the 79 narrowing assertions that predate the rule, across 36 files. A committed list of violations invites two wrong readings, and both are wrong:

- **It is not evidence the rule is decorative.** Those sites were examined in a reviewed pass (`.scratch/anti-slop/` issue 07) under exactly the test the rule applies, and none was found to be a missing type boundary. The file is the record of what review already accepted. A new assertion fails lint even in a file the baseline lists — and adding one to a listed file reports *every* assertion in that file, because a count-based baseline cannot tell which is new. That is the intended pressure.
- **It is not a backlog to schedule.** ADR 0062 rejected the cleanup on the evidence. `--prune-suppressions` runs in the `lint` that `verify` performs, so the file shrinks on its own as assertions go for other reasons, and the ceiling never rises. A project to empty it is the cleanup the ADR rejected, arriving under another name.

It is **generated and never hand-edited** — not to add an entry, not to raise a count, not to reformat (it is in `.prettierignore` for that reason).

**Do not regenerate it to make a new finding go away.** `eslint . --suppress-rule @typescript-eslint/no-unsafe-type-assertion` *merges and overwrites with current counts*, so running it on a tree that has grown assertions silently re-baselines them in and leaves `verify` green. That is the "answer a new finding by adding it to the suppressions file" ADR 0062's *negative to remember* forbids, reached through a command rather than an editor. `test/unit/assertion-ratchet.test.ts` pins the total against a ceiling for exactly this reason, and fails if the file goes missing, empties, grows a second rule, rises, or takes a shape ESLint would not have written.

The one gap left, recorded so nobody assumes otherwise: the baseline counts per file and rule rather than per site, so removing one assertion and adding another **in the same file** leaves the count equal and is never detected.

### Proving the gates still bite

`tools/typing-fixtures/` holds one small file per construct — seven that must be rejected and four that must survive — and `test/unit/typing-fixtures.test.ts` runs `tsc`, `eslint` and `oxlint` over them for real. **A `must-fail` fixture that passes is a gap in enforcement and a finding**, not a fixture to relax. The `must-pass` half is what catches a rule over-reaching; without it, rejecting everything would score full marks.

One limit on that half is worth knowing before relying on it. `must-pass/unknown-at-parse-boundary.ts` takes the same three boundary exemptions `packages/persistence/src/http-protocol.ts` takes (`no-unknown-parameters`, `no-runtime-typeof`, `no-unsafe-dictionary-type`), because a fixture claiming a genuine parse boundary survives has to be declared the way this repository declares one. It therefore **cannot** detect those three over-reaching. The exemption is scoped to that one file, so the other three `must-pass` fixtures still face every rule.

The fixtures are excluded from lint, format and the root program on purpose. ESLint and oxlint exclusion are pinned by tests; the root program is pinned only by the shape of `tsconfig.json`'s `include`, and Prettier exclusion is not pinned at all — a leak there would show up as a confusing `verify` failure rather than a silent pass.

## Ownership

- `no-shape-in-symbol-names`: name symbols for their domain role or owner; `shape` describes structure but assigns no responsibility.
- `no-object-parameters` also rejects ownerless `object` contracts; name what the function accepts.

## Seams and operations

- `no-module-mocking`: test through a real composition-time dependency seam and a faithful implementation. The scoped third-party rendering and filesystem fault-injection exceptions are documented in `.oxlintrc.json`; do not copy them to ordinary collaborators.
- `no-reflect-apply`: call typed functions directly or put dynamic dispatch behind a named interface.
- `no-reflect-get`: use typed property access or parse dynamic input into a named type before reading it.
- `no-conditional-empty-object-spread`: build the object, then add an optional property in a separate statement. Preserve omission semantics; assigning `undefined` is not equivalent under `exactOptionalPropertyTypes`.

## Sources of truth

`.oxlintrc.json` is the live enabled-rule and exception list. `tools/oxlint/anti-slop/PROVENANCE.md` pins the upstream source; upgrading requires a manual re-diff. `.scratch/anti-slop/research.md`, `spec.md`, and resolved issues record the adoption and migration history, not current instructions.

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
- `require-safety-comment-for-type-assertion`: every non-const assertion needs an immediately preceding `SAFETY:` comment stating the checked invariant TypeScript cannot express. A comment that restates the target type is incomplete. Delete an avoidable assertion instead of documenting it.
- `no-object-parameters`, `no-unknown-parameters`, `no-unknown-returns`, and `no-unknown-type-aliases`: functions exchange parsed, named contracts. Keep `unknown` visible only inside an honest parsing, caught-error, or external-contract boundary; do not conceal it behind an alias.
- `no-unsafe-dictionary-type`: dictionaries carry a concrete owner/schema-derived value type. Parse an external payload before insertion.
- `no-runtime-typeof`: decode representations at I/O boundaries, then branch on domain values. Type predicates may use `typeof`; `.oxlintrc.json` records the boundary, platform-detection, closed-union, and value-under-test exceptions.

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

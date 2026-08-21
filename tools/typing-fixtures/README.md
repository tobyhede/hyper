# Typing fixtures

Executable evidence that the repository's typing gates actually bite (ADR 0062, `.scratch/typescript-7/` issue 06).

Each file embodies exactly one construct. `test/unit/typing-fixtures.test.ts` runs the **real** toolchain over this directory — `tsc`, `eslint`, `oxlint` — and asserts the outcome, so a rule silently downgraded, removed or narrowed fails a test rather than passing unnoticed.

- `must-fail/` — a construct the toolchain has to reject, together with the tool and rule that must do the rejecting. **A fixture here that passes is a gap in enforcement and a finding**, not a fixture to relax.
- `must-pass/` — a construct that is legitimate and must survive. This half is what catches a rule over-reaching; without it, "reject everything" would score full marks.

`unknown-at-parse-boundary.ts` is the one qualified case: it takes the three boundary exemptions `packages/persistence/src/http-protocol.ts` takes, because a fixture claiming a genuine parse boundary survives has to be declared the way this repository declares one — and it therefore cannot detect those three over-reaching. The exemption is scoped to that file alone, so the other three still face every rule.

They are excluded from `eslint`, `oxlint` and the root TypeScript program, the same way `tools/oxlint/anti-slop/**` is, because half of them are supposed to fail. The test reaches them with `--no-ignore` and with this directory's own `tsconfig.json`. Nothing here is imported by the application.

# 06 — Prove the Space loaders refuse every input rather than throwing

**What to build:** Close the three behavioural gaps the graph-intake mutation control found in `packages/graph/src/space.ts`, all of them about what intake does with a document it cannot read. The evidence is in `.scratch/mutation-testing/graph-control-and-adoption.md`; the categories are the shared five in `.scratch/mutation-testing/survivor-classification.md`.

The largest gap is one rule seen from eight places. `loadSpace(input: unknown, …)` and `loadSpaceSnapshot(input: unknown)` are parsing boundaries, and their production callers are written on the promise that they refuse rather than throw — `parseSnapshot` in `src/persistence/postgres-space-repository.ts:99` turns a refusal into a `SnapshotValidationError`, and `openStoredWorkspace` in `packages/app/src/open-workspace.ts:25` turns one into "The backend returned an invalid space". Nothing proves the promise. Eight mutants across three guard sites and the two message fallbacks that pair with them — `#7` at `space.ts:100:39`, `#27` at `140:39`, `#86`/`#88`/`#89`/`#92` at `250`, and the `'(root)'` fallbacks `#57`/`#114` at `201`/`260` — survive the **whole 1651-test suite**, each hand-applied and measured. (`#12`, at `106:7`, is a *different* gap and has its own bullet below.) Under them, `loadSpace(null, [])` and `loadSpace(undefined, [])` throw `TypeError: Cannot read properties of null (reading 'version')` (or `Cannot use 'in' operator …`) and `loadSpaceSnapshot(null)` / `loadSpaceSnapshot(undefined)` throw `Cannot read properties of null (reading 'document')`, where all four currently answer `{ ok: false, errors: [{ kind: 'invalid-shape', message: '(root): …' }] }`.

This is the one place the campaign's evidence supports a **property**, and it is a different kind from the seven `space.ts` already has. The existing generators build well-formed documents by construction, so the properties are structure-preserving ("whatever cards you hand in come back sorted"); the missing one is robustness over arbitrary input, which is what a signature taking `unknown` actually promises. The measured yield of the existing property tests over the examples on this file is **one mutant in 148**, so this ticket adds the one property the survivors point at and no others.

Two smaller gaps ride along, both single mutants and both focused examples rather than properties:

- `#12` (`space.ts:106`) — a document with no `version` key, or a non-numeric one, must be answered by the shape check (`invalid-shape :: version: Invalid literal value, expected 1`), **not** by `unsupported-version`. The rule is written in the docblock at `space.ts:92` and proved nowhere.
- `#56` (`space.ts:201:35`) — a shape error names the **dotted** path of the failing key (`layouts.0.graphs: …`, not `layouts0graphs: …`). It survives because the two covering tests assert only `kind` and `message.includes('graphs')`.

Six further survivors at `space.ts:100` and `140` (`#2`, `#3`, `#4`, `#22`, `#23`, `#24`) are **out of scope**: they are category 3, already killed by `test/unit/read-single-space.test.ts`, `test/unit/import-space.test.ts` and `test/unit/hyper-cli.test.ts` — seven tests, measured. Do not restate those assertions in the graph package.

**Blocked by:** 04 — Run the graph-intake control and decide adoption.

**Status:** needs-triage

- [ ] One property, over arbitrary input, proves that both `loadSpace` and `loadSpaceSnapshot` return `ok: false` and never throw — including at minimum `null`, `undefined`, a string and a number, which are the four values the surviving mutants distinguish.
- [ ] The property asserts on the returned errors, not merely on "did not throw": a test that only wraps the call in `expect(...).not.toThrow()` would pass against a loader that swallowed the input and returned `ok: true`.
- [ ] The `(root)` message fallback is asserted for a root-level shape failure in **both** loaders, and a dotted multi-segment path is asserted for a nested one, so `#56`, `#57` and `#114` die to the same message contract rather than to three separate assertions.
- [ ] A focused example proves that a document with no `version`, and one whose `version` is not a number, earn `invalid-shape` from the shape check rather than `unsupported-version`.
- [ ] Every gap is proved red before green: each targeted mutant is hand-applied, the new test is shown failing, the source is restored with `git checkout --` and proved clean with `git diff --exit-code` before the next.
- [ ] `pnpm mutate:graph` is rerun and the result recorded against the control's 148 / 123 / 16 / 9 / 83.11%, with the surviving set re-argued: the eight `.min(1)`-unreachable mutants (`#137`–`#144`), the six the wider suite kills, and the one `static: true` engine artefact (`#148`) all stay alive on purpose.
- [ ] No production code in `packages/graph/src/space.ts` changes — this is an oracle ticket, and every gap it closes is a promise the code already keeps.
- [ ] The repository's required verification command passes.

# 06 — Prove the Space loaders refuse every input rather than throwing

**What to build:** Close the three behavioural gaps the graph-intake mutation control found in `packages/graph/src/space.ts`, all of them about what intake does with a document it cannot read. The evidence is in `.scratch/mutation-testing/graph-control-and-adoption.md`; the categories are the shared five in `.scratch/mutation-testing/survivor-classification.md`.

**Refreshed 2026-09-24 against `origin/main` at `bde05042`.** The evidence file cites lines from `552f915`; `space.ts` has since moved up by one to five lines, and two of the callers it names were deleted or renamed. A fresh `pnpm mutate:graph` on `bde05042` reproduced the control exactly — 148 mutants, 123 killed, 16 survived, 9 no coverage, 83.11% — with **the same mutant ids** on the same expressions, so only the locations below changed. The citations here are the current ones.

The largest gap is one rule seen from eight places. `loadSpace(input: unknown, …)` and `loadSpaceSnapshot(input: unknown)` are parsing boundaries, and their production callers are written on the promise that they refuse rather than throw — `parseSnapshot` in `src/persistence/sql-space-repository.ts:51` (the one SQL repository of ADR 0095, which replaced the PostgreSQL repository the evidence names) turns a refusal into a `SnapshotValidationError`, and `validateLoadedSpace` in `packages/app/src/open-spaces.ts:236` (formerly `openStoredWorkspace` in `open-workspace.ts`) turns one into "The backend returned an invalid space". Nothing proves the promise. Eight mutants across three guard sites and the two message fallbacks that pair with them — `#7` at `space.ts:99:39`, `#27` at `135:39`, `#86`/`#88`/`#89` at `245:5` and `#92` at `245:34`, and the `'(root)'` fallbacks `#57`/`#114` at `196:43`/`255:45` — survived the **whole suite** when the control measured them (1651 tests, each hand-applied). (`#12`, at `105:7`, is a *different* gap and has its own bullet below.) Under them, `loadSpace(null, [])` and `loadSpace(undefined, [])` throw `TypeError: Cannot read properties of null (reading 'version')` (or `Cannot use 'in' operator …`) and `loadSpaceSnapshot(null)` / `loadSpaceSnapshot(undefined)` throw `Cannot read properties of null (reading 'document')`, where all four currently answer `{ ok: false, errors: [{ kind: 'invalid-shape', message: '(root): …' }] }`.

This is the one place the campaign's evidence supports a **property**, and it is a different kind from the ones `space.ts` already has. The existing generators build well-formed documents by construction, so the properties are structure-preserving ("whatever cards you hand in come back sorted"); the missing one is robustness over arbitrary input, which is what a signature taking `unknown` actually promises. The measured yield of the existing property tests over the examples on this file is **one mutant in 148**, so this ticket adds the one property the survivors point at and no others.

Two smaller gaps ride along, both single mutants and both focused examples rather than properties:

- `#12` (`space.ts:105:7`) — a document with no `version` key, or a non-numeric one, must be answered by the shape check (`invalid-shape :: version: Invalid literal value, expected 1`), **not** by `unsupported-version`. The rule is written in the docblock at `space.ts:91`–`92` and proved nowhere.
- `#56` (`space.ts:196:35`) — a shape error names the **dotted** path of the failing key (`maps.0.graphs.0: …`, not `maps0graphs0: …`). It survives because the covering tests assert only `kind` and `message.includes('graphs')`.

Six further survivors at `space.ts:99` and `135` (`#2`, `#3`, `#4`, `#22`, `#23`, `#24`) are **out of scope**: they are category 3, already killed by `test/unit/read-single-space.test.ts`, `test/unit/import-space.test.ts` and `test/unit/hyper-cli.test.ts` — seven tests, measured. Do not restate those assertions in the graph package.

**Blocked by:** 04 — Run the graph-intake control and decide adoption.

**Status:** resolved — one property and three examples added to the graph package's intake tests kill all ten category-1 survivors; the rerun reports 148 / 139 / 2 / 7 / 93.92% against the control's 148 / 123 / 16 / 9 / 83.11%. `space.ts` is unchanged. See *Answer*.

- [x] One property, over arbitrary input, proves that both `loadSpace` and `loadSpaceSnapshot` return `ok: false` and never throw — including at minimum `null`, `undefined`, a string and a number, which are the four values the surviving mutants distinguish.
- [x] The property asserts on the returned errors, not merely on "did not throw": a test that only wraps the call in `expect(...).not.toThrow()` would pass against a loader that swallowed the input and returned `ok: true`.
- [x] The `(root)` message fallback is asserted for a root-level shape failure in **both** loaders, and a dotted multi-segment path is asserted for a nested one, so `#56`, `#57` and `#114` die to the same message contract rather than to three separate assertions.
- [x] A focused example proves that a document with no `version`, and one whose `version` is not a number, earn `invalid-shape` from the shape check rather than `unsupported-version`.
- [x] Every gap is proved red before green: each targeted mutant is hand-applied, the new test is shown failing, the source is restored with `git checkout --` and proved clean with `git diff --exit-code` before the next.
- [x] `pnpm mutate:graph` is rerun and the result recorded against the control's 148 / 123 / 16 / 9 / 83.11%, with the surviving set re-argued: the eight `.min(1)`-unreachable mutants (`#137`–`#144`), the six the wider suite kills, and the one `static: true` engine artefact (`#148`) all stay alive on purpose. *Met except for one prediction: the six the wider suite kills do **not** stay alive — the property the first criterion requires kills them. See Answer.*
- [x] No production code in `packages/graph/src/space.ts` changes — this is an oracle ticket, and every gap it closes is a promise the code already keeps.
- [ ] The repository's required verification command passes. *Not run locally by instruction; `pnpm verify` is left to CI. Run locally: `pnpm typecheck`, `pnpm typecheck:packages`, `pnpm lint`, `pnpm lint:anti-slop`, `pnpm format:check` and the graph and persistence package tests — see Answer.*

## Answer

2026-09-24, on branch `cq-mutation-findings` from `bde05042`.

**What was added — tests only.**

- `packages/graph/test/space.property.test.ts`, *intake over arbitrary input*: one property over `fc.oneof(rootLevelInput, objectInput)`. `rootLevelInput` is anything that is not an object (`null`, `undefined`, strings, doubles, booleans, bigints, arrays), `objectInput` is `fc.object()`; each is tagged at generation, so the test never classifies its own input with `typeof`. For every input, **both** loaders answer `ok: false` with at least one error, every error's kind is one of the three a document earns before any Resource is read (`invalid-shape`, `unsupported-version`, `retired-space-graphs`) with a non-empty message, and a root-level input earns exactly one `invalid-shape` whose message matches `/^\(root\): \S/`. `null`, `undefined`, `'a string'` and `42` are pinned as fast-check `examples`, so they run on every seed.
- `packages/graph/test/space.test.ts`: *rejects a map whose graphs are ids rather than owned values* now asserts a message matching `/^maps\.0\.graphs\.0: \S/` in place of `includes('graphs')`; and a new `it.each`, *answers a document with no version / a version that is not a number by its shape, not by its version*, asserts exactly one `invalid-shape` error whose message begins `version: `.

The dotted-path half of the message contract was already pinned for `loadSpaceSnapshot` (`space-snapshot.test.ts`, *locates an invalid shape in prose rather than dumping Zod*); the new example is its `loadSpace` counterpart.

**Red before green, each mutant hand-applied to `space.ts`, run against `space.test.ts` and `space.property.test.ts`, restored with `git checkout --`, and `git diff --exit-code packages/graph/src/space.ts` exit 0 after every one:**

| mutant | site | failing test(s) |
|---|---|---|
| `#7` | `99:39` `document === null` → `false` | the property |
| `#27` | `135:39` `document === null` → `false` | the property |
| `#86` | `245:5` condition → `true` | the property |
| `#88` | `245:5` `&&` → `\|\|` | the property |
| `#89` | `245:5` `typeof` operand → `true` | the property — counterexample `{ input: undefined }` |
| `#92` | `245:34` `!== null` operand → `true` | the property — counterexample `{ input: null }` |
| `#12` | `105:7` `typeof` guard → `false` | both version examples, and the property |
| `#56` | `196:35` `join('.')` → `join('')` | *rejects a map whose graphs are ids …* |
| `#57` | `196:43` `'(root)'` → `''` | the property |
| `#114` | `255:45` `'(root)'` → `''` | the property |

`#89` and `#92` are the two that separate `null` from `undefined`, which is why both are pinned as examples.

**The rerun.** `pnpm mutate:graph`, same oracle pairing, 52 seconds:

| | control (`552f915`, reproduced on `bde05042`) | after |
|---|---|---|
| Mutants | 148 | 148 |
| Killed | 123 | **139** |
| Survived | 16 | **2** |
| No coverage | 9 | **7** |
| Score (total / covered) | 83.11% / 88.49% | **93.92% / 98.58%** |

Sixteen more kills: the ten category-1 mutants above, and **the six category-3 mutants `#2`, `#3`, `#4`, `#22`, `#23`, `#24`, which the ticket expected to stay alive.** They die because the property the first criterion requires hands the loaders the very inputs those mutants break on: with the object guard at `space.ts:99` weakened, `null` or `undefined` is read into (`#2`, `#3`, `#4`); with the one at `135` weakened, `'graphs' in 'a string'` throws (`#22`, `#23`, `#24`). No assertion from the three `test/unit` files was restated — the kills come from the robustness property alone. This is recorded as a changed prediction, not a problem: those tests stay the oracle for the import path, and the graph package now also proves the guards directly.

The survivors left are exactly the ones argued alive on purpose: `#137` (Survived) and `#138`–`#144` (NoCoverage), the `map owns no graph` branch at `space.ts:305`–`311` that the schema's `.min(1)` makes unreachable; and `#148` (Survived), the `static: true` false survivor on `intake` at `space.ts:339:16`.

**Verification.** `pnpm typecheck`, `pnpm typecheck:packages`, `pnpm lint`, `pnpm lint:anti-slop`, `pnpm format:check` and `pnpm exec vitest run packages/graph packages/persistence` pass; `pnpm verify`, the full suites and e2e are left to CI.

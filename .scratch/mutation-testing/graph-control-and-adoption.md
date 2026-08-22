# Graph-intake control and the adoption decision — 2026-08-22

Issue `04`. A second bounded campaign, run against the opposite kind of target
from `SpaceSession`, so the two can be compared: **mature, pure, synchronous
code that has already had the treatment property testing gives.** The question
was whether a mutation campaign still finds anything there. It does — three
rules — and the campaign also produced a sharper result than the one it was
run for, recorded under *What the property tests caught*.

**Nothing in `packages/graph/src/space.ts`, in any test file, or in any other
source was changed.** Every hand-applied mutation below was reverted with
`git checkout --` and proved clean with `git diff --exit-code` (exit 0) before
the next one. `git status --short` at the end of this work shows only markdown
under `.scratch/`.

## How to reproduce

```
cd <repo root>
pnpm mutate:graph
```

which expands to

```
stryker run --mutate packages/graph/src/space.ts \
            --testFiles packages/graph/test/space-intake.test.ts,\
packages/graph/test/space.test.ts,\
packages/graph/test/space.property.test.ts,\
packages/graph/test/graph.property.test.ts,\
packages/graph/test/space-snapshot.test.ts
```

**The oracle pairing was checked, and kept unchanged.** `space.ts` exports
`loadSpace`, `loadSpaceSnapshot` and `documentRefusal`, and those five files are
exactly the graph-package tests whose *subject* is intake — 99 tests, 0.8s.
Four other files in `packages/graph/test` call `loadSpace` (`lookup.test.ts`,
`layout.test.ts`, `graph-rendering.test.ts`, `new-space.test.ts`) and none was
added: each uses the loader as a **builder** for its own subject, so including
them would have inflated the kill count with incidental kills and hidden exactly
the category-3 findings this campaign went looking for. `card-file.test.ts` was
likewise left out — `space.ts` delegates into `card-file.ts` and `validate.ts`,
but only `space.ts` is mutated, and its own card-error accumulation loop is
covered by `space.test.ts`. `documentRefusal`'s third door, `readSingleSpace`,
has its oracle at `test/unit/read-single-space.test.ts`, deliberately **not**
included: it is a different subject, and leaving it out is what let the
campaign measure how much of `space.ts` that file is really the oracle for
(answer: six mutants — see *Survivors*).

`package.json` was **not** modified. The `mutate:graph` script is as it was.

**Engine and versions**

| | |
|---|---|
| `@stryker-mutator/core` | 10.0.0 |
| `@stryker-mutator/vitest-runner` | 10.0.0 |
| vitest | 2.1.9 |
| fast-check | 3.23.2 |
| Node | v24.18.1 |
| pnpm | 9.15.0 |
| Platform | darwin arm64 (macOS, single machine) |

**Taken at** commit `552f915b7a0b6e1ba8e32a5fd79a01a68bcfed57` (`552f915`,
"Close the SpaceSession oracle gaps the baseline found (issue 03)"), branch
`chore/mutation-testing`, working tree clean. `stryker.conf.mjs` was not
touched, so every setting is the one the SpaceSession baseline documents.

**Scale and wall clock**

- `ProjectReader`: 1 of 1033 files to mutate, 5 test files matching
  `--testFiles`. No leak beyond the intended target.
- `Instrumenter`: **148 mutants** in 1 source file.
- 7 test-runner processes; dry run 99 tests in 1s, matching plain `vitest run`.
- **Wall clock: 17.6s** (`13:05:23` → `13:05:40`; Stryker's own "Done in 16
  seconds"). Against the ~30-minute budget that is **1%**. Two runs reproduced
  each other exactly — 148 / 123 / 16 / 9 / 83.11%.
- **No narrowing was needed.** No mutation range was applied, nothing was cut,
  and the whole file was mutated. `space.ts` is 344 lines against `session.ts`'s
  190 and its oracle is five files rather than one, yet it ran in **half** the
  time, because the tests are synchronous and pure — the SpaceSession campaign
  spends its wall clock waiting on promises, not on parsing.

**Two extra diagnostic sub-campaigns were run** to answer the property-vs-example
question, using the same `--mutate` target and a narrowed `--testFiles`. They
are diagnostics, not the headline:

```
pnpm exec stryker run --mutate packages/graph/src/space.ts \
  --testFiles packages/graph/test/space-intake.test.ts,packages/graph/test/space.test.ts,packages/graph/test/space-snapshot.test.ts   # 10.4s
pnpm exec stryker run --mutate packages/graph/src/space.ts \
  --testFiles packages/graph/test/space.property.test.ts,packages/graph/test/graph.property.test.ts                                   # 14.7s
```

Total engine time for all three runs: **43 seconds.**

**The hand-falsification harness.** Classifying survivors needed two things
Stryker cannot give: whether the *whole* suite kills a mutant (it cannot run —
see *Standing limits*), and what a mutated loader actually returns. Both were
done by hand-applying one mutation at a time, running, and restoring. The second
used a throwaway probe in the gitignored `reports/` directory (deleted
afterwards), run with `pnpm exec tsx`:

```ts
import { loadSpace, loadSpaceSnapshot } from '../packages/graph/src/index';
for (const v of [null, undefined, 'a string', 42]) { /* call both, print ok/errors/throw */ }
```

Unmutated, it prints the baseline this whole document rests on:

```
loadSpace(null)              -> ok:false invalid-shape :: (root): Expected object, received null
loadSpaceSnapshot(null)      -> ok:false invalid-shape :: (root): Expected object, received null
loadSpace(undefined)         -> ok:false invalid-shape :: (root): Required
loadSpaceSnapshot(undefined) -> ok:false invalid-shape :: (root): Required
loadSpace('a string')        -> ok:false invalid-shape :: (root): Expected object, received string
loadSpace(42)                -> ok:false invalid-shape :: (root): Expected object, received number
loadSpace({id, title})       -> ok:false invalid-shape :: version: Invalid literal value, expected 1
```

## Headline numbers

| | |
|---|---|
| Mutants generated | 148 |
| Killed | 123 |
| **Survived** | **16** |
| **No coverage** | **9** |
| Timeouts | 0 |
| Runtime errors | 0 |
| Mutation score | **83.11% total / 88.49% covered** |

Mutator breakdown:

| Mutator | Generated | Killed | Survived | No coverage |
|---|---:|---:|---:|---:|
| ConditionalExpression | 42 | 31 | 11 | 0 |
| StringLiteral | 21 | 16 | 1 | 4 |
| ObjectLiteral | 20 | 18 | 0 | 2 |
| EqualityOperator | 15 | 15 | 0 | 0 |
| BooleanLiteral | 13 | 12 | 0 | 1 |
| BlockStatement | 12 | 11 | 0 | 1 |
| LogicalOperator | 9 | 6 | 3 | 0 |
| ArrayDeclaration | 7 | 6 | 0 | 1 |
| ArrowFunction | 5 | 4 | 1 | 0 |
| CallExpression | 3 | 3 | 0 | 0 |
| MethodExpression | 1 | 1 | 0 | 0 |
| **Total** | **148** | **123** | **16** | **9** |

**83.11% is diagnostic evidence only.** It is not a target, not a threshold, not
a CI gate and not a `verify` gate — the three checks that say so are in
*Recommendation* below. It is also **not comparable to SpaceSession's 88.78%**,
for four reasons set out in *SpaceSession vs graph intake*.

**Two headline numbers, not one, and that is new.** This target has 9
`NoCoverage` mutants where `session.ts` had none, so Stryker reports a total
score (123/148) and a covered score (123/139) that differ by five points.
`NoCoverage` mutants were never run — the oracle does not reach them at all —
so they are un-killed in the strongest sense, and all 9 are classified below
alongside the 16 survivors. **25 mutants needed review, not 16.**

The corpus is not a neutral sample here either. `EqualityOperator` (15/15),
`CallExpression`, `MethodExpression` and `ObjectLiteral` (18/20) were killed
almost outright — those land on the aggregate the 99 tests exist to assert. The
un-killed set clusters in exactly three places: **the type guards that make the
loaders total functions**, **the text of a refusal**, and **one branch the
schema makes unreachable**.

## Survivors

All 25 non-killed mutants, one subsection per cluster (the clusters are real —
within each, every mutant reduces to the same missing input). Line and column
are `start` positions from `reports/mutation/mutation.json`. Only **one** mutant
in the run is `static: true`, and it is hand-falsified below.

---

### `#2`, `#3`, `#4` — the object guard in `unsupportedDocumentVersion`, `space.ts:100`

```diff
  function unsupportedDocumentVersion(document: unknown): UnsupportedVersionError | null {
-   if (typeof document !== 'object' || document === null) return null;
+   if (false) return null;                                             // #2, whole condition
+   if (typeof document !== 'object' && document === null) return null; // #3, || -> &&
+   if (false || document === null) return null;                        // #4, left operand
```

- `static`: false. `coveredBy`: **all 99 tests** (`#2`, `#3`, `#4`).
- **Category: 3. Wider-suite concern**

**The behavioural change is real.** Hand-applied, each makes the loaders throw
where they refuse: `#2`/`#3` throw `TypeError: Cannot read properties of null
(reading 'version')` for `loadSpace(null, [])`, for `loadSpace(undefined, [])`
and for `loadSpaceSnapshot` on *any* non-object; `#4` throws only for
`loadSpace(undefined, [])`. `#3`'s `&&` is never satisfiable — `typeof null` is
`'object'`, so no value makes both operands true — which is why it reduces
exactly to `#2`.

**But the assertion already exists, and it is not in this file.** With each
mutant applied, `pnpm test` reports **3 failed files, 7 failed tests**, every
time the same seven:

```
test/unit/read-single-space.test.ts  (4)  — readSingleSpace / readImportBatch
test/unit/import-space.test.ts       (2)  — importSingleSpace / importSpaceBatch
test/unit/hyper-cli.test.ts          (1)  — runHyper reports every file diagnostic with its path
```

That is `documentRefusal`'s third door doing its job: the import path reads
hand-written files, so a malformed one parses to a non-object and reaches this
guard, and the CLI's diagnostics prove the refusal. Killing these in
`space-intake.test.ts` would put the assertion in the wrong place, and worse,
would suggest the repo had a gap it does not have.

**This is the finding the SpaceSession baseline could not produce**, because
`session.ts` has one door. It is also the finding Stryker cannot produce on its
own: it cannot run the whole suite (`testFiles` is mandatory — see *Standing
limits*), so it reported six mutants as survivors that the repo kills.

---

### `#22`, `#23`, `#24` — the object guard in `retiredSpaceGraphs`, `space.ts:140`

```diff
  function retiredSpaceGraphs(document: unknown): SpaceError | null {
-   if (typeof document !== 'object' || document === null) return null;
+   if (false) return null;                                             // #22
+   if (typeof document !== 'object' && document === null) return null; // #23
+   if (false || document === null) return null;                        // #24
    if (!('graphs' in document)) return null;
```

- `static`: false. `coveredBy`: **98 tests** each.
- **Category: 3. Wider-suite concern**

Same shape as `#2`/`#3`/`#4`, one line later and slightly broader: the next
statement uses `in`, which throws on *any* primitive, so `#22`/`#23` throw for
`'a string'` and `42` as well as `null` and `undefined` —
`TypeError: Cannot use 'in' operator to search for 'graphs' in a string`.
Hand-applied, each produces the **same 3 files / 7 tests** failing as above.
The assertion's correct home is `test/unit/read-single-space.test.ts`, where it
already is.

---

### `#7` — `document === null` → `false`, `space.ts:100:39`

```diff
- if (typeof document !== 'object' || document === null) return null;
+ if (typeof document !== 'object' || false) return null;
```

- `static`: false. `coveredBy`: all 99 tests.
- **Category: 1. Meaningful behavioural gap**

**Observable difference:** `loadSpace(null, [])` throws
`TypeError: Cannot read properties of null (reading 'version')` instead of
returning `{ ok: false, errors: [{ kind: 'invalid-shape', message: '(root): Expected object, received null' }] }`,
and `loadSpaceSnapshot` throws the same for **every** non-object input, because
line 250 folds all of them to `null` before `documentRefusal` sees them.

`typeof null === 'object'`, so this is the operand that carries `null` — the one
value the first operand cannot catch. **Hand-applied and run against the whole
repository: `151 passed (151)` files, `1651 passed | 8 skipped`.** Nothing
anywhere in this codebase hands `null` to either loader. Restored,
`git diff --exit-code` exit 0.

---

### `#27` — `document === null` → `false`, `space.ts:140:39`

```diff
- if (typeof document !== 'object' || document === null) return null;
+ if (typeof document !== 'object' || false) return null;
```

- `static`: false. `coveredBy`: 98 tests.
- **Category: 1. Meaningful behavioural gap**

**Observable difference:** the same one at the second guard —
`loadSpace(null, [])` throws
`TypeError: Cannot use 'in' operator to search for 'graphs' in null`, and
`loadSpaceSnapshot` throws it for every non-object input.

Its three siblings on this line are killed by the import path; this one is not,
for the same reason as `#7` — the import path's malformed files parse to
non-object *non-null* values. **Whole suite: `1651 passed`.** Restored, exit 0.

---

### `#86`, `#88`, `#89`, `#92` — the optional-document read in `loadSpaceSnapshot`, `space.ts:250`

```diff
  const storedDocument =
-   typeof input === 'object' && input !== null ? (input as { document?: unknown }).document : null;
+   true ? … : null;                                    // #86, whole condition
+   typeof input === 'object' || input !== null ? …      // #88, && -> ||
+   true && input !== null ? …                           // #89, left operand
+   typeof input === 'object' && true ? …                // #92, right operand
```

- `static`: false. `coveredBy`: 39 tests each (the `loadSpaceSnapshot` half of
  the intake contract).
- **Category: 1. Meaningful behavioural gap** (all four)

**Observable difference:** `loadSpaceSnapshot(null)` and
`loadSpaceSnapshot(undefined)` throw
`TypeError: Cannot read properties of null/undefined (reading 'document')`
instead of returning `{ ok: false, errors: [{ kind: 'invalid-shape', message: '(root): …' }] }`.
Which of the two inputs distinguishes which mutant, measured by hand:

| mutant | `loadSpaceSnapshot(null)` | `loadSpaceSnapshot(undefined)` |
|---|---|---|
| `#86` | throws | throws |
| `#88` | throws | throws |
| `#89` | refuses (unchanged) | throws |
| `#92` | throws | refuses (unchanged) |

**Whole suite with each applied: `1651 passed | 8 skipped`, four times.** No
test in the repository calls `loadSpaceSnapshot` with a non-object.

This is the highest-value cluster in the run, and the reason is the signature.
`loadSpaceSnapshot(input: unknown)` is a **parsing boundary over stored bytes**,
and its production callers are written on the promise that it refuses rather
than throws: `parseSnapshot` in `src/persistence/postgres-space-repository.ts:99`
turns `intake.ok === false` into a `SnapshotValidationError`, and
`openStoredWorkspace` in `packages/app/src/open-workspace.ts:25` turns it into
"The backend returned an invalid space". A row whose `document` column is null,
or a backend that answers `{ snapshot: null }`, would produce a raw `TypeError`
past both of those handlers. Nothing proves it does not.

---

### `#12` — the version type guard, `space.ts:106:7`

```diff
- if (typeof declared !== 'number' || declared === SPACE_FILE_VERSION) return null;
+ if (false || declared === SPACE_FILE_VERSION) return null;
```

- `static`: false. `coveredBy`: all 99 tests.
- **Category: 1. Meaningful behavioural gap**

**Observable difference:** a document with no `version` key — or one whose
`version` is not a number — earns
`{ kind: 'unsupported-version', message: 'Space document version undefined is not supported; this build reads version 1' }`
instead of falling through to the shape check's
`{ kind: 'invalid-shape', message: 'version: Invalid literal value, expected 1' }`.
Measured, not inferred: the probe prints exactly those two strings before and
after.

This is a rule the code **states in prose and does not test**. `space.ts:92`:

> A version this cannot read at all (absent, not a number) is left to the shape
> check, whose message for it is already the right one.

Whole suite with it applied: `1651 passed`. The distinction matters because
`unsupported-version` is a *terminal* diagnosis — it tells an author their
document is from another build — while `invalid-shape` tells them a key is
wrong. Handing the first answer to a file that simply forgot `version:` is the
misdiagnosis the docblock was written to prevent.

---

### `#56` — the path separator in the invalid-shape message, `space.ts:201:35`

```diff
- message: `${issue.path.join('.') || '(root)'}: ${issue.message}`,
+ message: `${issue.path.join('') || '(root)'}: ${issue.message}`,
```

- `static`: false. `coveredBy`: 2 tests (`loadSpace reports a bad shape as
  errors rather than throwing`, `loadSpace rejects a layout whose graphs are ids
  rather than owned values`).
- **Category: 1. Meaningful behavioural gap** — the weakest one in the run

**Observable difference:** a nested shape error reports its location as
`layouts0graphs: Expected object, received string` rather than
`layouts.0.graphs: …` — an unreadable path in the one string that tells an
author *where* their document is wrong.

It survives because the two covering tests assert `kind === 'invalid-shape'` and
`message.includes('graphs')`, and `layouts0graphs` still contains `graphs`.
Whole suite: `1651 passed`. Recorded as category 1 because the sentence is
writable and the message is the public half of a refusal — but it earns no test
of its own: the assertion that kills `#57`/`#114` below kills this one in the
same breath.

---

### `#57` and `#114` — the `(root)` fallback, `space.ts:201:43` and `space.ts:260:45`

```diff
- message: `${issue.path.join('.') || '(root)'}: ${issue.message}`,
+ message: `${issue.path.join('.') || ''}: ${issue.message}`,
```

- `static`: false. `coveredBy`: **`[]` — NoCoverage, never run.**
- **Category: 1. Meaningful behavioural gap** (one in each loader)

**Observable difference:** a document whose *root* is the wrong type reports
`: Expected object, received null` — a message beginning with a bare colon —
instead of `(root): Expected object, received null`.

`NoCoverage` here is precise and useful: line 201 *is* executed by two tests, but
the `'(root)'` operand is only evaluated when `issue.path` is empty, which
happens only for a root-level Zod issue, which happens only for a non-object
document. **These two mutants and the eight guard mutants above are the same
hole seen from two sides** — the oracle never hands either loader a value that
is not a well-formed-ish object. Whole suite with `#56` applied: `1651 passed`;
`#57`/`#114` are not runnable by hand-substitution in a meaningful way beyond
that, since the probe already shows no test exercises the branch.

---

### `#137`–`#144` — the `layout owns no graph` branch, `space.ts:310`–`319`

```diff
  const built = buildSpaceLookup({ cards, layouts });
- if (!built.ok) {                                     // #137, condition -> false
-   return {                                           // #138, block -> {}
-     ok: false,                                       // #139 object -> {}, #140 false -> true
-     errors: [                                        // #141, array -> []
-       {                                              // #142, object -> {}
-         kind: 'invalid-shape',                       // #143, string -> ""
-         message: `layouts: layout "${built.layoutWithoutGraph}" owns no graph`,  // #144, -> ``
-       },
-     ],
-   };
- }
```

- `#137`: `static` false, `coveredBy` **55 tests**, Survived.
- `#138`–`#144`: `coveredBy` **`[]`**, NoCoverage.
- **Category: 2. Equivalent or unobservable variation** — *truly equivalent*,
  all eight

**The branch is unreachable through either loader, and the reason is in the
schema.** `positionedLayoutSchema` declares
`graphs: z.array(graphSchema).min(1)` (`packages/core/src/schema.ts:172`), and
both doors parse before `buildSpace` runs: `loadSpace` against `spaceFileSchema`
and `loadSpaceSnapshot` against `spaceSnapshotSchema`, whose `document` is
`spaceFileSchema.omit({ id: true })`. So every `layout.graphs` reaching
`buildSpaceLookup` has at least one element, `layout.graphs[0]` is always
defined, and `buildSpaceLookup` (`lookup.ts:108`) can never answer
`{ ok: false, layoutWithoutGraph }`. No input the two public entry points admit
distinguishes the mutants from the original. Whole suite with `#137` applied:
`1651 passed`.

The rule itself **is** tested, one layer down, where it is decided:
`packages/core/test/schema.test.ts:182` ("rejects a layout that owns no graphs —
one is the fewest it is created with") and
`packages/core/test/persistence-schema.test.ts:107`.

**No ticket, and the reasoning is worth writing down because it differs from
ticket `05`'s.** The `|| inFlight` clause ticket 05 covers is redundant *within
its own function* — nothing else needs it. This branch is `space.ts` handling a
failure result that belongs to a **different module's** contract:
`buildSpaceLookup` takes `readonly Layout[]`, and TypeScript array types cannot
express `.min(1)`, so a caller can hand it `graphs: []` and typecheck. Deleting
`space.ts`'s handling would mean either making `buildSpaceLookup` stop reporting
the failure — removing a real defence at a seam — or asserting non-null at the
call site, trading a dead branch for a lie. Eight un-killable mutants is the
honest price of `noUncheckedIndexedAccess` doing its job across a module
boundary. **It is, however, 5.4% of this file's mutant corpus that no oracle can
ever kill**, which is one of the reasons the score is not comparable to
SpaceSession's.

---

### `#148` — ArrowFunction — `space.ts:344:16`

```diff
- const intake = (space: Omit<Space, typeof SPACE_INTAKE>): Space => space as Space;
+ const intake = () => undefined;
```

- `static`: **true**
- `coveredBy`: **`[]`** (empty — `testsCompleted: 99`, "Ran all tests for this mutant")
- **Category: 5. Tooling problem**

**Falsification evidence.** Hand-applied to `space.ts`, then the five oracle
files:

```
 Test Files  5 failed (5)
      Tests  53 failed | 46 passed (99)
```

**53 of 99 tests fail.** The reported survival is false — this is the StrykerJS
vitest-runner activation defect recorded in `engine.md`. Restored with
`git checkout --`, proved with `git diff --exit-code` (exit 0).

**The detection heuristic held exactly as the baseline stated it.** `#148` is
the **only** `static: true` mutant in the corpus, no static mutant was scored
Killed, and the other nine empty-`coveredBy` mutants are all genuine
`NoCoverage` (a different status, never run rather than run-and-not-activated).
So the static-defect blast radius on `space.ts` is fully accounted for: **1 of
148 mutants, 1 of 25 needing review.** The failure count is again no guide —
53/99 here, 17/17 and 3/17 on `session.ts`.

Corrected for it, the campaign's real result is **124 of 148 effectively
killed**; corrected also for the six the wider suite kills, **130 of 148**.

## Survivor summary

| id | mutator | line:col | status | category | description |
|---|---|---|---|---|---|
| `#2` | ConditionalExpression | 100:7 | Survived | **3. Wider suite** | version guard's object check removed; killed by `read-single-space.test.ts` (7 tests) |
| `#3` | LogicalOperator | 100:7 | Survived | **3. Wider suite** | same guard `\|\|` → `&&` (unsatisfiable); same 7 tests |
| `#4` | ConditionalExpression | 100:7 | Survived | **3. Wider suite** | `typeof` operand → `false`; throws on `undefined`; same 7 tests |
| `#7` | ConditionalExpression | 100:39 | Survived | **1. Behavioural gap** | `document === null` → `false`; `loadSpace(null)` throws; whole suite green |
| `#12` | ConditionalExpression | 106:7 | Survived | **1. Behavioural gap** | absent/non-numeric version earns `unsupported-version`, contradicting the docblock |
| `#22` | ConditionalExpression | 140:7 | Survived | **3. Wider suite** | retired-graphs guard removed; `in` throws on any primitive; same 7 tests |
| `#23` | LogicalOperator | 140:7 | Survived | **3. Wider suite** | same guard `\|\|` → `&&`; same 7 tests |
| `#24` | ConditionalExpression | 140:7 | Survived | **3. Wider suite** | `typeof` operand → `false`; same 7 tests |
| `#27` | ConditionalExpression | 140:39 | Survived | **1. Behavioural gap** | `document === null` → `false`; `loadSpace(null)` throws; whole suite green |
| `#56` | StringLiteral | 201:35 | Survived | **1. Behavioural gap** | `join('.')` → `join('')`; shape-error path reads `layouts0graphs` |
| `#57` | StringLiteral | 201:43 | **NoCoverage** | **1. Behavioural gap** | `'(root)'` → `''`; root-level shape error never exercised in `loadSpace` |
| `#86` | ConditionalExpression | 250:5 | Survived | **1. Behavioural gap** | snapshot document read unguarded; `loadSpaceSnapshot(null\|undefined)` throws |
| `#88` | LogicalOperator | 250:5 | Survived | **1. Behavioural gap** | `&&` → `\|\|`; same two inputs throw |
| `#89` | ConditionalExpression | 250:5 | Survived | **1. Behavioural gap** | `typeof` operand → `true`; `undefined` throws |
| `#92` | ConditionalExpression | 250:34 | Survived | **1. Behavioural gap** | `!== null` operand → `true`; `null` throws |
| `#114` | StringLiteral | 260:45 | **NoCoverage** | **1. Behavioural gap** | `'(root)'` → `''`; same gap in `loadSpaceSnapshot` |
| `#137` | ConditionalExpression | 310:7 | Survived | **2. Equivalent** | `!built.ok` → `false`; schema's `.min(1)` makes the branch unreachable |
| `#138` | BlockStatement | 310:18 | **NoCoverage** | **2. Equivalent** | body of the same unreachable branch |
| `#139` | ObjectLiteral | 311:12 | **NoCoverage** | **2. Equivalent** | its returned object |
| `#140` | BooleanLiteral | 312:11 | **NoCoverage** | **2. Equivalent** | its `ok: false` |
| `#141` | ArrayDeclaration | 313:15 | **NoCoverage** | **2. Equivalent** | its `errors` array |
| `#142` | ObjectLiteral | 314:9 | **NoCoverage** | **2. Equivalent** | its error object |
| `#143` | StringLiteral | 315:17 | **NoCoverage** | **2. Equivalent** | its `'invalid-shape'` |
| `#144` | StringLiteral | 316:20 | **NoCoverage** | **2. Equivalent** | its message |
| `#148` | ArrowFunction | 344:16 | Survived | **5. Tooling problem** | `intake` stubbed; `static: true` false survivor — hand-run fails **53/99** |

**Category counts:** 1 → **10**; 2 → **8**; 3 → **6**; 4 → 0; 5 → **1**. Total 25.

Nothing landed in category 4; the run recorded zero timeouts at
`timeoutMS: 20000`, on a target with no asynchrony at all.

**Ten category-1 mutants, but only three rules.** They collapse:

1. **Intake is a total function — it refuses every input rather than throwing.**
   `#7`, `#27`, `#86`, `#88`, `#89`, `#92`, `#57`, `#114` — eight mutants, three
   guard sites, both loaders, one missing idea. Four calls kill all eight:
   `loadSpace(null, [])`, `loadSpace(undefined, [])`, `loadSpaceSnapshot(null)`,
   `loadSpaceSnapshot(undefined)`, each asserting `ok === false` **and the exact
   message** (the message is what kills `#57`/`#114`).
2. **A document with no version, or a non-numeric one, is the shape check's
   business.** `#12` — one mutant, one focused example, a rule already written
   in prose at `space.ts:92`.
3. **A refusal names the dotted path of the failing key.** `#56` — one mutant,
   killed for free by rule 1's message assertions plus one nested-path
   assertion.

## What the property tests caught that the examples did not — and the reverse

This is the control's sharpest result, and it needed the two sub-campaigns
because `killedBy` alone cannot answer it — Stryker credits a kill to the
*first* test that fails, so file order decides attribution. Running the oracle's
two halves separately over the same 148 mutants removes that artefact
completely.

| campaign | tests | killed | survived | no coverage | score (total) |
|---|---:|---:|---:|---:|---:|
| Examples only (`space-intake`, `space`, `space-snapshot`) | 86 | **122** | 17 | 9 | 82.43% |
| Properties only (`space.property`, `graph.property`) | 13 | **48** | 32 | 68 | 32.43% |
| Both (the real oracle) | 99 | **123** | 16 | 9 | 83.11% |

- **The property tests kill exactly one mutant the examples do not: `#123`.**
- **The examples kill 75 mutants the properties do not.**
- The two overlap on 47.
- Adding 13 property tests to 86 examples moved the campaign by **one mutant**.

Cross-checked against `coveredBy` in the full run: **no killed mutant is covered
only by property tests** — 54 are covered only by examples, 69 by both. There is
nothing the properties reach that the examples do not also reach.

**But `#123` is a genuinely good kill, and worth reading closely:**

```diff
  const cards = [...input.cards].sort(
-   (left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id),
+   (left, right) => left.title.localeCompare(right.title) && left.id.localeCompare(right.id),
  );
```

`a && b` returns `b` whenever `a` is truthy, so the mutant sorts by **id** and
falls back to title only on an id tie — the tie-break rule turned inside out.
It is killed by `loadSpace over card files loads exactly the cards it was
handed, ordered by title` (`space.property.test.ts`), a real `fc.assert` over
random ids and titles. Every example that could have caught it misses, and the
reason is a fixture coincidence the three of them share:

- `space.test.ts:92` — `Carla`/`…0005`, `Anders`/`…0002`, `Bo`/`…0003`. Title
  order is Anders, Bo, Carla; id order is 0002, 0003, 0005. **Identical.**
  Sorting by id gives the right answer for the wrong reason.
- `space.test.ts:48` `validCards` — `A`/`…0002`, `B`/`…0003`. Aligned again.
- `space.property.test.ts:51` — the hand-written tie-break example gives all
  three cards the **same** title, so `localeCompare` returns `0`, and
  `0 && x === 0` leaves the comparator's answer unchanged.

So the one thing the properties add is precisely the thing property testing is
for: **breaking an accidental correlation between two fields that every
hand-written fixture happens to preserve.** That is a real result, and it is one
mutant out of 148.

**The reverse direction is the larger number and the more useful one.** 75
mutants die only to examples, and they are the mutants that need a *specific,
named* input: a version-2 document, a duplicate card id in two named files, a
`defaultRenderer` naming neither a layout nor a built-in view, an alias whose
target is itself an alias. The generators produce well-formed documents by
construction, so they never propose those.

**And the un-killed set shows what neither half does.** Eight of the ten
category-1 mutants are killed by *no* input either half generates: `null`,
`undefined`, a bare string. The existing properties are **structure-preserving
properties over well-formed documents** — "whatever cards you hand in come back
sorted", "whatever layouts you declare flatten in order". Not one of them is a
**robustness property over arbitrary input**, which is what a parsing boundary
taking `unknown` actually promises. That is a different *kind* of property, not
more of the same kind, and it is the only property-testing work this campaign's
evidence supports.

## SpaceSession vs graph intake

| | SpaceSession (ticket `02`) | Graph intake (ticket `04`) |
|---|---|---|
| Target | `persistence/src/session.ts`, 190 lines | `graph/src/space.ts`, 344 lines |
| Nature | async state machine, stateful, observable | pure, synchronous, total function over `unknown` |
| Oracle | 1 file, 17 examples, 0 properties | 5 files, 86 examples + 13 properties |
| Mutants generated | 98 | 148 |
| Killed | 87 | 123 |
| Survived | 11 | 16 |
| No coverage | 0 | **9** |
| Timeouts | 0 | 0 |
| Reported score | 88.78% | 83.11% total / 88.49% covered |
| Tests run per mutant | 3.37 | 14.09 |
| **Wall clock** | **36.8s** | **17.6s** |
| Category 1 (gaps) | **6 mutants → 2 rules** | **10 mutants → 3 rules** |
| Category 2 (equivalent) | 3 | **8** |
| Category 3 (wider suite) | **0** | **6** |
| Category 5 (tooling) | 2 | **1** |
| No-action share of review | 5 of 11 = **45%** | 15 of 25 = **60%** |
| Tests the findings earned | 2 (written by ticket `03`) | 3 rules, proposed as ticket `06` |

### Why the two scores are not comparable, and the comparison that is

Four independent reasons, any one of which is sufficient:

1. **Different files generate different corpora.** 148 mutants against 98 is not
   1.5× the code — `space.ts` is dense in string literals and boolean operators,
   which Stryker mutates aggressively, while `session.ts` is dense in `switch`
   fan-out, which it mutates once per case. The denominators measure the
   engine's appetite, not the oracle's quality.
2. **8 of `space.ts`'s 148 mutants are un-killable by construction** — the
   `.min(1)` branch. That is a permanent 5.4% ceiling penalty no test can lift.
   `session.ts` had 3 such mutants in 98 (3.1%).
3. **`NoCoverage` splits the score in two on one target and not the other.**
   83.11% and 88.49% are both true of this run; 88.78% has no second number to
   compare to.
4. **The reported score is a score for the *named oracle*, not for the repo.**
   Six of these survivors are killed by `test/unit/read-single-space.test.ts`,
   which Stryker cannot run — so the honest repo-wide figure is 130 of 148
   (87.8%) once the engine artefact is corrected too. `session.ts` has one door
   and no such correction.

**The comparison the classification vocabulary asks for** — category-1 count and
review effort — is the one in the table, and it says something the percentages
actively obscure: **the mature, property-tested target yielded *more* useful
rules (3) than the hand-example-tested state machine (2), and it did so 2×
faster.** The hypothesis this control was built to test — "property testing has
already extracted the value here, so mutation testing will find nothing" — is
**falsified**, and it is falsified in a specific way: property testing extracted
the value *of the shapes its generators produce*, and produced no defence at all
for the shapes they do not.

### Review effort, honestly

The graph campaign's review is measured; the SpaceSession one is partly
reconstructed from what its documents record, so the comparison is directional.

**Graph intake — 25 mutants, ~21 minutes of classification** after the first
campaign finished (13:04 → ~13:25 wall clock), ≈50s per mutant:

- ~4 min on the eight category-2 mutants — cheap per mutant because they
  collapse to one cause; one look at `positionedLayoutSchema` settled all eight.
- ~2 min on the single category-5 mutant — one hand-run of the five oracle
  files. The baseline estimated "roughly ten minutes of falsification per
  campaign"; here it was two, because there was one static mutant instead of
  two and the oracle runs in under a second.
- **~7 min on the six category-3 mutants**, and this is the new tax. Deciding
  category 1 versus category 3 needs a full-suite run **per mutant** — 15 runs
  at ~24s each — because the engine cannot tell you the repo already kills
  something. Without those runs, six tests would have been written into
  `space-intake.test.ts` duplicating assertions that already live in
  `test/unit/read-single-space.test.ts`.
- ~8 min on the ten category-1 mutants, the productive part, including the
  probe that turned each "would throw" into a printed `TypeError`.

**No-action mutants consumed ~13 of the 21 minutes — 62% of review effort for
zero tests.** Categories 2 and 5 alone (the classification's pure waste) were
~6 min, 29%.

**SpaceSession — 11 mutants.** The baseline records three hand-falsifications
and estimates ~10 minutes for the static tax alone; category 2 needed an
algebraic argument per mutant (`#5`) and a data-flow argument (`#104`/`#105`),
and the `|| inFlight` reachability question it opened took ticket 03 a six-step
proof to close. Its no-action share was 5 of 11 (45%), lower than here, but its
per-mutant arguments were harder — nothing about `session.ts` could be settled
by reading a schema.

**Runtime is a rounding error on both.** 37s and 18s against a 30-minute budget.
**Review is the entire cost of this technique**, on both targets, by two orders
of magnitude. Any decision that weighs runtime is measuring the wrong thing.

## Recommendation: ADOPT

**ADOPT** — keep StrykerJS exactly as it is retained today: two explicit local
`mutate:*` commands, no score threshold, no CI job, no `verify` gate, run
deliberately at the moment a specific module's oracle is in question, never on a
schedule and never over the repo.

### The evidence

1. **Both campaigns found real, unproved contracts, and the control did not
   behave like a control.** The strongest single fact: **on a mature, pure,
   already-property-tested parsing boundary, the campaign found that neither
   `loadSpace` nor `loadSpaceSnapshot` is proved to refuse `null` — eight
   mutants across three guard sites survive the entire 1651-test suite, at a
   function whose signature is `unknown` and whose two production callers
   (`parseSnapshot`, `openStoredWorkspace`) are written on the promise that it
   refuses rather than throws.** If the treatment property testing gives had
   made mutation testing redundant, that hole would not exist. It does.
2. **Two campaigns, five rules, four of which are stated in the codebase's own
   prose and proved nowhere.** SpaceSession's conflict-refusal rule is asserted
   in a comment at `space-authoring.ts:1378` ("`session` ignores the call
   outside a conflict, so there is nothing to check here"); the version rule is
   asserted in a docblock at `space.ts:92`. A campaign that finds the gap
   between what a docblock promises and what a test proves is doing something
   review demonstrably did not.
3. **The cost is bounded and known.** 18–37 seconds of engine time; 20–35
   minutes of review; one hour of work total per target. It is affordable
   *because* it is not automated — nobody is paying this tax on every push.
4. **The engine's known defect is small and detectable.** 1 static mutant in 148
   here, 2 in 98 there; `"static": true` with an empty `coveredBy` finds them
   every time, and the hand-run costs two minutes.

### The strongest argument against, stated fairly

**60% of this campaign's review effort produced no action, and the largest
single cause is a limitation of the tool itself.** Six mutants were reported as
survivors that the repository kills, and the only way to discover that was
fifteen full-suite runs by hand — because Stryker's `testFiles` is mandatory
here (`test/unit`'s repo-meta test shells out to `git ls-files` and gets `[]` in
the sandbox), so the engine is structurally incapable of telling you whether the
wider suite already covers a survivor. `session.ts` has one door and so paid
none of this; `space.ts` has three and paid seven minutes. **A module with more
collaborators would pay more, and the fraction of wasted review would keep
climbing.** A reviewer who skipped those runs would have written six tests into
the wrong file and called it an improvement.

That argument is real, and it is why the recommendation is *adopt this narrow
thing* rather than *adopt mutation testing*. It does not reach removal: the
tax is paid once per deliberate campaign by the person who chose to run it, and
both campaigns cleared it — 2 rules and 3 rules respectively, from targets
chosen precisely because they were the two hardest cases to justify.

### The exact retained shape

Unchanged from what ticket `01` retained. Nothing was added, removed or
reconfigured by this ticket:

- `@stryker-mutator/core` and `@stryker-mutator/vitest-runner`, both `10.0.0`,
  root devDependencies.
- `stryker.conf.mjs`, with every load-bearing knob carrying its reason.
- `pnpm mutate:session` and `pnpm mutate:graph`, each pairing one `--mutate`
  target with the `--testFiles` that are its oracle.
- `/.stryker-tmp/` and `/reports/` ignored by `.gitignore`, `.prettierignore`, `eslint.config.js` and `.oxlintrc.json`.

**Confirmation that no threshold and no gate exists — all three checked, at this
commit:**

1. `thresholds: { high: 80, low: 60, break: null }` in `stryker.conf.mjs` (the `thresholds` key, cited by name because a later commit moved its line).
   `break: null` is Stryker's own "never fail the process" value; `high`/`low`
   only colour the report.
2. `grep -rn "mutate\|stryker" .github/workflows/` → **no matches** (exit 1).
   Neither script, nor the binary, nor the config appears in any workflow file.
3. `verify` is
   `typecheck:toolchain && typecheck && typecheck:packages && ui:catalog:check && lint && lint:anti-slop && format:check && test:coverage`
   — it does not call `mutate:session`, `mutate:graph` or `stryker`, and
   `test:coverage` is `vitest run --coverage`.

### One method step to add, and one standing limit

Neither changes the setup; both change how a campaign is read.

- **Before classifying any survivor as category 1, hand-apply it and run the
  whole suite.** Six of this run's sixteen survivors are killed elsewhere in the
  repo, and the engine says nothing about it. This is now the difference between
  category 1 and category 3, and it is not optional.
- **`engine.md`'s "Standing limits" gains a bullet:** the reported score is a
  score for the *named oracle*, not for the repository. On `space.ts` that is a
  six-mutant understatement (83.11% reported against 87.8% repo-wide once the
  engine artefact is corrected too).

### Broader property-testing work: exactly one item

Proposed, with its evidence:

- **A robustness property over arbitrary input for both loaders**, in ticket
  `06`. Evidence: eight of the ten category-1 survivors — `#7`, `#27`, `#86`,
  `#88`, `#89`, `#92`, `#57`, `#114` — express one quantifiable rule ("intake
  refuses every input rather than throwing") that the examples do not reach and
  that the *existing* properties structurally cannot, because their generators
  produce well-formed documents by construction. This is a different kind of
  property from the seven already in the file, not more of the same kind.

**Nothing else is proposed, and the campaign argues actively against the general
form of the suggestion.** The thirteen existing property tests kill exactly one
mutant of 148 that the 86 examples do not, and no killed mutant is covered only
by a property. "Write more property tests" is not supported by this evidence;
"write the one property whose absence eight survivors point at" is.

Worth recording as a lesson rather than a ticket: `#123` survives every example
because `space.test.ts:48`, `space.test.ts:92` and the tie-break example at
`space.property.test.ts:51` all pick card ids whose sort order happens to match
their titles'. The property already covers it, so there is nothing to fix — but
it is a concrete demonstration that hand-picked fixtures correlate fields
without anyone intending it.

## Follow-up tickets opened

- **`06` — Prove the Space loaders refuse every input** (`needs-triage`). Covers
  all three category-1 rules: the total-function property (8 mutants), the
  absent-version example (`#12`), and the message-path assertion (`#56`).

**Not opened, deliberately:**

- **The unreachable `layout owns no graph` branch** (`#137`–`#144`, 8 mutants).
  Reasoning in that survivor's subsection: unlike ticket `05`'s redundant
  clause, this is one module handling another module's declared failure result,
  and the type system cannot express the `.min(1)` that makes it unreachable.
  Deleting it would remove a real defence or add a lie.
- **The six category-3 mutants.** The assertion that kills them already exists,
  in `test/unit/read-single-space.test.ts`. There is nothing to do.
- **Anything about `#148`.** It is a StrykerJS defect, already recorded in
  `engine.md`, and writing a test to work around it would encode someone else's
  bug in this repo's suite.

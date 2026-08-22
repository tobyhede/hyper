# SpaceSession mutation baseline — 2026-08-22

The honest baseline asked for by issue `02`: a mutation campaign against
`SpaceSession` **with its existing tests left exactly as they are**. Nothing in
`packages/persistence/src/session.ts`, `packages/persistence/test/session.test.ts`
or any other source or test file was changed to produce these numbers. Ticket 03
strengthens the oracle; this file is what it strengthens it against.

## How to reproduce

```
cd <repo root>
pnpm mutate:session
```

which expands to

```
stryker run --mutate packages/persistence/src/session.ts \
            --testFiles packages/persistence/test/session.test.ts
```

**Engine and versions**

| | |
|---|---|
| `@stryker-mutator/core` | 10.0.0 |
| `@stryker-mutator/vitest-runner` | 10.0.0 |
| vitest | 2.1.9 |
| Node | v24.18.1 |
| pnpm | 9.15.0 |
| Platform | darwin arm64 (macOS, single machine) |

**Baseline taken at** commit `13dfa60b6193614b5c7daf721b346cb97289eaf3`
(`13dfa60`, "Choose StrykerJS over mewt for mutation testing (issue 01)"), branch
`chore/mutation-testing`, working tree clean.

**Config settings that scope the campaign** — all in `stryker.conf.mjs`, each
carrying its reason in a comment there:

- `testRunner: 'vitest'` with `vitest.configFile: 'vitest.config.ts'` — the real
  root config, so the `@project/*` aliases resolve inside the sandbox copy and the
  tests import the **mutated** package.
- `plugins: ['@stryker-mutator/vitest-runner']` — the default glob does not
  resolve through pnpm's non-flat `node_modules`.
- `vitest.related: false` — vitest's related mode throws on the repo's
  `import.meta.glob(…, { query: '?raw' })` markdown fixtures.
- `coverageAnalysis: 'perTest'` — this is what makes a survivor triageable; it is
  the source of the `coveredBy` test names quoted below, and it recovered most of
  the narrowing `related: false` gives up (3.37 tests per mutant rather than 17).
- `checkers: []` — no `typescript-checker`. It rejects 56 of these 98 mutants as
  `CompileError`, including 10 of the 11 survivors, which would lift the reported
  score to 97.62% by deleting the signal.
- `ignorePatterns: ['.claude/**', '.worktrees/**']` — the tracked directory
  symlinks under `.claude/skills/` make the sandbox copier die on macOS.
- `thresholds.break: null` — no gate, ever.
- `timeoutMS: 20000`.
- `mutate` / `testFiles` are supplied per campaign by the `mutate:session` script
  and are a **pair**: the whole suite cannot run in the sandbox, because
  `test/unit`'s repo-meta test shells out to `git ls-files` and gets `[]` from a
  plain directory copy.

**Scale and wall clock**

- `ProjectReader`: found 1 of 1030 files to mutate, 1 test file matching
  `--testFiles`. No leak beyond the intended target.
- `Instrumenter`: 98 mutants in 1 source file.
- 7 test-runner processes (`ConcurrencyTokenProvider`).
- Dry run: 17 tests, matching plain `vitest run` on that file.
- **Wall clock: 36.8s** (`12:34:25` → `12:35:01`; Stryker's own "Done in 35
  seconds"). Against the ticket's ~30-minute cap that is ~2% of budget.
- Deterministic: this run reproduces the two prior runs exactly — 98 / 87 / 11 /
  88.78%.

**Evidence that no test or source file was modified.** `git status --short` at the
end of this work shows only markdown under `.scratch/`:

```
 M .scratch/mutation-testing/issues/02-establish-the-space-session-baseline.md
?? .scratch/mutation-testing/baseline-space-session.md
```

The three temporary hand-mutations described under *Survivors* were each
reverted with `git checkout --` and proved clean with `git diff --exit-code`
before the next step; `reports/` and `.stryker-tmp/` are gitignored.

## Headline numbers

| | |
|---|---|
| Mutants generated | 98 |
| Killed | 87 |
| **Survived** | **11** |
| Timeouts | 0 |
| No coverage | 0 |
| Runtime errors | 0 |
| Mutation score | **88.78%** (total and covered are identical — every mutant was run) |

Mutator breakdown:

| Mutator | Generated | Killed | Survived |
|---|---:|---:|---:|
| ConditionalExpression | 26 | 22 | 4 |
| StringLiteral | 18 | 16 | 2 |
| ObjectLiteral | 18 | 16 | 2 |
| BlockStatement | 13 | 13 | 0 |
| EqualityOperator | 9 | 9 | 0 |
| LogicalOperator | 5 | 4 | 1 |
| CallExpression | 4 | 4 | 0 |
| BooleanLiteral | 3 | 3 | 0 |
| ArrowFunction | 2 | 0 | **2** |
| **Total** | **98** | **87** | **11** |

**88.78% is diagnostic evidence only.** It is not a target, not a threshold, not
a CI gate and not a `verify` gate. `thresholds.break` is `null` in
`stryker.conf.mjs`, `mutate:session` appears in no workflow, and nothing in
`pnpm verify` runs it. Two of the eleven survivors are engine artefacts
(below), so even as evidence the number is soft in the direction of
under-reporting the oracle: the honest reading of this run is "87 killed, 9 real
survivors, 6 of them worth a test".

Note also that the mutant *corpus* is not a neutral sample. `BlockStatement`,
`EqualityOperator`, `CallExpression` and `BooleanLiteral` were killed 100% —
those mutators land on the state machine's spine, where any test that runs at all
notices. The survivors cluster in exactly two places: literals whose value is
never read back, and guard conditions on the two operations no test invokes
outside their happy path.

## What the oracle already does well

The 87 kills are concentrated on the commit lifecycle, and they are real proofs,
not coincidence:

- **The whole `switch (result.kind)` fan-out is pinned.** Every `case` label
  mutant (`#29`, `#43`, `#48`, `#53`), every case's string literal, and every
  `publishPersistence({ kind: … })` object and literal (`#46`, `#47`, `#51`,
  `#52`, `#57`, `#58`) died. Committed, retryable-failure, permanent-failure and
  conflict each produce a distinguishable, asserted persistence state.
- **Coalescing is pinned end to end.** `inFlight = true/false` (`#22`, `#28`),
  `if (inFlight)` both ways (`#72`, `#73`), `newest !== committing` both ways
  (`#75`, `#76`, `#77`), and deleting the recursive `startCommit(nextWaiting, …)`
  call (`#42`) all died. So did `if (nextWaiting === undefined)` in both
  directions (`#33`, `#34`, `#35`).
- **`submit`'s early return is fully pinned** — all nine mutants on line 150
  (`previous.kind === 'conflicted' || previous.kind === 'failed'`) died, including
  both operand-level ones and the `||`→`&&` swap.
- **`retry`'s guard is fully pinned** — all six mutants on line 160 died,
  including `state.persistence.kind === 'failed'` inverted and the `|| inFlight`
  half swapped to `&&`. This is the sharpest contrast in the whole report:
  `retry` has the same guard shape as `acceptRemote` and `resolveConflict`, and
  the test "disables retry after permanent failure but allows a later valid
  submit" exercises the *refusing* branch. Nothing exercises the refusing branch
  of the other two.
- **`hasChangedSinceExport` is pinned as a function** — forcing it to `true`
  (`#2`), to `false` (`#3`), inverting either comparison (`#6`, `#8`) and
  swapping `||`→`&&` (`#4`) all died. Only the one provably-equivalent operand
  rewrite survived.
- **The observer-failure contract is pinned** — emptying `reportToConsole`'s body
  (`#9`), blanking its message (`#11`) and swapping `??`→`&&` on the reporter
  default (`#17`) all died.

**Six of the 17 tests are credited with zero kills** (Stryker attributes a kill
to the first test that fails, so this means "no mutant was attributed here", not
"this test is worthless" — a mutant these tests would also catch was usually
caught earlier in the file order). For the record, the per-test kill/covered
counts from the clear-text report:

| Kills | Test |
|---:|---|
| 25 | persists an optimistic Edit and notifies later observers when one observer fails |
| 18 | queues an Edit submitted from a pending notification raised inside an optimistic one |
| 10 | queues an Edit submitted from a pending notification raised inside a conflicted one |
| 9 | retains local work on conflict until accepting the returned remote snapshot |
| 7 | disables retry after permanent failure but allows a later valid submit |
| 5 | coalesces a submit made from an observer into one commit of the newest snapshot |
| 4 | updates optimistically, persists a complete snapshot, and acknowledges success |
| 4 | stops on retryable failure and retries the latest working snapshot explicitly |
| 2 | reports an observer failure to the console when no reporter is supplied |
| 2 | derives export status from the returned durable state while conflicted |
| 1 | commits an explicitly reconciled conflict against the returned current revision |
| 0 (covered 46) | continues session work when reporting an observer failure also fails |
| 0 (covered 52) | coalesces edits behind one in-flight commit to the latest complete snapshot |
| 0 (covered 52) | carries the acknowledged revision into the coalesced commit it starts |
| 0 (covered 64) | carries the reconciled working snapshot into the commit it starts |
| 0 (covered 46) | derives export status only from acknowledged durable revisions |
| 0 (covered 46) | contains a rejected asynchronous observer and still notifies the rest |

The single most productive test is the first one in the file, which is an
artefact of ordering as much as of strength.

## Survivors

All 11, one subsection each. Line and column are `start` positions from
`reports/mutation/mutation.json`. `coveredBy` names come from the same report's
`testFiles` map; the `openSpaceSession >` describe prefix is dropped for brevity.

---

### `#0` — ArrowFunction — `packages/persistence/src/session.ts:33:15`

```diff
- const clone = <T>(value: T): T => structuredClone(value);
+ const clone = () => undefined;
```

- `static`: **true**
- `coveredBy`: `[]` (empty — `testsCompleted: 17`, "Ran all tests for this mutant")
- **Category: 5. Tooling problem**

**Falsification evidence.** Hand-applied to `session.ts`, then
`pnpm exec vitest run packages/persistence/test/session.test.ts`:

```
 Test Files  1 failed (1)
      Tests  17 failed (17)
```

**17 of 17 tests fail.** The reported survival is false. This is exactly the
StrykerJS vitest-runner defect recorded in `engine.md` — activation is not
delivered for `static: true` mutants, so the mutant is scored on a run in which
it was never actually active. Restored with `git checkout --`, proved with
`git diff --exit-code` (exit 0).

---

### `#1` — ArrowFunction — `packages/persistence/src/session.ts:35:31` (to `38:85`)

```diff
- const hasChangedSinceExport = (
-   acknowledgedRevision: bigint,
-   exportedRevision: bigint | null,
- ): boolean => exportedRevision === null || acknowledgedRevision !== exportedRevision;
+ const hasChangedSinceExport = () => undefined;
```

- `static`: **true**
- `coveredBy`: `[]` (empty — `testsCompleted: 17`, "Ran all tests for this mutant")
- **Category: 5. Tooling problem**

**Falsification evidence.** Hand-applied, then the same command:

```
 Test Files  1 failed (1)
      Tests  3 failed | 14 passed (17)
```

The three that fail:

- `updates optimistically, persists a complete snapshot, and acknowledges success`
- `derives export status from the returned durable state while conflicted`
- `derives export status only from acknowledged durable revisions`
  (`expected undefined to be false` at `session.test.ts:554`)

So the mutant **is killed** by the file as it stands, and the reported survival is
false. Restored and proved clean.

**A correction to the spike's framing, worth carrying into ticket 04.** `engine.md`
describes the defect as static mutants that "in fact fail every test in the file".
`#0` does; `#1` does **not** — it fails 3 of 17. The defect is therefore not
detectable by "does it fail everything"; the only reliable signals are
`"static": true` with an empty `coveredBy`, and a hand-run. Do not lower the
falsification bar for ticket 04 on the assumption that a false static survivor is
always catastrophic.

**Both static mutants in this file are survivors, and there are exactly two.** No
`static: true` mutant was scored Killed, and no non-static mutant has an empty
`coveredBy`. So the static-defect blast radius on `session.ts` is fully accounted
for: 2 of 98 mutants, 2 of 11 survivors. Corrected for it, the campaign's real
result is 89 effectively-killed of 98.

---

### `#5` — ConditionalExpression — `packages/persistence/src/session.ts:38:15` (to `38:40`)

```diff
- ): boolean => exportedRevision === null || acknowledgedRevision !== exportedRevision;
+ ): boolean => false || acknowledgedRevision !== exportedRevision;
```

- `static`: false
- `coveredBy`: **all 17 tests** in the file
- **Category: 2. Equivalent or unobservable variation** — *truly equivalent*

This rewrites only the **left operand**, leaving
`acknowledgedRevision !== exportedRevision`. `acknowledgedRevision` is a `bigint`
at every call site (`loaded.revision`, `result.revision`, `result.current.revision`,
`current.revision`), so when `exportedRevision` is `null` the surviving comparison
`bigint !== null` is already `true` — the same answer the removed guard gave. When
`exportedRevision` is a `bigint`, the removed operand was `false` and contributed
nothing. The mutated function returns the same value for every value the types
admit; it cannot be killed, and no assertion should be invented to try.

The signal here is a *design* one, not a test one: the `exportedRevision === null`
clause is redundant given the parameter types, and it is the only reason it reads
as intentional. Note the contrast with `#3` (same span, whole expression → `false`)
and `#2` (→ `true`), both of which died: the function's overall behaviour is well
pinned, and only this one algebraically-equivalent rewrite got through.

---

### `#14` — ObjectLiteral — `packages/persistence/src/session.ts:54:18`

```diff
-     persistence: { kind: 'settled' },
+     persistence: {},
```

- `static`: false
- `coveredBy`: **all 17 tests** in the file
- **Category: 1. Meaningful behavioural gap**

**Observable difference:** a caller that reads `getState().persistence` on a
freshly opened session — before any `submit` — sees `{}` instead of
`{ kind: 'settled' }`, and no test asserts the persistence state a session is in
at the moment `openSpaceSession` returns.

Every test in this file reaches `getState()` only after a `submit`, by which point
`startCommit` has published `{ kind: 'pending' }` over the initial value. The two
tests that read state before submitting (`derives export status only from
acknowledged durable revisions`, twice) read `changedSinceExport` and nothing else.

The mutation is otherwise inert: `submit`'s guard checks for `'conflicted'` and
`'failed'`, `retry` for `'failed'`, `acceptRemote`/`resolveConflict` for
`'conflicted'`, and `{}` matches none of them, so control flow is unchanged. The
*only* thing that changes is the value a caller reads — which is precisely what
category 1 asks for.

---

### `#15` — StringLiteral — `packages/persistence/src/session.ts:54:26`

```diff
-     persistence: { kind: 'settled' },
+     persistence: { kind: "" },
```

- `static`: false
- `coveredBy`: **all 17 tests** in the file
- **Category: 1. Meaningful behavioural gap**

**Observable difference:** the same one as `#14` in a weaker form — a freshly
opened session reports `persistence.kind === ''` rather than `'settled'`.

Grouped with `#14`: one test of the initial state kills both. Worth noting that
`packages/app/test/session-fixtures.ts` switches exhaustively over
`state.persistence.kind` with no `default`, so an unrecognised kind falls out of
that switch returning `undefined` — the app has no defence against a bad initial
kind, which is why this is a gap rather than a curiosity.

---

### `#89` — ConditionalExpression — `packages/persistence/src/session.ts:165:11` (to `165:50`)

```diff
      acceptRemote: () => {
        const state = observable.getState();
-       if (state.persistence.kind !== 'conflicted') return;
+       if (false) return;
```

- `static`: false
- `coveredBy`:
  - `retains local work on conflict until accepting the returned remote snapshot`
  - `derives export status from the returned durable state while conflicted`
- **Category: 1. Meaningful behavioural gap**

**Observable difference:** calling `acceptRemote()` while the session is *not*
conflicted must leave state untouched and publish nothing; mutated, it destructures
`current` off a non-conflicted persistence state, gets `undefined`, and throws
`TypeError: Cannot read properties of undefined (reading 'exportedRevision')` at
`session.ts:167` — and no test calls `acceptRemote()` outside a conflict.

**Falsification evidence** (confirming the engine is honest for the non-static
class): hand-applied `if (false) return;`, then
`pnpm exec vitest run packages/persistence/test/session.test.ts` →
`Test Files 1 passed (1) / Tests 17 passed (17)`. A genuine survivor. Restored,
`git diff --exit-code` exit 0.

Both covering tests call `acceptRemote()` only after `waitFor(… kind === 'conflicted')`.
The negative branch of this guard is never entered by any test in the file — in
stark contrast to `retry`, whose identical guard shape is fully killed because
`disables retry after permanent failure` does exercise its refusal.

*Mitigating context, not a downgrade:* the one app caller,
`acceptStoredSpace` in `packages/app/src/space-authoring.ts:1349`, checks
`persistence.kind !== 'conflicted'` itself before calling. So today's app cannot
trigger the throw. The `SpaceSession` contract still promises the no-op, and
`session.test.ts` is the oracle for that contract.

---

### `#98` — ConditionalExpression — `packages/persistence/src/session.ts:177:11` (to `177:62`)

```diff
      resolveConflict: (snapshot) => {
        const state = observable.getState();
-       if (state.persistence.kind !== 'conflicted' || inFlight) return;
+       if (false) return;
```

- `static`: false
- `coveredBy`:
  - `queues an Edit submitted from a pending notification raised inside a conflicted one`
  - `commits an explicitly reconciled conflict against the returned current revision`
  - `carries the reconciled working snapshot into the commit it starts`
- **Category: 1. Meaningful behavioural gap**

**Observable difference:** calling `resolveConflict(snapshot)` while the session is
not conflicted must leave state untouched, publish nothing and start no commit;
mutated, it proceeds, destructures `current` as `undefined` and throws
`TypeError` at `session.ts:179` — and no test calls `resolveConflict` outside a
conflict.

This is the highest-value survivor in the run, because unlike `acceptRemote` the
app does **not** guard the call. `packages/app/src/space-authoring.ts:1378-1380`:

```ts
// Read at the moment the author asks, never captured earlier. `session`
// ignores the call outside a conflict, so there is nothing to check here.
keepLocalWork: () => session.resolveConflict(session.getState().working),
```

The app states in a comment that it depends on this guard, and the session's own
test file does not prove it. That is the sentence category 1 exists for.

---

### `#99` — LogicalOperator — `packages/persistence/src/session.ts:177:11` (to `177:62`)

```diff
-       if (state.persistence.kind !== 'conflicted' || inFlight) return;
+       if (state.persistence.kind !== 'conflicted' && inFlight) return;
```

- `static`: false
- `coveredBy`: the same three tests as `#98`
- **Category: 1. Meaningful behavioural gap**

**Observable difference:** the same one — with `&&`, a `resolveConflict` call made
while the session is settled/pending/failed/rejected and no commit is in flight no
longer returns early, and throws instead of no-op'ing.

Enumerating the four entry states makes the reduction explicit
(`A = kind !== 'conflicted'`, `B = inFlight`):

| state at entry | original `A \|\| B` | mutated `A && B` | differs? |
|---|---|---|---|
| conflicted, not in flight | proceed | proceed | no |
| **not conflicted, not in flight** | **return** | **proceed → throws** | **yes** |
| not conflicted, in flight | return | return | no |
| conflicted, in flight | return | proceed | see below |

*Open question I did not settle.* I could not construct a reachable
`conflicted && inFlight` entry state: `inFlight` is set `false` immediately before
the `conflict` publication, and every path that sets it `true` publishes
`{ kind: 'pending' }` in the same synchronous step, so a reentrant caller never
observes the pair. If that holds, the `|| inFlight` clause on line 177 is dead and
`#99` reduces exactly to `#98`. I did not prove it exhaustively — flagging it for
ticket 03 as a possible redundant clause rather than asserting it.

---

### `#100` — ConditionalExpression — `packages/persistence/src/session.ts:177:11` (to `177:50`)

```diff
-       if (state.persistence.kind !== 'conflicted' || inFlight) return;
+       if (false || inFlight) return;
```

- `static`: false
- `coveredBy`: the same three tests as `#98`
- **Category: 1. Meaningful behavioural gap**

**Observable difference:** the same one again, isolated to the operand that matters
— with the `'conflicted'` check removed and only `inFlight` retained, a
`resolveConflict` call made outside a conflict with no commit in flight proceeds
and throws rather than doing nothing.

That `#98`, `#99` and `#100` all survive and all reduce to the same missing case is
the strongest evidence in this baseline: three independent rewrites of one guard,
one uncovered transition.

---

### `#104` — ObjectLiteral — `packages/persistence/src/session.ts:185:22`

```diff
        const resolvedState: SpaceSessionState = {
          working,
          acknowledgedRevision: current.revision,
          changedSinceExport: hasChangedSinceExport(current.revision, exportedRevision),
-         persistence: { kind: 'conflicted', current },
+         persistence: {},
        };
        startCommit(working, current.revision, resolvedState);
```

- `static`: false
- `coveredBy`: the same three tests as `#98`
- **Category: 2. Equivalent or unobservable variation** — *truly equivalent*

`resolvedState` has exactly one consumer: it is passed to `startCommit` as
`unpublishedState`, and `startCommit`'s only use of it is

```ts
observable.publish({ ...unpublishedState, persistence: { kind: 'pending' } });
```

which overwrites `persistence` unconditionally. The field is dead on this path — no
value assigned to it can ever be read, published or observed, so no assertion can
distinguish the mutant. Killing this would require asserting on a value that never
leaves the function.

The design signal: `SpaceSessionState` requires a `persistence` field, so
`resolveConflict` must write *something* it knows will be discarded. `'conflicted'`
is the honest choice (it is still the state at that instant), but it is decoration.

---

### `#105` — StringLiteral — `packages/persistence/src/session.ts:185:30`

```diff
-         persistence: { kind: 'conflicted', current },
+         persistence: { kind: "", current },
```

- `static`: false
- `coveredBy`: the same three tests as `#98`
- **Category: 2. Equivalent or unobservable variation** — *truly equivalent*

Identical reasoning to `#104`: the whole `persistence` value on line 185 is
overwritten by `startCommit`'s publication before anything can read it.

## Survivor summary

| id | mutator | line:col | category | description |
|---|---|---|---|---|
| `#0` | ArrowFunction | 33:15 | **5. Tooling problem** | `clone` stubbed; `static: true` false survivor — hand-run fails **17/17** |
| `#1` | ArrowFunction | 35:31 | **5. Tooling problem** | `hasChangedSinceExport` stubbed; `static: true` false survivor — hand-run fails **3/17** |
| `#5` | ConditionalExpression | 38:15 | **2. Equivalent** | `exportedRevision === null` → `false`; algebraically identical for all typed inputs |
| `#14` | ObjectLiteral | 54:18 | **1. Behavioural gap** | initial `persistence` → `{}`; no test reads state before the first submit |
| `#15` | StringLiteral | 54:26 | **1. Behavioural gap** | initial `persistence.kind` → `""`; same gap as `#14` |
| `#89` | ConditionalExpression | 165:11 | **1. Behavioural gap** | `acceptRemote` guard removed; no test calls it outside a conflict |
| `#98` | ConditionalExpression | 177:11 | **1. Behavioural gap** | `resolveConflict` guard removed entirely; no test calls it outside a conflict |
| `#99` | LogicalOperator | 177:11 | **1. Behavioural gap** | `resolveConflict` guard `\|\|` → `&&`; reduces to the same uncovered case |
| `#100` | ConditionalExpression | 177:11 | **1. Behavioural gap** | `resolveConflict` conflicted-check removed, `inFlight` kept; same uncovered case |
| `#104` | ObjectLiteral | 185:22 | **2. Equivalent** | `resolvedState.persistence` → `{}`; overwritten by `startCommit` before any read |
| `#105` | StringLiteral | 185:30 | **2. Equivalent** | `resolvedState.persistence.kind` → `""`; same dead field |

**Category counts:** 1 → **6**; 2 → **3**; 3 → 0; 4 → 0; 5 → **2**. Total 11.

Nothing landed in category 3 (wider-suite concern) or category 4 (timeout).
`session.test.ts` is the correct home for every real gap found, and the run
recorded zero timeouts at `timeoutMS: 20000`.

## What ticket 03 should act on

Only the six category-1 survivors, in two groups.

### Group A — the state a session opens in (`#14`, `#15`)

**Shape: a focused example.** This is a single, singular scenario — "what does
`getState()` say the instant `openSpaceSession` returns, before anything has been
submitted" — and it has one right answer, not a family of them. A property here
would be ceremony around one assertion.

Suggested subject: open a session over a known `LoadedSpace` and assert the whole
initial `SpaceSessionState` — `working` equal to the loaded snapshot,
`acknowledgedRevision` equal to `loaded.revision`, the derived `changedSinceExport`,
and `persistence` exactly `{ kind: 'settled' }`. Asserting the complete state
object rather than the one field is what makes it kill both mutants and keeps it
honest if a sixth persistence kind is ever added.

### Group B — the conflict-only operations refuse outside a conflict (`#89`, `#98`, `#99`, `#100`)

**Shape: an observable state-machine property.** Four survivors across two
functions all express one transition rule, and the rule is naturally quantified
over the persistence states the session can be in:

> For every persistence state that is not `conflicted`, calling `acceptRemote()`
> or `resolveConflict(snapshot)` changes nothing observable: `getState()` returns
> an identical state, no listener is notified, and the backend records no further
> commit attempt.

That is the shape ticket 03's brief asks for when several survivors express one
transition rule, and it is stronger than four separate examples in a useful way:
it also covers `rejected` and `pending`, which no mutant happened to point at but
which the same guard governs. `MemorySpaceBackendTestControl.attempts` gives the
"no backend call" half directly, and a counting subscriber gives the "no
notification" half — both already-used idioms in this file.

Three practical notes for whoever writes it:

1. Driving the session into each of `settled`, `pending`, `failed` and `rejected`
   is the bulk of the work; `control.queueResult` and `control.deferNextCommit`
   already do all four.
2. The property must assert on **published state and recorded attempts**, not on
   "did not throw". A test that only wraps the call in `expect(...).not.toThrow()`
   would kill these mutants for the wrong reason, and would keep passing if the
   guard were later replaced by a silent early return that also wiped state.
3. Ticket 03 should decide, separately, whether the `|| inFlight` clause on line
   177 is reachable at all (see `#99` above). If it is not, the honest fix may be
   to delete the clause rather than to test it — which would remove `#99` and
   `#100` from the corpus rather than kill them. Either outcome is defensible;
   silently adding a test that pretends the clause is live is not.

## What ticket 03 should NOT act on, and why

**Category 2 — `#5`, `#104`, `#105`.** Three equivalent mutants, and each would
have to be killed by an assertion on a value that no caller can ever read.

- `#5` (`exportedRevision === null` → `false`): the mutated expression returns the
  same boolean for every value the parameter types admit. There is no input that
  distinguishes them, so there is no test that kills it — only a test that
  *appears* to, by asserting something else. The finding to record is that the
  null guard is redundant given `acknowledgedRevision: bigint`; that is a
  simplification to consider, not a test to write, and it is out of scope for a
  ticket whose job is the oracle.
- `#104` / `#105` (`resolvedState.persistence`): the field is overwritten by
  `startCommit` before any publication, so killing them means reaching inside
  `resolveConflict` for a local that never escapes — a white-box assertion on a
  private intermediate, which is exactly what the classification vocabulary calls
  "unobservable through the seam". Record instead that the field is dead weight
  the `SpaceSessionState` type forces `resolveConflict` to fill in.

**Category 5 — `#0`, `#1`.** These are not gaps and there is nothing to test.
`#0` is already killed by all 17 tests and `#1` by 3 of them; the survival is a
StrykerJS vitest-runner defect on `static: true` mutants, hand-falsified above.
Writing a test to "cover" `clone` or `hasChangedSinceExport` would add an assertion
the suite does not need, would not change the reported score (the runner would
still fail to activate the mutant), and would encode a workaround for someone
else's bug in this repo's tests. The correct response is the one already in
`engine.md`: check `static: true` survivors by hand, and carry the count into
ticket 04's adoption decision as the measured cost of the engine — 2 of 98 mutants
and roughly ten minutes of falsification per campaign.

**Categories 3 and 4** produced nothing in this run.

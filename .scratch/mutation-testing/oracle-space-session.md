# Closing the SpaceSession oracle gaps — 2026-08-22

Issue `03`, acting on `.scratch/mutation-testing/baseline-space-session.md`. Two
tests were added to `packages/persistence/test/session.test.ts`; **nothing in
`packages/persistence/src/session.ts` changed.** Every hand-applied mutation
below was reverted with `git checkout --` and proved clean with
`git diff --exit-code` (exit 0) before the next step.

The six category-1 survivors are all dead. `pnpm mutate:session` now reports
**93 killed of 98, 5 survived, 94.90%** against the baseline's 87 / 11 / 88.78%,
and the five that remain are exactly the three equivalent mutants and the two
engine artefacts the baseline said to leave alone.

## What was added

### 1. `opens settled on the loaded snapshot before anything is submitted`

**Targets:** `#14` (ObjectLiteral, `54:18`, initial `persistence` → `{}`) and
`#15` (StringLiteral, `54:26`, initial `persistence.kind` → `""`).

**Shape: a focused example**, as the baseline recommended. There is one right
answer to "what does `getState()` say the instant `openSpaceSession` returns",
not a family of them, and a property here would be ceremony around one
assertion. It asserts the **whole** `SpaceSessionState` with `toEqual` rather
than the one field — `working`, `acknowledgedRevision`, `changedSinceExport` and
`persistence` together — which is what makes one test kill both mutants and what
forces a sixth persistence kind or a fifth state field to be accounted for here
rather than slipping past a `toMatchObject`.

**Red — `#14`.** Hand-applied `persistence: {},` at line 54, then
`pnpm exec vitest run packages/persistence/test/session.test.ts`:

```
 Test Files  1 failed (1)
      Tests  1 failed | 17 passed (18)
```

The one failure is the new test, at `session.test.ts:57`
(`expect(session.getState()).toEqual({…})`) — confirming the baseline's finding
that no existing test reads the state a session opens in.

**Red — `#15`.** Restored, proved clean, then hand-applied
`persistence: { kind: '' },`. Same result: `1 failed | 17 passed (18)`, same
assertion.

**Green.** Restored, `git diff --exit-code` exit 0, `18 passed (18)`.

### 2. `refuses acceptRemote and resolveConflict in every state but conflicted`

**Targets:** `#89` (ConditionalExpression, `165:11`, `acceptRemote`'s guard →
`false`), `#98` (`177:11`, `resolveConflict`'s whole guard → `false`), `#99`
(LogicalOperator, `177:11`, `||` → `&&`) and `#100` (`177:11`, the
`'conflicted'` check → `false`, `inFlight` kept).

**Shape: an observable state-machine property** (`fc.asyncProperty`), as the
baseline recommended. Four survivors across two functions express one rule, and
the rule is naturally quantified:

> For every persistence state that is not `conflicted`, and every finite
> sequence of `acceptRemote()` / `resolveConflict(snapshot)` calls, the session
> is unchanged: `getState()` returns the same object *and* the same value, no
> subscriber is notified, and the backend records no further commit attempt.

Two departures from the baseline's sketch, both deliberate:

- It quantifies over **sequences** of calls (1–4, drawn from both operations,
  with an arbitrary title for the `resolveConflict` argument), not over one call.
  The refusal being repeatable is part of the rule, and it is what the app's
  `keepLocalWork` button relies on — a user can click it as often as they like.
- The four entry states are reached by driving a real session through
  `submit` and one commit outcome (`openSessionIn`, a helper built from the
  file's existing `MemorySpaceBackendTestControl`, `waitFor` and `changedTitle`
  idioms), so the state under test is the one the state machine produces. Its
  `settled` is the *post-commit* settled, not the state a session opens in,
  which test 1 already owns.

The assertions are deliberately **not** `expect(…).not.toThrow()`, per the
baseline's warning. Identity (`toBe(before)`) catches a publication, value
(`toEqual` against a `structuredClone` taken beforehand) catches an in-place
edit, a counting subscriber catches a notification, and
`control.attempts` catches a backend call.

**Red — all four mutants.** Each hand-applied to line 165 or 177 in turn, each
followed by a restore and `git diff --exit-code` exit 0:

| mutant | applied | result |
|---|---|---|
| `#89` | `if (false) return;` at 165 | `1 failed \| 18 passed (19)` — `TypeError: Cannot read properties of undefined (reading 'exportedRevision')` |
| `#98` | `if (false) return;` at 177 | `1 failed \| 18 passed (19)` — same `TypeError` |
| `#99` | `kind !== 'conflicted' && inFlight` at 177 | `1 failed \| 18 passed (19)` — same `TypeError` |
| `#100` | `false \|\| inFlight` at 177 | `1 failed \| 18 passed (19)` — same `TypeError` |

In every case the single failing test is the new property.

**Red — the assertions, independently of the throw.** Because all four mutants
happen to kill by `TypeError`, a fifth falsification was run to prove the test
does not merely detect a throw. Line 165 was replaced with a *silent,
non-throwing* early return that still republishes:

```ts
if (state.persistence.kind !== 'conflicted') { observable.publish({ ...state }); return; }
```

```
 Test Files  1 failed (1)
      Tests  1 failed | 18 passed (19)
Got AssertionError: expected { working: { …(3) }, …(3) } to be { working: { …(3) }, …(3) } // Object.is equality
```

The identity assertion is what catches it, which is exactly the failure mode the
baseline said a `not.toThrow()` test would sail past. Restored, exit 0.

**Green.** `19 passed (19)`; the file runs in ~85ms against ~9ms before, and
`pnpm mutate:session` still finishes in 36 seconds.

## Before and after

| id | mutator | line:col | baseline category | baseline | now |
|---|---|---|---|---|---|
| `#0` | ArrowFunction | 33:15 | 5. Tooling problem | Survived | **Survived** (unchanged, by design) |
| `#1` | ArrowFunction | 35:31 | 5. Tooling problem | Survived | **Survived** (unchanged, by design) |
| `#5` | ConditionalExpression | 38:15 | 2. Equivalent | Survived | **Survived** (unchanged, by design) |
| `#14` | ObjectLiteral | 54:18 | 1. Behavioural gap | Survived | **Killed** — `opens settled on the loaded snapshot…` |
| `#15` | StringLiteral | 54:26 | 1. Behavioural gap | Survived | **Killed** — `opens settled on the loaded snapshot…` |
| `#89` | ConditionalExpression | 165:11 | 1. Behavioural gap | Survived | **Killed** — `refuses acceptRemote and resolveConflict…` |
| `#98` | ConditionalExpression | 177:11 | 1. Behavioural gap | Survived | **Killed** — `refuses acceptRemote and resolveConflict…` |
| `#99` | LogicalOperator | 177:11 | 1. Behavioural gap | Survived | **Killed** — `refuses acceptRemote and resolveConflict…` |
| `#100` | ConditionalExpression | 177:11 | 1. Behavioural gap | Survived | **Killed** — `refuses acceptRemote and resolveConflict…` |
| `#104` | ObjectLiteral | 185:22 | 2. Equivalent | Survived | **Survived** (unchanged, by design) |
| `#105` | StringLiteral | 185:30 | 2. Equivalent | Survived | **Survived** (unchanged, by design) |

The `killedBy` attribution is taken from `reports/mutation/mutation.json`, so
each of the six was killed by the test written for it and not incidentally.

Headline, both ways:

| | baseline | now |
|---|---:|---:|
| Mutants generated | 98 | 98 |
| Killed | 87 | **93** |
| Survived | 11 | **5** |
| Timeouts / no coverage / errors | 0 / 0 / 0 | 0 / 0 / 0 |
| Mutation score | 88.78% | **94.90%** |
| Category-1 survivors | 6 | **0** |
| Tests in the file | 17 | 19 |
| Tests run per mutant | 3.37 | 2.94 |
| Wall clock | 36.8s | 36s |

Corrected for the two engine artefacts (`#0` and `#1` are killed by a hand-run
and only *reported* as survivors), the real result is **95 of 98 effectively
killed, with 3 provably equivalent mutants left**.

**94.90% is still diagnostic evidence only.** `thresholds.break` remains `null`,
`mutate:session` is in no workflow, and nothing in `pnpm verify` runs it. The
number that matters here is the category-1 count going 6 → 0, not the percentage.

Two side effects worth recording, neither a problem:

- **Kill attribution shifted.** Stryker credits a kill to the first test that
  fails, so putting the new example first in the file moved seven kills onto it
  that other tests had held: it is credited with 9 (`#3`, `#4`, `#7`, `#8` on
  `hasChangedSinceExport`, `#12`, `#13`, `#59`, plus its own `#14` and `#15`).
  `updates optimistically…` and `derives export status only from acknowledged
  durable revisions` consequently drop to 0 attributed kills. That is ordering,
  not weakening — the baseline already flagged the same artefact.
- **Tests per mutant fell** from 3.37 to 2.94 even though the file grew, because
  the two new tests are narrow: the example touches only the open path, and the
  property touches only the two conflict-only operations.

## What was deliberately not killed

Five survivors remain and all five are the ones the baseline told ticket 03 to
leave alone. Each is recorded here rather than answered with an assertion.

**`#5` — ConditionalExpression, `38:15`, category 2, truly equivalent.**
`exportedRevision === null || acknowledgedRevision !== exportedRevision` becomes
`false || acknowledgedRevision !== exportedRevision`. `acknowledgedRevision` is a
`bigint` at every call site, so when `exportedRevision` is `null` the surviving
comparison is already `true`, and when it is a `bigint` the removed operand
contributed nothing. No input the types admit distinguishes the two programs, so
no honest test kills it. The finding is a *design* one — the null guard is
redundant given the parameter types — and simplifying it is out of scope for a
ticket whose job is the oracle. Note that the new whole-state example does cover
this line and killed four of its neighbours (`#3`, `#4`, `#7`, `#8`); it did not
kill `#5`, which is the expected behaviour of an equivalent mutant and mild
evidence that the classification was right.

**`#104` / `#105` — ObjectLiteral and StringLiteral, `185:22` and `185:30`,
category 2, unobservable through the seam.** `resolvedState.persistence` has
exactly one consumer — `startCommit`, which publishes
`{ ...unpublishedState, persistence: { kind: 'pending' } }` and overwrites the
field unconditionally before any subscriber can read it. Killing these means
asserting on a local that never escapes `resolveConflict`, which is the
white-box assertion the classification vocabulary exists to refuse. The finding
is that `SpaceSessionState` forces `resolveConflict` to fill in a field it knows
will be discarded.

**`#0` / `#1` — ArrowFunction, `33:15` and `35:31`, category 5, tooling
problem.** Both are `static: true` with an empty `coveredBy`, and both are
already killed by the file as it stands: the baseline's hand-runs fail 17/17 and
3/17 respectively. The survival is the StrykerJS vitest-runner activation defect
recorded in `engine.md`. A test written to "cover" `clone` or
`hasChangedSinceExport` would not change the reported score — the runner would
still fail to activate the mutant — and would encode a workaround for someone
else's bug in this repo's tests. They stay as measured engine cost for ticket
04's adoption decision: 2 of 98 mutants per campaign.

## The `|| inFlight` reachability question

**Verdict: the `|| inFlight` disjunct on line 177 is unreachable as a deciding
clause. It is dead. So is its twin on line 160.** The baseline's suspicion was
right, and the argument closes.

The invariant is:

> **INV.** Whenever `inFlight === true`, the installed persistence kind is
> `pending`.

Six steps, all checkable against `session.ts` as it stands:

1. `inFlight` is written in exactly two places — `startCommit` line 83
   (`true`) and line 87 (`false`, the first statement of the backend `.then()`).
   `grep -n inFlight` confirms there is no third.
2. Lines 83–85 are straight-line synchronous code: `inFlight = true`,
   `committing = snapshot`, then `observable.publish({ …, persistence: { kind:
   'pending' } })`. Nothing in between can call back into the module, and
   `createObservableState.publish` assigns `state = nextState` *before* it
   notifies. So the window in which `inFlight` is true and the state is not yet
   `pending` spans two assignments and is unobservable to any caller.
3. While `inFlight` stays true, the only code that can run is a subscriber
   notified from inside that publication — the `.then()` sets `inFlight = false`
   before it publishes anything, so nothing it does counts.
4. Enumerate what such a subscriber can publish. `submit` line 149 publishes
   `{ ...getState(), working }`, which preserves `persistence`; it then cannot
   reach `startCommit`, because line 152 returns while `inFlight`. `retry`
   returns at 160 because `kind !== 'failed'` is true of `pending`.
   `acceptRemote` returns at 165 and `resolveConflict` at 177 for the same
   reason — the *first* disjunct. No reachable publication installs a kind other
   than `pending` while `inFlight` is true.
5. At most one commit is in flight: all four `startCommit` call sites are either
   guarded by `!inFlight` (`submit` 152→156, `retry` 160, `resolveConflict` 177)
   or run inside the `.then()` after `inFlight = false` (line 100). So step 4's
   enumeration is complete and `inFlight` cannot be re-set true underneath a
   pending `.then()`.
6. Therefore `kind === 'conflicted' && inFlight === true` — the fourth row of
   the baseline's truth table, the only row where the clause could matter — has
   no reachable entry state. In `A || B` with `A = kind !== 'conflicted'` and
   `B = inFlight`, `B` is true only when `A` already is, so `B` never decides.

Two corroborations, one of them the parent's hint:

- **`retry`'s identical clause is killed by its first disjunct, not by
  `inFlight`.** The baseline records all six of line 160's mutants dying,
  including `||` → `&&`, and reads that as `retry` being better covered than the
  other two. It is — but not on this point. The test that kills the `&&` mutant
  is `disables retry after permanent failure`, which calls `retry()` in the
  `rejected` state with **no commit in flight**: original `true || false` →
  return, mutated `true && false` → proceed. `inFlight` is `false` in the
  killing case. Line 160's clause is as dead as line 177's, and the baseline's
  contrast between them holds for the `'conflicted'`/`'failed'` half of the
  guard only.
- **Deleting either clause leaves the whole suite green.** As a temporary
  falsification (reverted, `git diff --exit-code` exit 0 both times), line 177
  was reduced to `if (state.persistence.kind !== 'conflicted') return;` and then
  line 160 to `if (state.persistence.kind !== 'failed') return;`, each followed
  by a full `pnpm exec vitest run`: `151 passed (151)` files, `1651 passed | 8
  skipped` both times. Absence of evidence rather than proof, but it is what a
  live clause would have disturbed across 1651 tests.

**What I did about it.** Nothing in the production code — removing it is outside
this ticket's scope — and no test that pretends the clause is live: the new
property never constructs a `conflicted && inFlight` entry state, because there
isn't one. The design question is recorded as
`.scratch/mutation-testing/issues/05-retire-the-unreachable-in-flight-guard-clause.md`
(`needs-triage`), covering both occurrences together.

**On removing `#99` and `#100` from the corpus rather than killing them.** The
baseline offered that as the honest alternative if the clause turned out dead,
and it is worth stating precisely what happened instead. Both mutants *were*
killed, and killed honestly: each rewrites the guard in a way that also breaks
the **reachable** part of it, so the test that kills them exercises a real
transition (`not conflicted, not in flight` → no-op) rather than the dead one.
`#99`'s `&&` and `#100`'s retained `inFlight` both stop the guard from refusing
in `settled`, `failed` and `rejected`, and that refusal is a rule the app
depends on. So removal is not required to keep the campaign honest — the corpus
did not need pruning, the guard did. What *is* true is that no mutant in this
corpus isolates the dead clause: Stryker generated no `inFlight` → `false`
mutant at `177:62`, so the redundancy was never directly reported, and the only
reason it surfaced at all is that `#99` forced someone to enumerate the truth
table. If ticket 05 deletes the clauses, `#99` and `#100` leave the corpus and
the mutant count drops; that is a cleaner end state than the present one, but it
is a code change, not an oracle change.

## Anything still surviving that the baseline called meaningful

**Nothing.** All six category-1 survivors — `#14`, `#15`, `#89`, `#98`, `#99`,
`#100` — are killed, each by the test written for it, confirmed through
`killedBy` in the JSON report rather than inferred from the count. The five
remaining survivors are the three the baseline classified as equivalent
(`#5`, `#104`, `#105`) and the two it classified as engine artefacts (`#0`,
`#1`), all left alive on purpose and re-argued above.

## Reproducing this

```
cd <repo root>
pnpm exec vitest run packages/persistence/test/session.test.ts   # 19 passed
pnpm mutate:session                                              # 93/98, 94.90%, ~36s
```

Same engine, config and machine as the baseline: `@stryker-mutator/core` 10.0.0,
`@stryker-mutator/vitest-runner` 10.0.0, vitest 2.1.9, Node v24.18.1, pnpm
9.15.0, darwin arm64. `stryker.conf.mjs` was not touched, so the mutant set and
the ids in the table above are the baseline's.

One caveat on determinism the baseline did not have to carry: the new property
uses fast-check with the repo's usual unseeded default, so the *inputs* differ
run to run. The kills do not depend on a lucky draw — three of the four entry
states and both operations kill `#98` and `#89`, and 100 runs make a draw that
misses them vanishingly unlikely — but a future campaign that wants
bit-identical per-test attribution should expect the property's counterexample
reporting, not its verdict, to vary.

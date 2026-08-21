# 06 — Adopt the assertion ratchet

**What to build:** Enable `@typescript-eslint/no-unsafe-type-assertion` as an error, record the existing findings in a committed ESLint suppressions baseline, and wire pruning into `verify` so the baseline can only shrink.

**Status:** resolved

**Why:** ADR 0062. The existing assertions were examined in a reviewed pass and stand on their `SAFETY:` comments; what has no gate today is the next one an agent writes, because a comment requirement is satisfied by prose. The baseline puts the gate on new code without contradicting the earlier review or paying for the hard tail.

Verified on the working tree at `f5506ce`, using this repository's ESLint 10.7:

- Generating a baseline covers all 79 findings across 39 file entries; exit 0.
- Re-running against it is clean.
- A new file containing a narrowing assertion fails.
- A ninth assertion in `render-adapter.ts`, which has eight suppressed, fails — and reports all nine, because a count-based baseline cannot tell which is new.

- [x] Add `'@typescript-eslint/no-unsafe-type-assertion': 'error'` to the type-aware block in `eslint.config.js`.
- [x] Generate the suppressions file with `--suppress-rule @typescript-eslint/no-unsafe-type-assertion` and commit it. Do not hand-edit it, then or ever.
- [x] Add `--prune-suppressions` to the `lint` invocation `verify` runs, so a removed assertion drops out permanently and the ceiling lowers on its own. Without this the file goes stale and the ratchet stops being one.
- [x] Decide where the suppressions file lives and whether `--suppressions-location` is needed; the default is repository root.
- [x] Confirm the interaction with `--max-warnings=0` and that an unpruned stale entry fails rather than passing quietly.
- [x] Leave `anti-slop/require-safety-comment-for-type-assertion` exactly as it is. The two rules do different jobs now — one demands a reason, the other caps the count — and weakening either to reduce overlap loses one of them.
- [x] Add a test that the baseline exists, is non-empty and is not hand-maintained, so a future change cannot quietly delete it and leave the rule looking enforced.
- [x] Build the fixture set that proves the ratchet bites, absorbed here from `.scratch/typing-skills/` issue 06 because it is a claim about the rule rather than about the skills. Small files, each embodying one construct, asserted against the real toolchain:
  - [x] **Must fail** — an explicit `any`; `as any`; `as unknown as T`; a new narrowing assertion; a production non-null assertion; a `@ts-ignore`; a missing union case. Name which of `tsc`, `eslint` or `oxlint` rejects each. A fixture that passes is a gap in enforcement and a finding.
  - [x] **Must pass** — `as const`; `as const satisfies Contract`; the broadening `as unknown` containment; `unknown` at a genuine parse boundary. A rule that rejects these is over-reaching, and this half is what catches it.
- [x] Keep the fixtures out of the ordinary programs — they are meant to fail — using the mechanism the repository already uses for files excluded from lint and typecheck, and confirm they do not leak into `verify`'s normal passes.
- [x] `pnpm verify` and report the real output.

**No longer blocked by issues 07–10.** Those were written when this ticket meant a 79-site cleanup. They are now opportunistic improvements, and this issue lands without them.

## Comments

Landed. The three pieces have to stay together — the rule as an error, the committed baseline, and `--prune-suppressions` in the lint `verify` runs — because deleting any one leaves the other two looking enforced.

**Counts.** 79 findings, matching the measurement exactly. The baseline covers them across **36** file entries, not the 39 the spec recorded at `f5506ce`; the tree moved between then and now.

**Location: repository root, the default.** No `--suppressions-location`. One less flag to keep in sync across `lint` and any future invocation, and root is where someone will trip over it.

### The behaviour, measured rather than assumed

| situation | exit | what happens |
| --- | --- | --- |
| clean re-run against the baseline | 0 | nothing reported |
| a narrowing assertion in a **new** file | 1 | reported normally; the baseline covers only listed paths |
| a **ninth** assertion in `render-adapter.ts`, which has eight suppressed | 1 | fails and reports **all nine** — a count-based baseline cannot tell which is new |
| a stale entry, **without** `--prune-suppressions` | 2 | *"There are suppressions left that do not occur anymore"* |
| a stale entry, **with** `--prune-suppressions` | 0 | count rewritten downward in place |

So `--max-warnings=0` and the baseline do not fight: a suppressed finding is not a warning, it is not reported at all, and an unsuppressed one is still an error.

**One consequence worth stating plainly.** With `--prune-suppressions` in `lint`, a stale baseline never *fails* — it is silently rewritten. The ceiling therefore falls when a human runs `verify` locally and commits the smaller file; in CI the rewrite is discarded and the run passes. That is the ratchet the ticket asked for and the right trade (failing on stale would fail every branch that deletes an assertion), but it means the file's accuracy depends on local runs, not CI.

### The fixtures

`tools/typing-fixtures/`, with a `README.md` stating that a passing `must-fail` fixture is a finding rather than a fixture to relax. `test/unit/typing-fixtures.test.ts` runs `tsc`, `eslint` and `oxlint` over them once each, concurrently, and asserts per fixture — 17 tests in ~2s.

| fixture | rejected by |
| --- | --- |
| `explicit-any.ts` | eslint `no-explicit-any` |
| `as-any.ts` | eslint `no-explicit-any`, `no-unsafe-type-assertion` |
| `chained-assertion.ts` | **oxlint** `anti-slop/no-chained-type-assertions` |
| `narrowing-assertion.ts` | eslint `no-unsafe-type-assertion` |
| `non-null-assertion.ts` | eslint `no-non-null-assertion` |
| `ts-ignore.ts` | eslint `ban-ts-comment` |
| `missing-union-case.ts` | **tsc** TS2366 *and* eslint `switch-exhaustiveness-check` |

`narrowing-assertion.ts` carries a real `SAFETY:` comment on purpose, so `require-safety-comment-for-type-assertion` says nothing about it. That is ADR 0062's argument made executable: until the ratchet went on, this file passed every gate the repository had.

The four `must-pass` fixtures — `as-const`, `as-const satisfies Contract`, the broadening `as unknown` containment, and `unknown` at a genuine parse boundary — are clean across all three tools. This half is what catches over-reach, and it earned its keep twice while being written: a first draft of the broadening fixture was genuinely redundant (`no-unnecessary-type-assertion` was right to flag it) and had to be rewritten so the assertion is load-bearing, pinning a generic to `unknown`.

**The fixture test is not a no-op.** Downgrading `no-unsafe-type-assertion` to `'off'` and re-running fails two of the seventeen, naming `as-any.ts` and `narrowing-assertion.ts`. Restored afterwards.

### Keeping them out of the ordinary passes

Excluded from ESLint, oxlint and Prettier the same way `tools/oxlint/anti-slop/**` is, and outside the root TypeScript program (which would otherwise report `missing-union-case.ts` as TS2366, so a leak would already be red in `verify`). The fixtures have their own `tsconfig.json`, extending `tsconfig.base.json` — a fixture proved against a laxer compiler proves nothing — which is also what gives ESLint's `projectService` the type information its type-aware rules need there.

Three tests pin the non-leakage: ESLint's `isPathIgnored` says yes for every `must-fail` file, `oxlint -c .oxlintrc.json` on the directory answers *"No files found to lint"*, and the root tsconfig's `include` names nothing under `tools`.

**A snag worth recording:** oxlint's `--no-ignore` disables `.eslintignore`-style files but **not** the config's own `ignorePatterns`, and every path inside an oxlint config resolves relative to that config's directory — so a derived config in `/tmp` fails to load the anti-slop plugin. The test therefore mints a derived config *beside* the real one for the length of the run, deletes it in a `finally`, gitignores it against a crash, and asserts afterwards that none is left behind. Copying the rule set instead would have drifted.

### The two rules still do two jobs

`anti-slop/require-safety-comment-for-type-assertion` is untouched. A test asserts it is neither missing from `.oxlintrc.json` nor turned off, so the overlap cannot be "reduced" by quietly dropping one.

### One thing the ratchet cost

The idiom `JSON.parse(...) as { ... }` with a `SAFETY:` comment — used by `test/unit/agent-skill-commands.test.ts` and others, and now in the baseline — is exactly what the rule bans for new code. Both new tests read their JSON with type predicates instead. That is the rule working, but it means writing this kind of test is now more work than it was, and the two files take the same three boundary exemptions `packages/persistence/src/http-protocol.ts` takes, recorded in `.oxlintrc.json` with that rationale.

`eslint-suppressions.json` is also in `.prettierignore`: ESLint rewrites it on every prune, so formatting it would be undone on the next run.

### Verification

`pnpm verify` — exit 0; 142 test files, 1481 passed, 8 skipped.

### Review follow-up

A read-only review found three real weaknesses here; all fixed in `1a-review`.

**"The rule is on as an error" was a text grep**, so a later `files: ['**/test/**']` override turning the rule off would have left it green — the file-scoped grandfathering ADR 0062 explicitly rejected, and one that would have removed most of the ratchet, since 23 of the 36 entries are test or e2e files. The fixtures could not have caught it either, since they live under `tools/`. It now resolves the real severity through `ESLint#calculateConfigForFile` for a production, a test, an e2e and a script file, using the idiom `test/unit/http-node-builtin-restrictions.test.ts` already uses. Adding that override now fails two tests.

**Nothing pinned the ceiling, and the documented regeneration command raises it.** `eslint . --suppress-rule …` *merges and overwrites with current counts*, so an agent that hits the rule, reads `docs/agents/anti-slop.md`, and runs the regeneration command silently re-baselines its own new assertion in — with `verify` green and all four ratchet tests passing. That is the ADR's own *negative to remember*, reached through the doc's instruction. There is now a ceiling of 79 across 36 files that only ever goes down, and the doc says outright not to regenerate to make a finding go away.

**The `must-pass` exemption was too broad.** Turning off three boundary rules for `must-pass/*.ts` meant those fixtures could not detect exactly the rules that were off — the one job that half has. Scoped to `unknown-at-parse-boundary.ts`, the only fixture that needs it; the other three now face every rule. Both the README and `docs/agents/anti-slop.md` state the limit rather than claiming the half is unqualified.

**One ADR sentence was factually wrong.** It said a one-for-one assertion swap in the same file "passes silently until the next prune". Pruning only fires when the count *falls*; a swap leaves it equal, so the swap is invisible permanently. Corrected — it was in the accepted-costs section, which is where a reader judges how much the ratchet guarantees.

Also: `is outside the root TypeScript program` was renamed to what it checks (the spelling of `include`, not program membership), and `expect(script('verify')).toContain('pnpm lint ')` no longer leans on `lint` not being verify's last step.

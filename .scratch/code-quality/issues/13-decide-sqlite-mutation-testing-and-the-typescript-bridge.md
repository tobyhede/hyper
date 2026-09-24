# 13: Decide on SQLite, mutation testing and the TypeScript 6 bridge

**What to build:** A decision, for each of three costs the prototype currently carries, on whether it still earns its place: the SQLite backend beside PostgreSQL and memory, the StrykerJS mutation testing setup, and the TypeScript 6 compatibility bridge. Each is kept (and the reason recorded) or scheduled for removal (and follow-up tickets filed).

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [ ] For each: what it costs (CI jobs and time, code, config) and what it has caught or enabled, with evidence
- [ ] Each has a recorded decision. A removal comes with an ADR superseding the one that adopted it, and a removal ticket

## Evidence (gathered 2026-09-24 on `origin/main` at `bde05042`)

Method, for all three. Line counts are `wc -l` over `git ls-files`. Commit counts are non-merge commits from `git log --since='60 days ago'`, over the files each one owns. CI durations come from `gh run view --json jobs` for the four most recent `main` pushes that ran the full job set (35842244758, 35819137742, 35818821984, 35802570528). The other recent `main` runs reused PR CI and ran no jobs. Transitive dependency counts are computed over `pnpm-lock.yaml`'s snapshot graph: *exclusive* means packages reachable only through that thing's root dependencies. Installed-package facts were read from the main checkout's `node_modules`, which resolves the same versions as this lockfile. Registry facts come from `pnpm view` on the date above. No test suite, typecheck or campaign was run to gather any of this.

The three sections are independent. Each ends with its own decision line.

### 1. The SQLite backend

**Cost**

- **Code it owns.** 44 tracked files outside `.scratch`.
  - Hand-written source: about 620 lines. `src/sqlite/` holds `sql-store.ts` (262), `db.ts` (152), `composition.ts` (49), `serialise.ts` (36), `target.ts` (27) and `contract.prisma` (34). Also `src/cli/sqlite-entry.ts`, `src/http/sqlite-http-runtime.ts` and `scripts/dev-sqlite.ts`.
  - Generated contract: `src/sqlite/contract.json` and `src/sqlite/contract.d.ts`, about 940 lines.
  - Migrations: `migrations-sqlite/`, 12 files and 3,385 lines, mostly generated.
  - Tests: 2,801 lines. The largest are `sqlite-space-repository` (831), `sqlite-contention` (506), `sqlite-hyper-cli` (379), `sqlite-http-runtime` (349) and the `sqlite-persistence` e2e spec (182). There are four unit tests and three support modules.
  - Config: `vitest.sqlite.config.ts`, `playwright.sqlite.config.ts`, `prisma-next.config.sqlite.ts` and `packages/app/vite.sqlite.config.ts`.
  - Seven root scripts: `contract:emit:sqlite`, `contract:check:sqlite`, `db:migrate:sqlite`, `hyper:sqlite`, `e2e:sqlite`, `test:integration:sqlite` and `dev:sqlite`. There is also one app script.
  - 22 further shared files name SQLite. They include `src/persistence/sql-store.ts`, `sql-space-repository.ts`, `test/support/repository-contract.ts`, the `database-*` integration arms, `restart-proof.ts`, `packages/persistence/src/read-order.ts` and `repository.ts`, and `current-domain-vocabulary.test.ts`.
- **CI.** SQLite has one job of its own, `sqlite`, which is also a required input to `CI passed`.
  - Duration: 247s, 222s, 241s and 245s in the four full runs. Of that, the integration suite is 193s and 197s in the two runs broken down by step. The `postgres` job takes 88–95s, and its suite 27–29s.
  - Critical path: `sqlite` was the longest job in 3 of the 4 runs. The run wall clocks were 268s and 265s. The next-longest job was an e2e shard at 199–234s, so removing the job would save roughly 10–45s of wall clock per run. It would also free about 240s of runner time.
  - The suite runs with `fileParallelism: false`. `sqlite-contention.test.ts` exercises the driver's 5,000ms busy timeout, which likely accounts for much of the gap to PostgreSQL. That is an inference and was not measured here.
- **Dependencies.** Two direct dependencies, `@prisma-next/sqlite` and `@prisma-next/adapter-sqlite` (both 0.16.0). Their closure is 118 packages, of which only 4 are exclusive, because the rest are shared with the PostgreSQL stack.
- **Churn.** 44 commits in 60 days touched SQLite-owned files, and all of them fall in the last 14 days: the first SQLite source commit is `ee47004e` on 2026-09-16. 20 of the 44 came after ADR 0095 landed (2026-09-20 onward). 46 commit messages in 60 days mention SQLite. Across the whole repository there were 1,328 commits in the same window.

**Value**

- **Consumers.** Nothing outside development and tests uses it. The only non-test entry points are the opt-in `pnpm dev:sqlite` (port 5177) and `pnpm hyper:sqlite` CLI. PostgreSQL is the default. AGENTS.md says the repository has "no production, no release, no users". The research note (`.scratch/database-persistence/sqlite-target-research.md`, 2026-08-02) scopes SQLite as an "opt-in, local, single-host server database". I found no ticket, ADR or PRD that states a product need for it, beyond it being a viable target.
- **Defects it surfaced.**
  - Ticket 27, "broken stored state has two error identities". Its "Surfaced by" line credits a tightened assertion during the SQLite truncation fix (ticket 17). The defect could only arise on SQLite, because PostgreSQL's `jsonb` column cannot hold non-JSON text.
  - Ticket 18 established that SQLite's contention behaviour (file lock, BUSY/LOCKED) needs its own classification. That is a cost SQLite created, not a defect it found in shared code.
- **What it enabled.** Adding a second SQL database is what produced ADR 0095. The two adapters had drifted: PostgreSQL retried the Meta lock and re-checked revisions inside `replaceAggregate`, and SQLite did neither. The measurement showed that about 350 of roughly 443 lines were duplicated, and the result is the one `SqlSpaceRepository` over a `SqlStore` value. ADR 0095 also moved Revisions to canonical decimal TEXT on both databases. That removed an `eslint-suppressions.json` entry, although it was needed only because SQLite's driver could not read 64-bit integers.
- **Defects it did not find.** The later shared-code defect tickets (29, 37, 38, 42) name a CodeRabbit review, ticket 31's implementation or an audit as their source, not the SQLite arm. For ticket 42, SQLite was checked and needed no change.

**What removal would involve**

- Delete the 44 owned files, the 2 dependencies, the `sqlite` CI job and its `CI passed` input, the 7 root scripts and 1 app script, and the SQLite arms of the `database-*` tests.
- Update the vocabulary, CI-pin and read-order tests.
- Supersede ADR 0095, and amend ADR 0078 and ADR 0096's "two repositories" wording.
- Decide whether `SqlStore`/`SqlTables` then collapse into PostgreSQL. With one implementation, they become the single-adapter port AGENTS.md says not to manufacture.
- The five `.scratch/database-persistence` SQLite tickets stay as history.
- Rough scope: one to two tickets. The second only applies if the `SqlStore` seam is folded back into the repository.

**What would be lost**

- A persistent runtime that needs no Docker. `dev:sqlite` and `e2e:sqlite` run on a file.
- A second dialect behind `SqlStore`, which is the pressure that keeps the repository database-neutral.
- The contention and closed-client classification work, tickets 18 and 38's SQLite half.

A middle option exists: keep SQLite but cut the integration suite's time, for example by running the busy-timeout matrix in fewer cases or in parallel. That would remove it from the CI critical path without deleting it. This is not costed here.

**Recommendation (recommendation only; the decision is the human's).** Remove it, at medium confidence. It has no consumer and no stated product need, and it is the slowest CI job. The one thing it demonstrably forced, ADR 0095's single SQL repository, is already built and would survive the removal. Confidence is only medium because removal re-opens ADR 0095's shape, and because a no-Docker persistent runtime has real value if it is wanted.

**The single fact to decide on:** is a file-backed, no-Docker, single-host deployment a planned product target? If not, SQLite is about 240s of CI runner time per push (the longest job in 3 of 4 recent runs) and 44 commits in its first 14 days, with no consumer.

Decision:

### 2. StrykerJS mutation testing

**Cost**

- **Code and config.**
  - `stryker.conf.mjs` (155 lines) and two root scripts, `mutate:session` and `mutate:graph`.
  - Ignore entries in `.gitignore`, `.prettierignore`, `.oxlintrc.json` and `eslint.config.js`, where `.stryker-tmp/**` stops a crashed campaign's repo copy breaking `pnpm verify`.
  - One bullet in `docs/agents/build-tooling.md` and one Commands entry in AGENTS.md.
  - `.scratch/mutation-testing/` holds 2,866 lines of research and ticket records.
  - There is no source code and no test.
- **CI.** None. It is not in `verify`, has no CI job and has `thresholds.break: null`.
- **Dependencies.** Three devDependencies: `@stryker-mutator/core`, `api` and `vitest-runner`, all 10.0.0. Their closure is 368 packages, of which 110 are exclusive to Stryker. That makes Stryker the largest exclusive dependency tree of the three things evaluated here.
- **Churn.** 4 commits to `stryker.conf.mjs` in 60 days: three on 2026-08-22, when it was introduced and reviewed, and one mechanical rename on 2026-09-17. Nothing under `.scratch/mutation-testing/` has changed since 2026-08-22.

**Value**

- **Both campaigns found real gaps** (2026-08-22).
  - `SpaceSession`: 98 mutants, 11 survivors. Six category-1 survivors were closed by two new tests (issue 03), and the run surfaced a dead `|| inFlight` clause (issue 05).
  - Graph-intake control on `packages/graph/src/space.ts`: 148 mutants. It found that neither `loadSpace` nor `loadSpaceSnapshot` is proved to refuse `null` or other non-object input: 8 mutants survived the whole suite. It also found two smaller unproved rules (issue 06).
  - `graph-control-and-adoption.md` records the outcome as **ADOPT** as a local, ungated command.
- **Use since then.** There is no git evidence of any campaign after 2026-08-22. Campaign output goes to the gitignored `/reports/`, so a local run would leave no trace, and this is absence of evidence, not proof. No later ticket or commit message cites a Stryker run. Later commits that mention "mutations" (`8549b0c2`, `2358e505`) describe hand-applied mutations.
- **Follow-ups not taken up.** Issues 05 and 06 have been `needs-triage` for a month. `.scratch/v1-release/definition-of-done.md` lists "Mutation-testing follow-ups" among the post-V1 engineering initiatives.
- **Whether it still runs.** Both campaigns' named source and test files still exist, so the scripts are not stale. No campaign was run here.

**What removal would involve.** Delete the config, the two scripts, the three devDependencies (and with them 110 lockfile packages) and the four ignore entries, and edit the two doc passages. Issues 05 and 06 stand on their own evidence and do not need Stryker to be worked. Rough scope: one small ticket. Since ADR 0052 and ADR 0062 do not govern it, the adoption record in `.scratch/mutation-testing/` may be enough and no ADR may need superseding. Whether that record needs a superseding ADR is a judgement for the human.

**What would be lost.** A proven way to find where an oracle is weak, on demand, in 17–37s per campaign. Re-adding it later would take a fresh sandbox setup: the `.claude/**` and `.worktrees/**` ignore patterns and the `.stryker-tmp` ignores were all found by trial.

**Recommendation (recommendation only; the decision is the human's).** Keep it, at medium confidence. It costs nothing in CI or `verify` and changes almost never, and both of its runs found real untested rules. The real cost is 110 exclusive lockfile packages and four ignore entries. The case for removal is that it has not visibly been used since adoption and its own findings sit untriaged. If nobody plans to run it, remove it rather than carry it.

**The single fact to decide on:** it has not visibly been run since 2026-08-22, and its two findings tickets (05, 06) are still `needs-triage`. Its value depends entirely on someone running it deliberately, because nothing runs it automatically.

Decision:

### 3. The TypeScript 6 compatibility bridge beside TypeScript 7

**Cost**

- **Code.** `scripts/check-typescript-toolchain.ts` (343 lines) and `test/unit/check-typescript-toolchain.test.ts` (335 lines). Only part of this is the bridge. The bridge is `judgeBridge` and `readBridge`, about 45 lines, plus their tests. The rest, which asserts that `tsc` is 7 or higher in every workspace, is permanent under ADR 0061 even after the bridge goes.
- **Package aliases.** The two aliases in `package.json`, with `typescript` pointing at `npm:@typescript/typescript6@6.0.2`, cause 386 `typescript6` mentions in `pnpm-lock.yaml`.
- **Documentation.** ADR 0061, and paragraphs in AGENTS.md.
- **Not a bridge cost.** The `@ladle/react` patch in `patches/` is a TypeScript 7 cost, not a bridge cost. ADR 0061 gives it its own removal condition.
- **CI.** About 3s: `typecheck:toolchain`, per the timing comment in `ci.yml`.
- **Dependencies.** One package, `@typescript/typescript6`. It has no exclusive transitive dependencies because it is self-contained.
- **Churn.** 7 commits in 60 days. Five fell on 2026-08-21, the introduction and its reviews. The other two were a CI split on 2026-09-03 and a rename on 2026-09-20.
- **Cognitive cost.** `typescript` means version 6, and AGENTS.md and ADR 0061 each spend a paragraph warning agents not to "fix" it.

**Value.** The bridge is what lets typed linting run while `tsc` is TypeScript 7. `typescript-eslint`'s `strictTypeChecked` and `stylisticTypeChecked`, and ADR 0062's `no-unsafe-type-assertion` ratchet, all need a program built through the old `createProgram` API. Removing the bridge alone therefore means choosing one of two other losses:

- (a) Go back to TypeScript 6 as `tsc`. This loses TypeScript 7's speed; `typecheck` plus `typecheck:packages` currently take about 9s on CI, and the TypeScript 6 time was not measured here.
- (b) Drop typed linting. This loses the enforcement half of ADR 0062.

The toolchain assertion itself has no recorded catch in git history. That is expected for a tripwire.

**The ADR's removal condition, clause by clause**

1. *A stable TypeScript release exposes the replacement compiler API.* **Does not hold.** `typescript@latest` is 7.0.2, which is what is installed. Its `exports` offers the programmatic API only under `./unstable/sync`, `./unstable/async`, `./unstable/ast` and similar paths, and its `.` entry is `./lib/version.cjs`. `next` is `7.1.0-dev.20260924.1`.
2. *`typescript-eslint` supports that major version.* **Does not hold.** `typescript-eslint@latest` is 8.70.1, and `@typescript-eslint/typescript-estree@canary` is 8.70.2-alpha.7. Both declare `peerDependencies.typescript: ">=4.8.4 <6.1.0"`. The installed version, 8.65.0, has the same range, and no 9.x appears in the published versions.
3. *This repository's other programmatic consumers support it.* **Holds, as far as can be checked.**
   - `prisma-next` and every `@prisma-next/*` package at 0.16.0 declare `typescript: ">=5.9"`, which 7 satisfies. Their installed `dist` contains no `import`/`require` of `typescript`; the only string hits are Prettier's `parser: "typescript"` and a telemetry read of the `deps` map. So ADR 0061 and AGENTS.md are wrong to name `prisma-next` as a consumer of the TypeScript 6 `createProgram` API. Only `typescript-eslint` (with `ts-api-utils`) needs it.
   - `msw` and `tsconfck` peer on `typescript` only optionally.
   - No repository source outside `scripts/check-typescript-toolchain.ts` imports `typescript`.
4. *`pnpm verify` passes with `typescript` pointing at 7 or above.* **Not tested**, per this ticket's load constraint. It cannot pass while clause 2 fails, because typed lint would run against an API it does not support.

**What removal would involve, once the conditions hold.** Point `typescript` at 7, delete the `@typescript/typescript7` alias, `judgeBridge`/`readBridge` and their tests, and narrow the assertion to "`tsc` is 7 or above". Rewrite ADR 0061's as-built section and the AGENTS.md paragraphs. Rough scope: one small ticket, blocked on upstream. Removing it now means choosing (a) or (b) above, and each of those would be a separate ADR.

**Recommendation (recommendation only; the decision is the human's).** Keep it, at high confidence. It cannot be removed on its own terms today, because clauses 1 and 2 fail upstream. Its running cost is about 3s of CI and one self-contained package, and the alternatives trade away either TypeScript 7 or typed linting. One follow-up worth filing: correct ADR 0061 and AGENTS.md so they no longer name `prisma-next` as a TypeScript 6 API consumer. `typescript-eslint` is the only thing still holding the bridge in place.

**The single fact to decide on:** as of 2026-09-24, both `typescript-eslint@latest` (8.70.1) and its canary peer on `typescript <6.1.0`, and TypeScript 7.0.2 exposes its API only under `unstable/*`. The removal condition is blocked upstream on two independent clauses.

Decision:

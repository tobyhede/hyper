# 12 — The PostgreSQL integration suite races itself

**What to build:** Stop the three integration test files from running concurrently against one database, so truncation in one file cannot delete rows another file is asserting on.

**Blocks:** 10 — PostgreSQL integration in CI. A gate that fails roughly a third of the time gates nothing.

**Status:** ready-for-agent

**The defect:** `vitest.integration.config.ts` sets no `fileParallelism`, so Vitest runs `postgres-space-repository.test.ts`, `hyper-cli.test.ts` and `prisma-postgres.test.ts` in parallel worker threads — all against the single database named by `DATABASE_URL`. `PostgresSpaceRepository`'s truncate-mode test exercises `truncateHyperContent`, which deletes **every** space and card rather than only its own fixtures, and the CLI suite exercises `--dangerous-truncate` through the real command. Either can wipe rows a concurrently running file just inserted.

Observed on 2026-07-30, both failures intermittent and in different files across runs:

```
FAIL test/integration/hyper-cli.test.ts > imports through the real command and durably reports the stored space
AssertionError: expected undefined to be 0n     // loadSpace found nothing; a concurrent truncate had deleted it

FAIL test/integration/postgres-space-repository.test.ts > replaces every stored space and card in truncate mode
```

Measured rate on the batch-import branch: 5 passes / 2 failures with local changes, 2 passes / 1 failure on a clean tree. Pre-existing, and independent of the UUID-minting change made the same day.

- [ ] The three integration files no longer run concurrently against one database. `fileParallelism: false` in `vitest.integration.config.ts` is the smallest fix; a database-per-worker via `VITEST_WORKER_ID` is the alternative if the suite grows enough for serial execution to hurt.
- [ ] Whichever is chosen, a comment records *why* — truncation is global by design (ADR 0030's `--dangerous-truncate` deletes all Hyper content), so no amount of per-test fixture cleanup can make these files safe to interleave.
- [ ] The suite passes 10 consecutive runs. A single green run does not evidence a fix for a defect that already passes two runs in three.
- [ ] Issue `10`'s CI gate is written against the corrected configuration.

## Comments

Not a cleanup-tracking problem. CodeRabbit's review of the batch-import branch flagged untracked imports in `postgres-space-repository.test.ts`; that finding was checked and is not the cause — the one untracked import uses `CONCURRENT_SPACE_ID`, which `afterEach` deletes explicitly. The races are cross-file, not cross-test.

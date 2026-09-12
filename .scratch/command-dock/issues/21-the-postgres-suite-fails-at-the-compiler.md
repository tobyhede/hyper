# 21 — Removing a persistence field fails at the compiler, not only in CI

Status: ready-for-agent
Tags: release/v1
Blocked by: nothing.

**What to build:** deleting a field from a persistence type is a local typecheck
error, rather than a green `pnpm verify` and a red `postgres` job half an hour
later.

## Why, from the case that happened

`13` removed `initialization` from `LoadedSpace` end to end. `pnpm verify`
passed, `pnpm e2e` passed, and CI's `postgres` job failed on
`test/integration/postgres-space-repository.test.ts` still asserting the field.

The interesting part is that this was **not** a scoping gap of the kind
`AGENTS.md` already warns about for `test/e2e/`. `test/integration` is in the
root program's `include`, so `tsc` did read the file. It said nothing because
the assertion is `toMatchObject`, whose expected value is typed loosely enough
that a key the received type no longer has is not an error. The compiler was
looking straight at the stale field and had no reason to object.

So the guard to add is not another command to remember to run — it is binding
these contract assertions to the types they are about, so the received type is
what decides which keys the expected object may name.

Scope it to the assertions that describe a persistence contract. This is not a
repo-wide campaign against `toMatchObject`, which is the right matcher in plenty
of places; it is the handful of places where the whole point of the assertion is
that a stored shape has not drifted.

- [ ] Naming a field the asserted type does not have is a typecheck error in the
      PostgreSQL integration suite
- [ ] Demonstrated rather than asserted: removing a field from the type and
      running `pnpm typecheck` reports it, with the evidence in the ticket
- [ ] `pnpm verify` green. The suite itself needs a database — run
      `pnpm test:integration:postgres` with PostgreSQL up, and stop it afterwards

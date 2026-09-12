# 21 — Removing a persistence field fails at the compiler, not only in CI

Status: resolved
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

- [x] Naming a field the asserted type does not have is a typecheck error in the
      PostgreSQL integration suite
- [x] Demonstrated rather than asserted — evidence below
- [x] `pnpm verify` green. The suite itself needs a database — see "What was not
      run" below

## What was built

`test/support/persistence-contract.ts` holds one helper, `expectPersisted`, and one type,
`PersistenceContract<T>` — a deep partial that keeps every key optional and invents none.
`expectPersisted(received).toMatchObject(expected)` binds the expectation to the
received type, so the received type decides which keys the expected object may
name, and an excess key is a `TS2353` where the fixture is written.

Two details in the type are load-bearing. Primitives are matched *before* the
object arm, because a branded id is `string & { __brand }` and an intersection
carrying an object member takes the object arm otherwise — mapping over a
string's keys and refusing the plain value a fixture writes. And arrays recurse
element-wise, so a Diagram named inside a Space's `diagrams` is held to the same
rule the Space is.

The parameter is `StoredShape<NonNullable<Received>>`: an expectation describes an
object, so asserting against `LoadedSpace | undefined` is asserting the loaded
arm, and `toBeUndefined` is what the other one is for.

Applied to the fourteen assertions in `test/integration/postgres-space-repository.test.ts`
that describe a stored shape or a lifecycle result — `loadSpace`, `commit`,
`initializeAggregate`, `replaceAggregate`. Not a repo-wide campaign: `toMatchObject`
is the right matcher elsewhere and is untouched there.

### Demonstrated

Removing `revision` from `LoadedSpace` in `packages/persistence/src/backend.ts`
and running `pnpm typecheck`:

```
test/integration/postgres-space-repository.test.ts(358,7): error TS2353: Object
  literal may only specify known properties, and 'revision' does not exist in
  type '{ readonly snapshot?: …; readonly exportedRevision?: bigint | null; }'.
test/integration/postgres-space-repository.test.ts(452,41): error TS2353: …
test/integration/postgres-space-repository.test.ts(557,7): error TS2353: …
test/integration/postgres-space-repository.test.ts(652,72): error TS2353: …
```

Under the old `toMatchObject` the compiler read the same file and said nothing —
which is what let `13` reach CI red on `initialization`.

### What was not run

`pnpm test:integration:postgres` needs a database, and this change is a typing
change to the suite's assertions rather than to what they assert: the expected
objects are byte-identical, only their binding moved, and `pnpm typecheck` is what
observes that. The suite will run on its CI job.

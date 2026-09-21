# 32 — `#loadStoredSpaceRow` parses a stored row twice

Status: resolved
Tags: Defect
Blocked by: None.

Surfaced by: a second review pass of the one-SQL-repository branch (ADR 0095, tickets 22-24), M9 (2026-09-20). The double parse predates that branch; the ticket is new because nobody had named it.

## The defect

`#loadStoredSpaceRow` (`src/persistence/sql-space-repository.ts`) parses a stored Space's document and each stored Resource's document twice before building a `SpaceSnapshot`:

```ts
const snapshot = parseSnapshot({
  id: stored.id,
  document: spaceDocumentSchema.parse(this.#store.readDocument(stored.document)),
  resources: stored.resources.map((resource) => ({
    id: resource.id,
    document: resourceDocumentSchema.parse(this.#store.readDocument(resource.document)),
  })),
});
```

`parseSnapshot` calls `@project/graph`'s `loadSpaceSnapshot`, which runs `spaceSnapshotSchema.safeParse(input)` over the whole object — and `spaceSnapshotSchema` (`packages/core/src/schema.ts`) is `{ id: uuidSchema, document: spaceDocumentSchema, resources: z.array(z.object({ id: uuidSchema, document: resourceDocumentSchema })) }`, the identical schemas already run over the identical values one line above. So every read through `#loadStoredSpaceRow` validates each stored document against `spaceDocumentSchema`/`resourceDocumentSchema` twice: once directly, once again as part of `spaceSnapshotSchema`'s own parse inside `loadSpaceSnapshot`.

This is against ADR 0010's one-intake principle for a Space value and `docs/agents/anti-slop.md`'s "parse external representations once at their I/O boundary" rule — `loadSpaceSnapshot` is the one intake for a `SpaceSnapshot`, and the pre-parse duplicates part of it rather than feeding it raw `unknown` data (which the pre-parse's own result is then re-fed into, since `parseSnapshot(input: unknown)` accepts anything).

## Not new to this branch

The identical shape exists on `main` (pre-ADR-0095), in both deleted adapters, and it already ran *inside the commit transaction* there too — the fast path's candidate read already called `loadStoredSpace`/`parseSnapshot` before this branch existed:

- `git show main:src/persistence/postgres-space-repository.ts` — `loadStoredSpace` (its own `spaceDocumentSchema.parse`/`thingDocumentSchema.parse` immediately followed by `parseSnapshot`) is called from `commitTopologyPreservingUpdate`, itself called from `#commitInTransaction` inside `this.#database.transaction(...)`.
- `git show main:src/persistence/sqlite-space-repository.ts` — the same shape, same call chain.

So "now also runs inside the commit transaction" is not an accurate description of what changed on this branch — it always ran there. What ADR 0095 changed is that there is now one copy of this pattern instead of two.

## Why it might matter, and why it might not

- It is real duplicate work on every read of a stored row (`loadSpace`, `listSpaces`'s title-only read does **not** hit this path, but every `loadAggregate`/`commit`/`initializeAggregate`/`replaceAggregate` read of one named Space does), inside a transaction on the commit paths.
- It is not currently a correctness bug: both parses run the same schemas over the same already-valid data, so they agree. A defect would only show up if the two schemas were ever allowed to drift (e.g. one call site updated for a field rename and the other missed) — which is exactly the risk "parse once" guards against, not a currently observed failure.
- Removing the pre-parse would mean passing `{ id: stored.id, document: this.#store.readDocument(stored.document), resources: stored.resources.map(...) }` (raw `unknown` values) straight into `parseSnapshot`, relying entirely on `loadSpaceSnapshot`'s own `spaceSnapshotSchema.safeParse` to validate. That looks safe on inspection — `parseSnapshot`'s parameter type is already `unknown` — but confirming it needs checking every caller's expectations (in particular whether anything downstream relied on the narrower `SnapshotValidationError`-only failure mode the direct `.parse()` calls currently produce as a raw `ZodError` for a caller that does not go through `parseSnapshot` — none currently do, but this needs verifying, not assuming) and a full `pnpm verify`/`pnpm test:integration:*` run.

## Scope

Left unfixed on the one-SQL-repository branch's review pass: it predates the branch, isn't behavioural on the branch's own diff, and removing it is a small but distinct piece of work needing its own verification pass rather than a drive-by edit inside an unrelated review.

## Acceptance (draft, for whoever picks this up)

- [x] Decide whether `#loadStoredSpaceRow` should stop pre-parsing with `spaceDocumentSchema`/`resourceDocumentSchema` and rely on `parseSnapshot`/`loadSpaceSnapshot` alone.
- [x] If so, remove the pre-parse, confirm no caller depended on the narrower failure mode the direct `.parse()` calls produced, and run `pnpm verify`, `pnpm test:integration:sqlite`, `pnpm test:integration:postgres`. Run by CI on PR #259 (run 35562558942, head `a77bc662`): `static-checks`, `coverage`, `sqlite` and `postgres` all green.
- [x] ~~If not~~ — not applicable: the pre-parse is removed (see Answer). (e.g. the pre-parse is found to serve a purpose beyond validation, such as narrowing `unknown` for a type downstream needs), record why here instead.

## Answer

Implemented 2026-09-21, on top of ticket 31 (`afd61774`), which had already moved the pre-parse into the pure `#decodeStoredSpaceRow`.

**Decision: the pre-parse goes.** `#decodeStoredSpaceRow` (`src/persistence/sql-space-repository.ts`) now hands `readDocument`'s raw values straight to `parseSnapshot`, the shape `#loadEverySpace` already had, so `loadSpaceSnapshot`'s `spaceSnapshotSchema.safeParse` is the one schema intake for a stored row on every read. It served no purpose beyond validation: `parseSnapshot` takes `unknown`, so nothing downstream needed the narrowed type. `resourceDocumentSchema` became unused in that module and its import is gone; `spaceDocumentSchema` stays for `listSpaces`'s title-only read, which parses once and is not part of this defect. The `#loadStoredSpaceRowForCommit` comment no longer lists a schema's `ZodError` among the decode's causes.

**What a schema-invalid stored document now raises:** the private `SnapshotValidationError` in place of `ZodError`. Checked, not assumed, that nothing depended on the old shape:

- `grep -rln ZodError test packages/*/src packages/*/test src` finds only the comment edited above — no test or caller names `ZodError`.
- `loadSpace`'s callers are `resolveProductDestination` (`packages/http/src/product-destination.ts`) and `openDatabaseSelection` (`src/startup/database-startup.ts`); neither inspects the error's type. `classifyStoredFailure` and `#naming` read `AggregateInvariantError`, `PersistenceUnavailableError` and the driver's `SqlConnectionError` only, so both errors are `unclassified` from `loadSpace`.
- On the commit path, `#loadStoredSpaceRowForCommit` wraps every decode failure in `AggregateInvariantError` by position, so the classification is the same whichever error the decode raises.

**Oracle.** No new test: the contract row "names a broken stored document broken stored state on the single-Space fast path, and leaves loadSpace's answer narrower" (`test/support/repository-contract.ts`) arranges exactly a schema-invalid stored Space document (`{ version: 1 }`, no title) and pins both observable answers — `loadSpace` rejects, and not as `AggregateInvariantError`; the fast-path commit rejects with `AggregateInvariantError`.

**Run:** `pnpm exec vitest run --config vitest.sqlite.config.ts test/integration/sqlite-space-repository.test.ts` against a freshly migrated scratch `SQLITE_PATH` — 65/65 passed, that row included. `pnpm typecheck`, `pnpm lint` and `pnpm format:check` passed. `pnpm verify`, the full `pnpm test:integration:sqlite` and `pnpm test:integration:postgres` were not run locally; CI ran them on PR #259 (run 35562558942, head `a77bc662`) green, which closed the second acceptance box and resolved the ticket.

## Comments

**Audit, 2026-09-21.** Read against `d456b00c`; moved to `ready-for-agent`.

- The double parse is still at `src/persistence/sql-space-repository.ts:265-276`. The vocabulary above is corrected, except in the quotation of the deleted pre-ADR-0095 adapters, from `Thing`/`thingDocumentSchema` to `Resource`/`resourceDocumentSchema`; `spaceSnapshotSchema`'s array field is `resources`.
- **"Why it might matter" overstates the reach.** `loadAggregate`, `initializeAggregate` and `replaceAggregate` read through `#loadEverySpace` (`:606-625`), which already parses once — it feeds `readDocument`'s raw values straight into `parseSnapshot`. The double parse reaches only `loadSpace` and the two commit-path reads through `#loadStoredSpaceRowForCommit` (the fast-path candidate read and the post-conflict reload). `#loadEverySpace` is the shape to copy.
- **The open question in the acceptance is answered.** The one test that pins this path's failure, `test/support/repository-contract.ts`'s "leaves a broken stored document unclassified on the single-Space fast path", asserts only `rejects.not.toBeInstanceOf(AggregateInvariantError)`. Replacing the pre-parse's `ZodError` with `parseSnapshot`'s `SnapshotValidationError` keeps it true.
- **Order against ticket 31.** That same row is ticket 31's third case. Decide its classification in 31 first; this ticket then changes only which unclassified error is thrown, or lands with 31's classification if 31 settles first.

# 32 — `#loadStoredSpaceRow` parses a stored row twice

Status: needs-triage
Tags: Defect
Blocked by: None.

Surfaced by: a second review pass of the one-SQL-repository branch (ADR 0095, tickets 22-24), M9 (2026-09-20). The double parse predates that branch; the ticket is new because nobody had named it.

## The defect

`#loadStoredSpaceRow` (`src/persistence/sql-space-repository.ts`) parses a stored Space's document and each stored Thing's document twice before building a `SpaceSnapshot`:

```ts
const snapshot = parseSnapshot({
  id: stored.id,
  document: spaceDocumentSchema.parse(this.#store.readDocument(stored.document)),
  things: stored.things.map((thing) => ({
    id: thing.id,
    document: thingDocumentSchema.parse(this.#store.readDocument(thing.document)),
  })),
});
```

`parseSnapshot` calls `@project/graph`'s `loadSpaceSnapshot`, which runs `spaceSnapshotSchema.safeParse(input)` over the whole object — and `spaceSnapshotSchema` (`packages/core/src/schema.ts`) is `{ id: uuidSchema, document: spaceDocumentSchema, things: z.array(z.object({ id: uuidSchema, document: thingDocumentSchema })) }`, the identical schemas already run over the identical values one line above. So every read through `#loadStoredSpaceRow` validates each stored document against `spaceDocumentSchema`/`thingDocumentSchema` twice: once directly, once again as part of `spaceSnapshotSchema`'s own parse inside `loadSpaceSnapshot`.

This is against ADR 0010's one-intake principle for a Space value and `docs/agents/anti-slop.md`'s "parse external representations once at their I/O boundary" rule — `loadSpaceSnapshot` is the one intake for a `SpaceSnapshot`, and the pre-parse duplicates part of it rather than feeding it raw `unknown` data (which the pre-parse's own result is then re-fed into, since `parseSnapshot(input: unknown)` accepts anything).

## Not new to this branch

The identical shape exists on `main` (pre-ADR-0095), in both deleted adapters, and it already ran *inside the commit transaction* there too — the fast path's candidate read already called `loadStoredSpace`/`parseSnapshot` before this branch existed:

- `git show main:src/persistence/postgres-space-repository.ts` — `loadStoredSpace` (its own `spaceDocumentSchema.parse`/`thingDocumentSchema.parse` immediately followed by `parseSnapshot`) is called from `commitTopologyPreservingUpdate`, itself called from `#commitInTransaction` inside `this.#database.transaction(...)`.
- `git show main:src/persistence/sqlite-space-repository.ts` — the same shape, same call chain.

So "now also runs inside the commit transaction" is not an accurate description of what changed on this branch — it always ran there. What ADR 0095 changed is that there is now one copy of this pattern instead of two.

## Why it might matter, and why it might not

- It is real duplicate work on every read of a stored row (`loadSpace`, `listSpaces`'s title-only read does **not** hit this path, but every `loadAggregate`/`commit`/`initializeAggregate`/`replaceAggregate` read of one named Space does), inside a transaction on the commit paths.
- It is not currently a correctness bug: both parses run the same schemas over the same already-valid data, so they agree. A defect would only show up if the two schemas were ever allowed to drift (e.g. one call site updated for a field rename and the other missed) — which is exactly the risk "parse once" guards against, not a currently observed failure.
- Removing the pre-parse would mean passing `{ id: stored.id, document: this.#store.readDocument(stored.document), things: stored.things.map(...) }` (raw `unknown` values) straight into `parseSnapshot`, relying entirely on `loadSpaceSnapshot`'s own `spaceSnapshotSchema.safeParse` to validate. That looks safe on inspection — `parseSnapshot`'s parameter type is already `unknown` — but confirming it needs checking every caller's expectations (in particular whether anything downstream relied on the narrower `SnapshotValidationError`-only failure mode the direct `.parse()` calls currently produce as a raw `ZodError` for a caller that does not go through `parseSnapshot` — none currently do, but this needs verifying, not assuming) and a full `pnpm verify`/`pnpm test:integration:*` run.

## Scope

Left unfixed on the one-SQL-repository branch's review pass: it predates the branch, isn't behavioural on the branch's own diff, and removing it is a small but distinct piece of work needing its own verification pass rather than a drive-by edit inside an unrelated review.

## Acceptance (draft, for whoever picks this up)

- [ ] Decide whether `#loadStoredSpaceRow` should stop pre-parsing with `spaceDocumentSchema`/`thingDocumentSchema` and rely on `parseSnapshot`/`loadSpaceSnapshot` alone.
- [ ] If so, remove the pre-parse, confirm no caller depended on the narrower failure mode the direct `.parse()` calls produced, and run `pnpm verify`, `pnpm test:integration:sqlite`, `pnpm test:integration:postgres`.
- [ ] If not (e.g. the pre-parse is found to serve a purpose beyond validation, such as narrowing `unknown` for a type downstream needs), record why here instead.

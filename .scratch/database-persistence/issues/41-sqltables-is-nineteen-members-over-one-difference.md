# 41 — `SqlTables` is nineteen members over one real difference

Status: needs-triage
Tags: Cleanup, release/v1
Blocked by: None.

Recommended sequence: coordinate with tickets 31, 40 and 34 because they touch the same seam. These are not hard prerequisites; investigate the fixed ordering independently.

Audited: 2026-09-20 against `b1ac983d`. The 19 table members and the exposed ordering callback remain. The strongest bounded change is to hide fixed ascending-id ordering; the operation-merging choices below still need design review. This ticket joins the final release proof with its `needs-triage` status intact.

Surfaced by: the architecture review of 2026-09-20 (candidate A).

## The defect

ADR 0095 states the rule: each database supplies "only a small `SqlStore` value", and "a member added to that value is a place the two databases have begun to differ again, and needs a reason." That rule was applied to `SqlStore` when it had 7 members. `SqlStore` now has **10** (`src/persistence/sql-store.ts:308-320`): `lockAggregateShared` (`54e2aaff`), `lockAggregate` (`7b93b498`, ticket 42) and `isUnavailable` (`a77bc662`, ticket 38) were added later, and the ADR's prose list names none of the three, so that list is no longer accurate. The rule was never applied to `SqlTables`, which went from 2 members at ticket 22 to 19 across tickets 23 and 24 — the count in this ticket's title — and is now **21**, the `Image` table having added `create` and `find` (`d37ed7e7`, ADR 0106).

Of those 21, **one** of the three adapter-authored table operations has a different algorithm today. This is not a claim that the whole `SqlStore` varies in only one way: transactions, serialisation, document decoding and duplicate-key recognition also differ.

- `Space.loadEvery` genuinely differs — 6 lines of ordinary ORM read on PostgreSQL against 38 lines of lower-level `sql`/`execute` with a codec override on SQLite (`sql-store.ts`'s own doc comment explains why).
- `Space.loadWithResources` and `Resource.deleteExcept` are **identical code** in both adapters (`src/prisma/sql-store.ts:174`, `:196-207`; `src/sqlite/sql-store.ts:99`, `:165-176`) — only the doc comments beside them differ. They sit per-adapter only because their `.include(...)` and `.notIn(...)` callback types cannot be named across the module seam. A typing obstacle, not a difference.
- The remaining 18 are assembled by `buildSpaceTable`/`buildResourceTable`/`buildRepositoryStateTable`/`buildImageTable` from shared helpers in `sql-store.ts` itself. Their assembly forwards calls, but the helpers also own real behaviour such as JSON conversion, row locking and count-only deletion; they are not all disposable pass-throughs.

Ticket 24's own addendum calls `deleteExcept` "the one genuine per-database difference beyond `loadWithThings`/`loadEvery`/…". Both of those are identical text, so that claim overstates the variation by two.

**Two members are strict specialisations of two others.** `relockSpace` (`src/persistence/sql-store.ts:436-439`, behind `Space.relock`) *is* `writeDocumentUnderLock(space, id, {})` — same statement, same return shape, one constant document apart, with roughly 40 lines of doc comment across the pair explaining that they differ. `Resource.deleteAllForSpace` (`:238`, implemented by `deleteResourcesForSpace` at `:535-540`) *is* `deleteExcept(spaceId, [])`, and both adapters' `deleteExcept` opens with exactly that branch.

**Holding the shared implementation costs additional structural descriptions.** Eleven internal interfaces (`src/persistence/sql-store.ts:341-427`: `SpaceByIdQuery`, `SpaceWithId`, `SpaceCreatable`, `SpaceIdListable`, `SpaceRevisionListable`, `ResourceCreatable`, `ResourceUpsertable`, `ResourceDeletableForSpace`, `ImageCollection`, `RepositoryStateQuery`, `RepositoryStateWithSingleton`) describe narrower ORM capabilities alongside the table interface and helpers. Evaluate which declarations the reduced interface makes unnecessary; the shared module's line count alone does not establish shallowness, especially because much of it documents assignability and storage obligations.

**`Order` exposes machinery callers do not need.** It reaches `SqlSpaceRepository<Handle, Order>` although its only repository use is `listSpaces` asking for every Space ascending by id. It is not technically phantom: it types the callback passed through `SqlTables.Space.orderBy`. `loadEvery` already promises fixed ordering without exposing that callback, and `loadAllForReplacement` scopes its ordering type locally. Those existing operations show where this knowledge can live.

## What to build

Keep the members the two databases genuinely implement differently. Fold each specialisation into the member it specialises. Let ordering be the adapter's promise rather than a caller-supplied callback.

- [ ] Evaluate folding `relock` into `writeDocumentUnderLock`, and `deleteAllForSpace` into `deleteExcept`. Remove a specialisation only when it reduces caller knowledge: moving a magic placeholder argument into callers can make the interface worse despite deleting a member. Keep placeholder writes confined to transactions that immediately truncate or roll back, and keep deletion independent of document decoding (ADR 0094).
- [ ] `Space.orderBy` becomes a coarse member answering every Space ascending by id, as `loadEvery` already does. `Order` leaves `SqlTables`, `SqlStore` and `SqlSpaceRepository`'s type parameters, and `space-resource-repository.test.ts` stops writing `<unknown, unknown>`.
- [ ] Remove internal slice interfaces made unnecessary by the chosen change; retain structural types that still prove generated-ORM assignability without casts. Fewer declarations alone are not evidence of a deeper module.
- [ ] `loadWithResources` and `deleteExcept` may stay duplicated — that is a typing obstacle ticket 22's Answer records four dead ends against, and re-chasing it is out of scope. Say so at the members rather than implying they are differences.
- [ ] ADR 0095's member rule is applied to `SqlTables` as it already is to `SqlStore`: every surviving member is a place the databases differ, or says why it is not.
- [ ] No behavioural change. The whole `spaceRepositoryContract` stays green unchanged on both databases and the memory double, and `sqlite-contention.test.ts` is untouched.

## Relationship to ticket 34

Ticket 34 examines the unused non-transactional `execute` capability. `Handle` still carries real database-specific transaction/ORM information, so narrowing that capability does not necessarily remove its type parameter. Fixed ordering can be hidden without settling ticket 34; ticket 34 may explicitly retain the working capability if removing it adds more interface complexity than it removes.

## Comments

### Triage, 2026-10-09

> *This was generated by AI during triage.*

**Category:** enhancement. **State:** needs-triage.

The premise holds but the counts were stale, and the title's "nineteen" is now wrong. `SqlTables` has 21 members, the two `Image` members having arrived in `d37ed7e7`. There are 11 internal slice interfaces (`src/persistence/sql-store.ts:341-427`), and `SqlStore` has 10 members, not 7 (`:308-320`), so ADR 0095's list of them is no longer accurate. The body now gives these counts, uses Resource names where it said Thing (`loadWithResources`, `Resource.deleteExcept`, `buildResourceTable`, the `Resource*` slices), and points `relockSpace` and `deleteResourcesForSpace` at their current lines. `Order` and the test's `<unknown, unknown>` (`test/unit/space-resource-repository.test.ts:13`) remain. Still open for design review: whether folding `relock` into `writeDocumentUnderLock` and `deleteAllForSpace` into `deleteExcept` reduces caller knowledge or just moves a placeholder argument into callers.

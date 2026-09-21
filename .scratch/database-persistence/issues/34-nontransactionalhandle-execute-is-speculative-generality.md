# 34 — `nonTransactionalHandle.execute` is speculative generality

Status: wontfix
Tags: Cleanup
Blocked by: None.

Surfaced by: a second review pass of the one-SQL-repository branch (ADR 0095, tickets 22-24), M16-part (2026-09-20).

## The claim, confirmed

In `src/sqlite/sql-store.ts`, `sqliteSqlStore`'s non-transactional `Handle` (`nonTransactionalHandle`, built as `{ orm, execute: (plan, options) => database.runtime().execute(plan, options) }`) carries a working `execute`, but nothing in `SqlSpaceRepository` ever exercises it: `execute` exists on `Handle` only so `Space.loadEvery` — the one `SqlTables` member that needs the lower-level `sql`/`execute` builder rather than the ORM (`sql-store.ts`'s own doc comment on `SqlTables.Space.loadEvery` explains why) — can be composed uniformly for both the transactional and non-transactional cases.

Verified by reading every call site of `#loadEverySpace` (the sole caller of `tables.Space.loadEvery()`) in `src/persistence/sql-space-repository.ts`:

- `#commitInTransaction` (line 398) — `tables` built at line 394 from `this.#store.tables(handle)`, `handle` from `this.#store.transaction(...)`.
- `#authoritativeAggregate` (line 611) — always called with a `tables` built the same way, from its three callers: `#replaceAllSpaces` (transactional), `#loadAggregateUnserialised` (transactional), `#initializeUnserialised` (transactional).
- `#loadAggregateUnserialised` (line 669) — `tables` from `this.#store.transaction(...)` (lines 665-666).
- `#initializeUnserialised` (line 698) — `tables` from `this.#store.transaction(...)` (lines 689-690).

None of the four non-transactional call sites of `tables()` (`listSpaces`, `loadSpace` → `#loadStoredSpaceRow`, `markExported`, `#loadMetaSpaceIdUnserialised`) ever calls `.loadEvery()`. So `nonTransactionalHandle.execute` is real, correct, working code for a capability the call graph never reaches — speculative generality, not a defect.

## The fix considered, and why it is not a quick one

The obvious type-level fix is splitting `Handle` into two type parameters on `SqlStore<Handle, Order>` — a narrow one for the `orm` field (no `execute`) and a wider one for `transaction`'s callback (with `execute`, since that is the only handle `Space.loadEvery`'s closure is ever built over) — so the non-transactional value stops needing a working `execute` at the type level, not just in practice.

This does not work as a small, local change, for a reason specific to this codebase rather than TypeScript in general:

1. `tables()` is one function serving two different contracts — a non-transactional caller never needs `Space.loadEvery`, and a transactional caller sometimes does — so making the type system reflect that means `tables()`'s *return type* has to depend on which handle it was given: either an overloaded call signature (`{ (h: Handle): SqlReadTables<Order>; (h: TxHandle): SqlTables<Order> }`) or a conditional type keyed on the argument.
2. PostgreSQL's `Handle` and the type its `transaction` callback receives are the **same type** (`Orm` — see `src/prisma/sql-store.ts`, `transaction<T>(fn: (orm: Orm) => Promise<T>)`), so a `TxHandle` type parameter for PostgreSQL would just be `Orm` again. Overload resolution then breaks: TypeScript always selects the *first* matching signature, so when `Handle` and `TxHandle` are literally the same type, every call — including PostgreSQL's transactional ones — resolves to the narrower `SqlReadTables<Order>` overload and loses `.loadEvery`. Confirmed with a minimal reproduction against this repo's own `tsc` (project-config-free, `--strict`):

   ```ts
   interface Base { readonly a: number }
   interface Full extends Base { readonly loadEvery: () => number }
   interface Store<Handle, TxHandle> {
     readonly tables: { (h: Handle): Base; (h: TxHandle): Full };
   }
   declare const sameStore: Store<{ a: number }, { a: number }>;
   const result = sameStore.tables({ a: 1 });
   result.loadEvery(); // TS2339: Property 'loadEvery' does not exist on type 'Base'.
   ```

   `SqlSpaceRepository<Handle, Order>` is the one shared class both databases run through — `#authoritativeAggregate`/`#loadEverySpace` are not SQLite-specific code, so this is not a SQLite-only fix; it would need to compile for PostgreSQL's coincident `Handle`/`TxHandle` too, and the overload form cannot.
3. A conditional type keyed on the argument (`tables: <H extends Handle | TxHandle>(h: H) => H extends TxHandle ? SqlTables<Order> : SqlReadTables<Order>`) is the usual escape from (2), but this is the same category of cross-module generic-inference problem ticket 22's Answer already spent real effort on and abandoned across four documented dead ends for a structurally similar case (`.include()`'s relation type) — not proven to resolve cleanly here either, and not attempted beyond the reproduction above given the size of this finding.
4. Either approach also requires splitting `SqlTables<Order>` into a base interface (without `Space.loadEvery`) and an extension (with it), which means re-auditing which of `SqlSpaceRepository`'s ~12 private methods currently typed `tables: SqlTables<Order>` actually need the extended type — not all can simply move, since `#loadStoredSpaceRow` is deliberately called with **both** a transactional and a non-transactional `tables` today (its own doc comment says so), so it needs the narrower bound rather than either extreme.
5. ADR 0095 requires property syntax on these shared structural types specifically to keep assignability checked contravariantly rather than bivariantly (`sql-store.ts`'s own doc comment on `SqlTables`/`SqlStore`). An overloaded call signature can still be written as a property (`readonly tables: { (h: Handle): ...; (h: TxHandle): ... }`), so this constraint does not by itself block the approach, but it adds another "assignable without a cast" proof obligation on top of an already-fragile design.

None of this is a correctness question — `nonTransactionalHandle.execute`'s current implementation is behaviourally correct, just unreached. The type-level fix is real speculative-generality *removal*, not a behaviour change, and the ripple (point 2 especially — a shared-class correctness requirement, not a per-database nicety) outweighs the nit for a `minor` review finding.

## Rejected as a same-file workaround

A stub-or-throw `execute` on `nonTransactionalHandle` was also considered and rejected (both by an earlier pass and independently here): `Handle`'s own doc comment promises "a genuine, working value," and a stub would be a silent behavioural change hiding under a type that claims otherwise — the exact anti-pattern `docs/agents/anti-slop.md`'s ownership rules exist to prevent.

## Acceptance (draft, for whoever picks this up)

- [ ] Decide whether the two-type-parameter split (or a conditional-type variant) is worth attempting for real, given point 2/3 above — if so, prototype it against **both** `src/prisma/sql-store.ts` and `src/sqlite/sql-store.ts` and confirm `tsc`/`pnpm -r typecheck` green with no new type assertion before touching the shared interface.
- [ ] If not: leave `nonTransactionalHandle.execute` as is (a correct, if currently unreached, implementation) and close this as `wontfix` with that reasoning restated at the point of closing.

## Comments

**Audit, 2026-09-21 — closed `wontfix`, as the ticket's own second acceptance item proposes.**

The claim still holds against `d456b00c`: every caller of `#loadEverySpace` builds its `tables` from a `#store.transaction` handle, and the non-transactional `tables(this.#store.orm)` sites (`listSpaces`, `loadSpace`, `markExported`, the post-conflict reload, `#loadMetaSpaceIdUnserialised`) never reach `Space.loadEvery`. The line numbers above have moved (`#commitInTransaction`'s read is now `:412`, `#authoritativeAggregate` `:632`, `#loadEverySpace` `:606`). The reason for not attempting the type split is unchanged: PostgreSQL's `Handle` and transaction handle are the same type, so the overload form cannot compile for the shared class, and the conditional-type form is unproven. `nonTransactionalHandle.execute` stays: a correct, currently unreached implementation that `Handle`'s doc comment promises is a working value.

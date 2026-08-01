# Reading a Space and its Cards consistently — Prisma Next and portable options

Research date: 2026-08-01

## Conclusion

`loadStoredSpace` should become **one statement**. Prisma Next's ORM supports
relation reads through `.include(...)`, and on PostgreSQL the whole read —
parent row plus child rows, at any include depth — lowers to a **single SQL
statement**. One statement under READ COMMITTED already sees one snapshot
across both tables, so the read-compare-retry loop, `LOAD_ATTEMPTS`,
`pauseBeforeRetry` and the starvation bug they were added to work around all
disappear rather than being tuned.
([`collection-dispatch.ts:107`](#evidence-one-statement),
[PostgreSQL 13.2.1](https://www.postgresql.org/docs/17/transaction-iso.html))

Transaction isolation level **cannot** be requested through the
`@prisma-next/postgres` facade. `transaction<R>(fn)` takes a callback and
nothing else, the driver issues a bare `BEGIN`, and there is no options object,
middleware hook, extension hook or client-construction option that reaches it.
The only route is PostgreSQL-side `default_transaction_isolation`, which is
connection-scoped, not per-transaction. So "wrap the three reads in a REPEATABLE
READ transaction" is not available as written; the one-statement read is.
(§ [Isolation level](#2-isolation-level-through-the-facade))

The one-statement read is also the **most portable** answer, because the
portability lives in `.include(...)` rather than in SQL you wrote. Hand-rolled
`json_agg`/`row_to_json` is PostgreSQL-only. Isolation-level *names* are
SQL-92-standard while their *semantics* are not — SQL Server's REPEATABLE READ
is lock-based and permits phantoms, and SQLite has no selectable levels at all —
so an isolation-level-based fix is the option that merely looks portable.
(§ [Portability](#4-which-option-actually-survives-an-engine-change))

For the truncate/id-reuse hazard there is **no portable system-column trick**.
`xmin` distinguishes generations on PostgreSQL but is a 32-bit value the docs
explicitly warn against depending on. The portable answers are: don't reuse the
id, or carry an explicit generation column, or make the compared token globally
monotonic rather than a per-row counter restarting at 0.
(§ [Id reuse](#5-detecting-a-row-deleted-and-re-created-with-the-same-key))

---

## What the repository does today, and the two defects

[`loadStoredSpace`](../../src/persistence/postgres-space-repository.ts) issues
three statements — space row, cards, space row again — and compares `revision`
either side, retrying on mismatch:

```ts
const before = await orm.public.Space.first({ id });
const cards  = await orm.public.Card.where({ spaceId: id })...all();
const after  = await orm.public.Space.first({ id });
if (after === null || toRevision(before.revision) !== toRevision(after.revision)) { ...retry }
```

This is snapshot isolation hand-rolled in application code, and it has the two
failure modes the brief names.

**Starvation.** The comment on `LOAD_ATTEMPTS` records it directly: "five
attempts with no pause between them did not — four concurrent readers against
fifty sequential commits exhausted it in CI." The budget was raised to 12 and a
randomised backoff added. Both are mitigations of a race that a single statement
does not have.

**Generation collision.** `--dangerous-truncate` runs
[`truncateHyperContent`](../../src/persistence/postgres-space-repository.ts) and
then re-inserts with `revision: 0`. `commitSpace` gates on
`.where({ revision: databaseExpectedRevision })`, so a caller holding
generation-1's `revision: 0` matches generation-2's `revision: 0` and writes
onto a row that is not the one it read. Revision equality is not generation
equality. (Worth noting: `truncateHyperContent` issues per-space `DELETE`s, not
`TRUNCATE`, so nothing about sequence restart is involved — the reuse comes from
the explicit ids the import supplies.)

Both defects are properties of *comparing a token across separate statements*.
Neither survives collapsing the read into one statement.

---

## 1. Relation reads in Prisma Next

**Yes.** The ORM collection exposes `.include(...)`, with an optional refinement
callback:

```ts
include<...>(relationName, refine?): Collection<...>
```

The shipped JSDoc gives the shapes
(`node_modules/.pnpm/@prisma-next+sql-orm-client@0.16.0_typescript@6.0.3/node_modules/@prisma-next/sql-orm-client/src/collection.ts:419-436`):

```ts
// Simple include — every user comes back with its posts array:
const users = await db.orm.User.include('posts').all();
// Refined:
const withRecent = await db.orm.User.include('posts', (posts) => ...).all();
// Aggregated:
const withCounts = await db.orm.User.include('posts', (posts) => posts.count()).all();
```

The public docs describe the same API and add nesting.
([Relations and joins in Prisma Next](https://www.prisma.io/docs/orm/next/fundamentals/relations-and-joins))

### It issues one statement, not several {#evidence-one-statement}

The dispatcher says so in as many words
(`.../sql-orm-client/src/collection-dispatch.ts:107-109`):

> `// The correlated-subquery include builder lowers every include`
> `// descriptor shape (row, scalar reducers, and combine()) at any depth`
> `// into a single query; the read path has no multi-query fallback.`

Confirmed empirically against **this repo's own contract**. Binding the client
to a stub `pg` client that records every `query()` call and running
`db.orm.public.Space.where({ id }).include('cards', (c) => c.orderBy(...)).first()`
produced exactly one statement:

```sql
SELECT "spaces"."created_at" AS "created_at", "spaces"."document" AS "document",
       "spaces"."exported_revision" AS "exported_revision", "spaces"."id" AS "id",
       "spaces"."revision" AS "revision", "spaces"."updated_at" AS "updated_at",
  (SELECT coalesce(json_agg(json_build_object(
            'created_at', "cards__rows"."created_at", 'document', "cards__rows"."document",
            'id', "cards__rows"."id", 'space_id', "cards__rows"."space_id",
            'updated_at', "cards__rows"."updated_at")
          ORDER BY "cards__rows"."cards__order_0" ASC), json_build_array()) AS "cards"
   FROM (SELECT ..., "cards"."id" AS "cards__order_0"
         FROM "public"."cards"
         WHERE "cards"."space_id" = "spaces"."id"
         ORDER BY "cards"."id" ASC) AS "cards__rows") AS "cards"
FROM "public"."spaces" WHERE "spaces"."id" = $1::uuid LIMIT 1
```

The same call inside `db.transaction(...)` produced exactly `BEGIN`, that one
`SELECT`, `COMMIT`. Today's two-step read produced two statements, as expected.

The `coalesce(json_agg(...), json_build_array())` rendering is
`renderJsonArrayAggExpr` in
`node_modules/.pnpm/@prisma-next+adapter-postgres@0.16.0.../adapter-postgres/src/core/sql-renderer.ts:673-687`,
and the PostgreSQL adapter declares `jsonAgg: true` and `lateral: true` among
its capabilities (`.../adapter-postgres/src/core/adapter.ts:19-33`).

Two corrections to secondary impressions:

- The docs say "On PostgreSQL, Prisma Next fetches included relations with
  joins."
  ([relations-and-joins](https://www.prisma.io/docs/orm/next/fundamentals/relations-and-joins))
  The emitted SQL for this shape is a **correlated scalar subquery in the
  projection**, not a `JOIN`. The consistency consequence is the same — one
  statement — but do not expect to see `JOIN` in a query log.
- The package README claims the client will "Execute and stitch include trees
  across multiple plan executions"
  (`.../sql-orm-client/README.md`). For the read path in 0.16.0 that is
  **stale**; the dispatcher comment above explicitly retired the multi-query
  fallback. `query-plan-select.ts:723` still refers to "the multi-query
  stitcher's output" only as the shape the single-query path must match.

Because the aggregate is `coalesce(json_agg(...), json_build_array())`, a Space
with zero cards returns `[]` rather than a null-padded outer-join row — there is
no empty-child special case to write.

### Where it runs

Outside a transaction, `dispatchWithIncludes` acquires one pooled connection for
the call and releases it (`acquireRuntimeScope`,
`.../sql-orm-client/src/collection-runtime.ts:177-197`). Inside
`db.transaction(...)`, `tx.orm` is built over a runtime exposing only
`execute`, so `acquireRuntimeScope` falls through and the include runs on the
transaction's connection
(`node_modules/.pnpm/@prisma-next+postgres@0.16.0.../postgres/src/runtime/postgres.ts:333-340`).
No separate isolation reasoning is needed either way, because it is one
statement.

### Typing caveat

`.include('cards')` type-checks under this repo's strict config, at top level
and inside `db.transaction` (verified with `pnpm exec tsc --noEmit` against a
temporary probe in `src/prisma/`, since removed). But **the relation payload is
weakly typed by default**: `row.cards` is an array whose elements are an index
signature, so `card.id` is `unknown` and `noPropertyAccessFromIndexSignature`
forces `card['id']`. Adding an explicit refinement recovers the types —
`.include('cards', (cards) => cards.select('id', 'document'))` yields elements
typed `{ id: string; document: JsonValue; [x: string]: unknown }`.

This matters little here, because `loadStoredSpace` already re-parses every card
through `cardDocumentSchema`, but the refinement is worth writing anyway.

(Separately confirmed by the same probe: `space.revision` comes back typed
`number`, which is the known `int8` workaround already recorded in `CLAUDE.md` —
`.include(...)` does not change it.)

---

## 2. Isolation level through the facade

**There is no way to request an isolation level.** Everything below was checked.

The signature carries only a callback
(`node_modules/@prisma-next/postgres/dist/postgres-D4fQi5mE.d.mts`, and the
matching source at `.../postgres/src/runtime/postgres.ts:65`):

```ts
transaction<R>(fn: (tx: PostgresTransactionContext<TContract>) => PromiseLike<R>): Promise<R>;
```

Its implementation delegates straight through
(`.../postgres/src/runtime/postgres.ts:325-326`):

```ts
transaction<R>(fn) { return withTransaction(getRuntime(), (txCtx) => { ... }); }
```

`withTransaction` calls `connection.transaction()`
(`.../sql-runtime/src/sql-runtime.ts:763-770`), and the PostgreSQL driver's
`beginTransaction` is
(`.../driver-postgres/src/postgres-driver.ts:320-322`):

```ts
async beginTransaction(): Promise<SqlTransaction> {
  await this.#connection.query('BEGIN').catch(rethrowNormalizedError);
  return new PostgresTransactionImpl(this.#connection, this.options);
}
```

A bare `BEGIN`. No `ISOLATION LEVEL` clause, no parameter threaded to it.

Checked and ruled out:

| Surface | Result |
| --- | --- |
| Second argument to `transaction()` | Not typed; passing one at runtime is silently ignored — still bare `BEGIN` (verified) |
| `PostgresOptionsBase` client options | Only `extensions`, `middleware`, `verifyMarker`, `poolOptions` (`connectionTimeoutMillis`, `idleTimeoutMillis`) |
| `SqlMiddleware` | Hooks are `beforeCompile` (rewrite AST), `beforeExecute` (mutate param values), `onRow`, `afterExecute`. None can emit a statement or configure the transaction (`.../sql-runtime/src/middleware/sql-middleware.ts`) |
| Extensions (`SqlRuntimeExtensionDescriptor`) | Contribute static surfaces/adapters, no transaction lifecycle hook (`.../sql-runtime/src/sql-context.ts:124-155`) |
| `db.raw` / `fns.raw` | Builds an `Expression`, never a statement — see §3 |
| Prisma Next docs | The transactions page documents `db.transaction(async (tx) => …)`, rollback-on-throw, and MongoDB's absence. **No mention of isolation levels, options or retries.** ([Transactions](https://www.prisma.io/docs/orm/next/fundamentals/transactions)) |

### The one route that does exist: PostgreSQL-side, connection-scoped

PostgreSQL's `default_transaction_isolation` "controls the default isolation
level of each new transaction. The default is 'read committed'."
([runtime-config-client](https://www.postgresql.org/docs/17/runtime-config-client.html))
It can be set per role or database (`ALTER ROLE … SET`, `ALTER DATABASE … SET`),
or per connection via libpq's `options` parameter, which "specifies command-line
options to send to the server at connection start… Spaces within this string are
considered to separate command-line arguments, unless escaped with a backslash."
([libpq-connect](https://www.postgresql.org/docs/17/libpq-connect.html))

That reaches this stack: the driver builds `new Pool({ connectionString: binding.url, … })`
(`.../driver-postgres/src/postgres-driver.ts:538-541`); `pg-connection-string`
copies every URL query parameter into the config
(`for (const entry of result.searchParams.entries()) config[entry[0]] = entry[1]`,
`pg-connection-string@2.14.0/index.js:39-41`); and `pg` forwards `options` in the
startup packet (`pg@8.22.0/lib/client.js:558-559`). Parsing a URL carrying
`?options=-c%20default_transaction_isolation%3Drepeatable%5C%20read` was verified
to land as `ConnectionParameters.options`.

Two reasons **not** to reach for it here:

1. It is connection-scoped, not per-transaction. Every write in the process
   would run at that level too, and PostgreSQL's REPEATABLE READ raises
   `ERROR: could not serialize access due to concurrent update` on write
   conflicts, which `commitSpace` does not handle.
   ([transaction-iso](https://www.postgresql.org/docs/17/transaction-iso.html))
2. It moves a correctness requirement into a connection string — invisible to
   the code that depends on it, and easy to lose when `DATABASE_URL` is
   regenerated (which CI now does per job).

**Not established:** whether Prisma Next intends to expose isolation levels. No
statement either way was found in the docs or the shipped packages.

---

## 3. What the `sql` query builder can express, and `raw` inside a transaction

`Db<TContract>` is a map of namespaces to table proxies and nothing else
(`.../sql-builder/src/types/db.ts`), so the builder is always anchored to a
table. There is no free-form statement entry point.

**Joins** — `innerJoin`, `outerLeftJoin`, `outerRightJoin`, `outerFullJoin`,
plus `lateralJoin` / `outerLateralJoin` gated on the `sql.lateral` capability,
which the PostgreSQL adapter declares `true`
(`.../sql-builder/src/types/shared.ts:55-108`;
`.../adapter-postgres/src/core/adapter.ts:19-33`). Chaining order is
table → join(s) → `select` → `where`; `JoinedTables` has no `where`. Verified:

```sql
SELECT "spaces"."revision" AS "revision", ..., "cards"."document" AS "card_doc"
FROM "public"."spaces" LEFT JOIN "public"."cards" ON "spaces"."id" = "cards"."space_id"
WHERE "spaces"."id" = $1::uuid
```

**Correlated subqueries** — yes: `fns.exists`, `fns.notExists`, `fns.in`,
`fns.notIn` all accept a `Subquery`
(`.../sql-builder/src/runtime/functions.ts:150-161`).

**`json_agg` / `row_to_json`** — **not** in the builder's function surface. `fns`
is `eq, ne, gt, gte, lt, lte, and, or, exists, notExists, in, notIn, raw, count,
sum, avg, min, max` (`.../sql-builder/src/runtime/functions.ts:140-178`). The
ORM emits `json_agg` internally for `.include(...)`, but from the builder you
must write it through `fns.raw`. Verified as one statement:

```sql
SELECT "spaces"."revision" AS "revision", "spaces"."document" AS "document",
  (SELECT coalesce(json_agg(c.document ORDER BY c.id), '[]'::json)
   FROM public.cards c WHERE c.space_id = "spaces"."id") AS "cards"
FROM "public"."spaces" WHERE "spaces"."id" = $1::uuid
```

**Raw SQL** — `RawSqlTag` is a tagged template returning a `RawSqlBuilder` whose
only method is `.returns(spec)`, producing an `Expression`
(`.../sql-relational-core/src/expression.ts:207-230`). It is an **expression**
factory. It cannot express a statement, so `SET TRANSACTION ISOLATION LEVEL`
is out of reach through it. Interpolated JS values become `ParamRef` nodes, so
it is not a string-concatenation injection surface.

### `raw` on the transaction context — confirmed, and the nuance

The typings are as the brief suspected. `PostgresClient` has
`readonly raw: RawSqlTag`; `PostgresTransactionContext` has `sql`, `orm`,
`enums`, `nativeEnums` and nothing else (both in
`node_modules/@prisma-next/postgres/dist/postgres-D4fQi5mE.d.mts`). Verified at
runtime: inside `db.transaction`, `Object.keys(tx)` is
`enums, nativeEnums, orm, sql`, `typeof tx.raw === 'undefined'`, and
`typeof db.raw === 'function'`.

**But this is not a real limitation.** `fns.raw` is available inside the
transaction's own builder, because the transaction constructs its `Db` with the
adapter's `rawCodecInferer`
(`.../postgres/src/runtime/postgres.ts:326-331`). Verified — this ran inside
`db.transaction`, emitting `BEGIN` / the select / `COMMIT`:

```sql
SELECT "id" AS "id", xmin::text AS "gen" FROM "public"."spaces"
```

`db.raw` is likewise a pure expression factory with no connection affinity, so
it is safe to use inside a transaction callback. `tx.execute(plan)` is present
(`TransactionContext` supplies `execute` / `executePrepared`); `tx.connection`
is not.

---

## 4. Which option actually survives an engine change

### What PostgreSQL guarantees for a single statement

> "When a transaction uses this isolation level, a `SELECT` query (without a
> `FOR UPDATE/SHARE` clause) sees only data committed before the query began; it
> never sees either uncommitted data or changes committed by concurrent
> transactions during the query's execution. In effect, a `SELECT` query sees a
> snapshot of the database as of the instant the query begins to run."

> "Also note that two successive `SELECT` commands can see different data, even
> though they are within a single transaction, if other transactions commit
> changes after the first `SELECT` starts and before the second `SELECT`
> starts."

([PostgreSQL 13.2.1, Read Committed](https://www.postgresql.org/docs/17/transaction-iso.html))

The snapshot is a property of the **statement**, and it is a snapshot of *the
database* — not of one table. A single `SELECT` that reads `spaces` and `cards`
therefore sees both as of one instant, with no torn read, at the **default**
isolation level, with no transaction, no retry and no version comparison. The
second quote is the exact defect in today's three-statement read, stated by the
vendor.

REPEATABLE READ moves the snapshot to "the start of the first
non-transaction-control statement in the transaction" — which is what the
current retry loop is imitating, and which becomes irrelevant once there is only
one statement.

### Ranking the three approaches

| Approach | Correct? | Cost | Portability |
| --- | --- | --- | --- |
| **One statement via `.include(...)`** | Yes, at default isolation | One round trip | **Genuinely portable** — the ORM owns the dialect lowering |
| One statement via hand-written `json_agg` | Yes | One round trip | PostgreSQL-only |
| Snapshot-isolated transaction | Yes on PostgreSQL | Two round trips + a held connection + serialization-failure handling | Looks portable, isn't (below) |
| Application-level version check (today) | Only probabilistically | 3+ round trips, backoff, starvation risk | Portable, and portably wrong |

### Why the isolation-level option only looks portable

The level *names* are SQL-92 and every engine accepts them. The *semantics*
diverge exactly where this problem lives:

- **PostgreSQL** — REPEATABLE READ is a true snapshot taken at the first
  statement; writers are not blocked; write conflicts raise
  `could not serialize access due to concurrent update`.
  ([transaction-iso](https://www.postgresql.org/docs/17/transaction-iso.html))
- **MySQL / InnoDB** — REPEATABLE READ is the default, and "Consistent reads
  within the same transaction read the snapshot established by the first read."
  Similar in shape to PostgreSQL for a pure read; READ COMMITTED there gives each
  consistent read "its own fresh snapshot."
  ([InnoDB isolation levels](https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html))
- **SQL Server** — REPEATABLE READ is **lock-based, not snapshot-based**:
  "Shared locks are placed on all data read by each statement in the transaction
  and are held until the transaction completes… Other transactions can insert new
  rows that match the search conditions… which results in phantom reads."
  Snapshot semantics live under a *different* level, `SNAPSHOT`, which requires
  `ALLOW_SNAPSHOT_ISOLATION` to be `ON` first; and statement-level snapshots
  require the `READ_COMMITTED_SNAPSHOT` database option. So the same SQL-92
  keyword buys blocking-and-phantoms rather than a snapshot.
  ([SET TRANSACTION ISOLATION LEVEL](https://learn.microsoft.com/en-us/sql/t-sql/statements/set-transaction-isolation-level-transact-sql))
- **SQLite** — does not implement selectable SQL-92 levels: "all transactions in
  SQLite show 'serializable' isolation. SQLite implements serializable
  transactions by actually serializing the writes." In WAL mode a read
  transaction gets snapshot isolation for its duration. Asking SQLite for
  REPEATABLE READ is not a meaningful request.
  ([SQLite isolation](https://www.sqlite.org/isolation.html))

So the portable-looking option needs per-engine review of what the level means,
per-engine error handling, and on SQL Server a database-level option change. The
one-statement read needs none of that: on every engine, a single statement is
the unit the engine itself makes atomic for reads.

This matters concretely for this repo's stated direction, because Prisma Next's
target list is expanding: "Prisma Next ships first-class support for
**PostgreSQL** (the primary target, on track for general availability) and
**MongoDB**… **SQLite** is the next SQL target on deck, with **MySQL** to
follow." ([What is Prisma Next?](https://www.prisma.io/docs/orm/next))
`.include(...)` is the surface that survives that; the docs already note it
lowers to `$lookup` on MongoDB.
([relations-and-joins](https://www.prisma.io/docs/orm/next/fundamentals/relations-and-joins))

**Not established:** what `.include(...)` will lower to on the SQLite and MySQL
targets, since neither ships yet. The single-statement guarantee is verified for
`target-postgres@0.16.0` only.

---

## 5. Detecting a row deleted and re-created with the same key

There is no standard cross-engine mechanism. The four candidates, ranked by
portability:

### Don't reuse the identity (portable, and the smallest change here)

`--dangerous-truncate` re-creates spaces with **explicit ids from the import
input**. Letting the `spaces.id` column default mint a fresh UUID after a
truncate makes the collision impossible rather than detectable, and the
repository already has that path — `resolveImport` takes `reservedSpaceId` from
`Space.create` when the input omits an id
([`postgres-space-repository.ts`](../../src/persistence/postgres-space-repository.ts)).
This costs the ability to round-trip a Space under a stable id, which is a
product decision, not a technical one.

### A generation / epoch column (portable, explicit)

An extra column — `generation`, or simply making the compared token globally
monotonic instead of a per-row counter that restarts at 0 — and comparing
`(id, generation)` rather than `(id, revision)`. Portable to every relational
engine, visible in the schema, and it is the only option in this list that a
reader can see is load-bearing. This is the standard answer.

A PostgreSQL sequence backs it well because sequence allocation is
non-transactional: "the value obtained by `nextval` is not reclaimed for re-use
if the calling transaction later aborts", and PostgreSQL sequences "cannot be
used to obtain 'gapless' sequences."
([functions-sequence](https://www.postgresql.org/docs/17/functions-sequence.html))
Gaps are exactly what is wanted — a value once handed out is never handed out
again, so a re-created row cannot land on a previously observed token. Every
major engine has an equivalent (identity columns, `AUTO_INCREMENT`, sequences),
though the "never reused" guarantee has to be re-checked per engine.

Note that the repo's truncate path issues `DELETE`s, not `TRUNCATE`, so
`RESTART IDENTITY` is not in play; a sequence would keep climbing across a
truncate without any special handling.

### `xmin` (PostgreSQL-specific, and discouraged)

`xmin` is "the identity (transaction ID) of the inserting transaction for this
row version", so a deleted-and-reinserted row has a different `xmin` and the
pair `(id, xmin)` detects the generation change. It is reachable from this stack
today — `fns.raw\`xmin::text\`.returns('pg/text@1')` was verified to emit
`SELECT "id" AS "id", xmin::text AS "gen" FROM "public"."spaces"`, inside a
transaction.

But the same page warns: "Transaction identifiers are also 32-bit quantities. In
a long-lived database it is possible for transaction IDs to wrap around… It is
unwise, however, to depend on the uniqueness of transaction IDs over the long
term (more than one billion transactions)." `xmin` also changes on **every
update**, not only on re-creation, so it conflates "different generation" with
"changed since I read it" — usable as an optimistic token, useless as a
generation identifier. And the neighbouring `ctid` is explicitly disqualified:
"a row's `ctid` will change if it is updated or moved by `VACUUM FULL`.
Therefore `ctid` should not be used as a row identifier."
([ddl-system-columns](https://www.postgresql.org/docs/17/ddl-system-columns.html))

Verdict: PostgreSQL-specific, documented as unwise for exactly this use, and it
would put a `raw` fragment into the persistence layer. Not recommended.

### Soft deletes (portable, largest blast radius)

Never deleting means the primary key is never free to be reused, so the hazard
cannot arise. Portable to every engine, but it changes every read path (every
query grows a predicate), and `--dangerous-truncate`'s whole purpose is that the
content is gone. Wrong shape for this problem.

---

## Recommended shape

Design sketch, not a patch:

```ts
const loadStoredSpace = async (orm: Orm, id: UUID): Promise<StoredSpace | undefined> => {
  const row = await orm.public.Space
    .where({ id })
    .include('cards', (cards) => cards.select('id', 'document').orderBy((card) => card.id.asc()))
    .first();
  if (row === null) return undefined;

  const snapshot = parseSnapshot({
    id: row.id,
    document: spaceDocumentSchema.parse(row.document),
    cards: row.cards.map((card) => ({
      id: card['id'],
      document: cardDocumentSchema.parse(card['document']),
    })),
  });

  return {
    snapshot,
    revision: toRevision(row.revision),
    exportedRevision: toOptionalRevision(row.exportedRevision),
  };
};
```

What goes with it: `LOAD_ATTEMPTS`, `pauseBeforeRetry`, the `before`/`after`
comparison, the "changed repeatedly while loading" error, and the comment in
`commitSpace` explaining why the post-commit read is kept outside the
transaction (it no longer retries or pauses, so it may move inside if that is
otherwise desirable).

The truncate/id-reuse hole is **independent** and is not fixed by this change.
Treat it as its own issue and pick from §5 — the generation column or minting a
fresh space id.

---

## Scope cautions

- Do not reach for `default_transaction_isolation` in `DATABASE_URL` to fix the
  read. It changes write behaviour too, and PostgreSQL REPEATABLE READ raises
  serialization failures that `commitSpace` does not currently handle.
- Do not hand-write `json_agg` in `postgres-space-repository.ts`. `.include(...)`
  emits the same thing, keeps the dialect choice in the ORM, and is the
  version that survives the SQLite/MySQL targets.
- Do not add `xmin` to the aggregate. It changes on every update, it is 32-bit,
  and the PostgreSQL docs advise against depending on transaction-id uniqueness.
- Do not read `tx.raw`'s absence as a limitation; `fns.raw` inside `tx.sql`
  covers it, and `db.raw` is connection-independent.
- Do not treat the `sql-orm-client` README's "stitch include trees across
  multiple plan executions" as current. The read path in 0.16.0 has no
  multi-query fallback.

## Method note

Statement counts and SQL text in this document were captured by binding
`postgres({ contractJson, pg: stubClient, verifyMarker: false })` to a
duck-typed `pg` client — `isPgClient` tests only for `escapeIdentifier` /
`escapeLiteral`
(`.../postgres/src/runtime/binding.ts:3-7`) — that records every `query()` call
and returns empty rows. No database was started. Type-level claims were checked
with `pnpm exec tsc --noEmit` over the repo's root program using a temporary
probe file under `src/prisma/`, since deleted; the tree is clean.

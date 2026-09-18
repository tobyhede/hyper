# Broken stored state has two error identities, and only one is classified

Status: open
Tags: Defect
Blocked by: None — can start immediately.

Surfaced by: tightening a bare `rejects.toThrow()` while landing the SQLite truncation fix under ticket 17 and ADR 0094 (18 September 2026). The assertion was hiding it.

## The defect

`AggregateInvariantError` exists so that two unrelated failures arriving at a reader the same way can be told apart: broken stored state, which is a defect this deployment carries and no retry cures, and an unreachable database, which is temporary and a later attempt is exactly the answer (`packages/persistence/src/repository.ts`). `src/http/space-host.ts` asks `isAggregateInvariant` twice — at `:85`, where a read that failed on an invariant is re-read once rather than rethrown, and at `:149`, where it answers `internal-error` for broken state and `persistence-unavailable` — try again later — for everything else.

A stored `document` that is **not JSON at all** does not reach that identity. It fails inside the driver's json codec, before any intake of ours runs, as `TypeError: Cannot read properties of undefined (reading 'codecId')`. `isAggregateInvariant` walks the cause chain and finds nothing, so:

- `GET /` answers `persistence-unavailable` with "Try the request again later." for a defect no retry cures.
- `readAggregate` rethrows rather than re-reading.

A document that **is** JSON but fails Space intake raises `AggregateInvariantError` correctly, so the two flavours of the same category — stored state no aggregate can be read from — are classified differently. Verified on SQLite: `truncates a stored Space whose document is not JSON` in `test/integration/sqlite-space-repository.test.ts` pins `isAggregateInvariant(readFailure) === false`, and asserting `AggregateInvariantError` there fails with `expected error to be instance of AggregateInvariantError`.

Not checked on PostgreSQL — see the Decided section's PostgreSQL bullet.

## Decided (2026-09-18)

- **What counts.** On an aggregate read (`loadEverySpace`, and so `loadAggregate`, `initializeAggregate`'s existing-state read, and replacement's authorisation), *every* failure to decode a stored row is broken stored state and raises `AggregateInvariantError`, with the original on `cause`: text that is not JSON, a revision that is not canonical, and a document that fails its schema. Only the last is wrapped today.
- **Where it is caught.** The one-statement `include` read was tried and given up: `orm.Space`'s own root-level `document` decodes through the driver's json codec regardless of `.select()`/`.include()` — confirmed against a well-formed document too, which comes back a decoded object rather than text — because the ORM client decodes unconditionally by design (`sql-orm-client`'s README, "Codec Roundtrip": "rows yielded to user code carry **plain field values**"). Only a field read as a *nested relation inside `.include()`* — which is how Things' documents already arrive — skips that decode; there is no such path for the root row itself. So SQLite reads the Space `document` as text through the lower-level `db.sql` builder instead, which can override a column's codec on the way out: `sql.spaces.select((fields) => ({ id: fields.id, document: raw\`document\`.returns('sqlite/text@1'), revision: fields.revision, exportedRevision: fields.exported_revision })).orderBy('id')`, run as `tx.execute(...)`, gets the raw stored string back unthrown even when it is not JSON. Getting Things in the same shape needs a second statement the same way — `sql.things.select((fields) => ({ id: fields.id, spaceId: fields.space_id, document: raw\`document\`.returns('sqlite/text@1') })).orderBy('id')` — because the low-level builder has no `.include()` to nest them in the first; grouping Things by `spaceId` is ours to do in code. Both statements run via the transaction context's own `tx.sql`/`tx.execute` (never a second connection), inside the transaction `loadEverySpace`'s callers already open, so both see one snapshot — a SQLite transaction holds its lock from first read to commit. Every decode — `JSON.parse`, the Space/Thing schemas, `toRevision` — happens in the adapter's own per-row step over those two statements' rows, and only that step's failures are wrapped; neither statement itself is wrapped, so a connection failure cannot be misread as broken state, and nothing matches the driver codec's `TypeError` by message. This is what ticket 22's `SqlStore.readDocument` later lifts out for both databases.
- **PostgreSQL.** Its `document` column is `jsonb`, so it cannot hold text that is not JSON; the database refuses the write. An integration test proves that rather than this ticket asserting it. A non-canonical revision cannot arise there either while revisions are `int8` (ticket 22 moves them to TEXT and its codec owns that case).
- **`loadSpace` and `listSpaces` are out of scope.** PostgreSQL keeps the narrower error deliberately — one Space failing is that resource's answer, not evidence the aggregate cannot be read (`postgres-space-repository.ts`, `loadEverySpace`'s comment). SQLite gains the same comment; it states nothing today.
- **The classification default does not flip.** Every other throw stays "not an invariant". Inverting it would answer SQLite BUSY/LOCKED as broken state, because nothing in production names the unavailable arm; ticket 31 (architecture review candidate 3, to be written once this lands) names it first, and any flip waits on that.
- **`GET /api/aggregate`** answers 500 `internal-error` for an `AggregateInvariantError` on the cause chain and 503 `persistence-unavailable` otherwise, as `space-host.ts` already does for `GET /`. The browser treats both alike today (`createSpaceStartup` rejects on either), so nothing it does changes.

## Acceptance

- [ ] Red first. SQLite repository: `truncates a stored Space whose document is not JSON`'s pin (`isAggregateInvariant(readFailure) === false`) becomes the `rejects.toThrow(AggregateInvariantError)` its siblings assert, with sibling cases for a non-JSON Thing document and a non-canonical stored revision.
- [ ] PostgreSQL integration: a raw insert of text that is not JSON into `spaces.document` is refused by the database.
- [ ] `@project/http`: `GET /api/aggregate` answers 500 `internal-error` for an invariant failure, including one carried only on `cause`, and 503 `persistence-unavailable` for any other throw.
- [ ] SQLite HTTP runtime: with a non-JSON Space document stored, `GET /` answers `internal-error` and start-up gives up rather than spending its retry budget — the host's two `isAggregateInvariant` calls exercised for this flavour.
- [ ] SQLite's aggregate read decodes the Space document itself; no catch surrounds a query.
- [ ] SQLite's `loadSpace`/`listSpaces` carry PostgreSQL's comment on keeping the narrower error.
- [ ] `pnpm verify` and `pnpm test:integration:sqlite` are green. `pnpm test:integration:postgres` and `pnpm e2e:sqlite` are run or named as skipped with the reason. `pnpm e2e` is inapplicable.

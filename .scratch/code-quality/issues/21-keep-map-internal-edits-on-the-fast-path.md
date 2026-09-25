# 21: Keep Map-internal Edits on the commit fast path

**Priority:** P2 — measured cost that grows with the whole aggregate, not the edited Space

**Status:** resolved. The PostgreSQL race and differential cases passed in CI's `postgres` job on PR #293.

**Blocked by:** None. It combines with ticket 20 and does not depend on it.

**Problem:** `preservesSnapshotBoundary` in `src/persistence/sql-space-repository.ts` compares `JSON.stringify(document.maps)` exactly. Any change to a position, an Open or Closed state, an Open Size, an Edge, a Graph title or a colour therefore goes to the aggregate path. There `#lockMetaIdentity` takes the aggregate lock, `#loadEverySpace` reads and parses every Space in the aggregate, and `decideCommit` runs `loadSpaceAggregate` twice.

**Evidence (ticket 17, `scripts/persistence-cost/measure.ts`, SQLite):** Move, Open, Resize and Add Edge all took the aggregate path. Rename and body Edits took the fast path. For the same 10-Resource Space:

| aggregate beside it | fast path (rename): rows read / snapshot parses | aggregate path (move): rows read / snapshot parses |
|---|---|---|
| nothing | 4 / 3 | 18 / 9 |
| 10 Spaces × 100 Resources | 4 / 3 | 1,038 / 39 |
| 40 Spaces × 100 Resources | 4 / 3 | 4,098 / 129 |

The snapshot parses cover 30 Resource documents on the fast path. On the aggregate path they cover 3,093 and 12,183 Resource documents. Moving one Resource in a 10-Resource Space reads and parses every Resource in the aggregate. The statement count stays at 22 against 18, so a statement count alone does not show the cost. Latency is unreliable on the measurement machine (load average about 100–145): the aggregate-path medians were 0.7–2.1 s and the fast-path medians were 8–40 ms.

**Benefit hypothesis:** when a Map-internal Edit takes the fast path, its reads and parses stay constant as unrelated Spaces are added: 4 rows and 3 snapshot parses in the table above.

**Proposed widening:** replace the whole-`maps` comparison with the cross-Space facts other Spaces can observe:

- the same `defaultMap`;
- the same Map ids;
- the same Graph ids, each owned by the same Map;
- the same Resource ids and kinds, and the same Space Resource selections. These are already checked.

**Invariants: why the widening holds (original argument, superseded by the review below):** `loadSpaceAggregate` (`packages/graph/src/space-aggregate.ts`) reports cross-Space errors only for Space ids, Resource ids, Space Resource targets and cycles, and for a Space Resource's `map`, `graph` and graph-in-map (`space-resource-map-missing`, `-graph-missing`, `-graph-outside-map`). None of them reads positions, Open state, Open Size, Edges, titles or colours. The fast path already runs `loadSpaceSnapshot` on the proposed snapshot, so Edges stay closed over Map membership and geometry stays valid within the Space. Meta reachability (`ordinary-space-unreferenced`) depends only on Space Resource `spaceId`s, which the boundary keeps. The fast path takes no aggregate lock. A concurrent aggregate-path commit that deletes this Space or retargets a Space Resource works only on Map and Graph ids, which this path does not change. The row lock in `#writeUpdate` still detects a racing commit to the same Space.

## Invariant review

Reviewed 2026-09-25 against `decideCommit` (`packages/persistence/src/commit-decision.ts`), `loadSpaceAggregate` (`packages/graph/src/space-aggregate.ts`) and `SqlSpaceRepository` (`src/persistence/sql-space-repository.ts`) as they stand on top of ticket 20.

### What the widened boundary lets through

A single `update` whose proposed snapshot passes `loadSpaceSnapshot` and keeps, against the stored Space:

- the same `defaultMap`;
- the same set of Map ids;
- the same set of Graph ids, each owned by the same Map id;
- the same Resource ids and kinds, and for each Space Resource the same `spaceId`, `map` and `graph` (unchanged from today).

Newly on the fast path: positions, Open/Closed, Open Size, Edges (added, removed, retitled), Graph titles and colours, Map titles, `activeGraph`, and the order of Maps or of Graphs within a Map. Still on the aggregate path: adding or removing a Map or Graph, moving a Graph to another Map, changing `defaultMap`, and everything that was already sent there (Resource membership or kind, Space Resource selection, a snapshot failing intake, any multi-change commit).

`defaultMap` is not read by any aggregate check, so it could be widened too. It stays on the aggregate path because the ticket proposed it and no measured Edit needs it; it is a one-line change later.

### Every check `decideCommit` makes, against a boundary-keeping update

The stored aggregate invariant: every write path leaves the stored Spaces passing `loadSpaceAggregate`, except for `ordinary-space-unreferenced` Spaces that `decideCommit`'s `baselineUnreferenced` carve-out tolerates. `initializeAggregate` and `replaceAggregate` run complete intake, the aggregate path writes only a candidate that passes it, and the fast path preserves it by the argument below. That is what lets the fast path skip reading the other Spaces.

| check | depends on | a boundary-keeping update |
|---|---|---|
| `commitRequestRefusal` (empty, duplicate id, mismatched snapshot) | the change list | answered in `#commitUnserialised` before either path, unchanged |
| revision conflict | the edited Space's revision | the fast path answers the same conflict from its own read |
| no Meta identity | `repository_state` | the fast path hands the commit to the aggregate path, unchanged (ticket 29) |
| `invalid-space-snapshot` | each snapshot's own intake | the proposal is checked by `loadSpaceSnapshot`, and a failure goes to the aggregate path; the other Spaces are stored and valid |
| Edges closed over Map membership, graph-in-own-Map, `activeGraph`, `defaultMap` resolving, finite geometry | the one snapshot | all single-Space intake, so covered by the proposal's `loadSpaceSnapshot` |
| `duplicate-space-id` | Space ids | the candidate is keyed by id; cannot arise |
| `duplicate-resource-id` | Resource ids across Spaces | Resource ids unchanged, so the candidate has the stored ids |
| `meta-space-missing` | Space ids | unchanged |
| `space-resource-target-missing` | every Space Resource's `spaceId`, and the Space ids | both unchanged |
| `space-resource-map-missing`, `-graph-missing`, `-graph-outside-map` — this Space's own Space Resources | their `map`/`graph`, and the target's Map ids, Graph ids and ownership | selections unchanged; the targets are other Spaces, unchanged by this commit |
| the same three — other Spaces' Space Resources that target this Space | this Space's Map ids, Graph ids, and which Map owns each Graph | exactly what the widened boundary keeps |
| `space-resource-reference-cycle` | the `spaceId` graph | unchanged |
| `ordinary-space-unreferenced` | the set of referenced `spaceId`s | unchanged, so any error equals a baseline one and is filtered |
| incomplete deletion | delete changes | none |

So over a valid stored aggregate, `decideCommit` answers `write` with the same `committed` result for every update the widened fast path writes, and the fast path hands everything else to `decideCommit` itself. Nothing positions, Open state, Open Size, Edges, titles, colours or order feed into is read by any aggregate check. A Map or Graph deletion or rename of ids that another Space's Space Resource refers to changes the id sets, so it never reaches the fast path.

One divergence exists and is not widened in kind: when a *different* stored Space fails intake, the aggregate path raises `AggregateInvariantError` while the fast path, which never reads it, writes. That is the fast path's existing behaviour for renames and rests on the stored invariant above.

### Concurrency: the gap ticket 20 found, and one more

The fast path reads the edited Space without the aggregate lock and takes its row lock only at `#writeUpdate`. The revision comparison under that lock proves no *update* touched the Space in between. It does not prove the Space is the one that was read:

1. **Recreation at the same revision (ticket 20).** On PostgreSQL at READ COMMITTED, a `replaceAggregate` can commit between the fast path's read and its `writeDocumentUnderLock`, recreating the Space at revision 0. The fast path's `UPDATE` then finds the new row at revision 0 and writes a document decided against the old one. With the whole-`maps` comparison, that could already put the pre-replacement Maps over the replacement's. With the widened boundary the same write lands for every Map-internal Edit, the most frequent Edits there are. If the replacement changed the Space's Map or Graph ids, another Space's Space Resource then dangles and the stored aggregate breaks the invariant everything above rests on. This must be closed, not accepted.
2. **Deletion without a revision check.** The aggregate path deletes a Space with `deleteAllForSpace` and `deleteById`, which compare no revision under a lock. If a fast-path commit on that Space has written (and holds the row lock) but not yet committed when the delete's `decideCommit` reads, the delete passes at the old revision, waits on the row lock, and deletes the Space after the fast path commits. Both report success; no serial order gives that, because the delete would conflict after the edit. The aggregate stays valid (the delete removed every reference to the Space under the aggregate lock, and the fast path adds none), so this is lost work rather than corruption, but it is a non-serialisable outcome and widening makes it reachable from every Map Edit.

SQLite has neither gap: every repository operation on a file handle is queued by `serialise`, and a writer on another handle meets SQLite's file locks, which refuse a stale reader's write upgrade (`sqlite-contention.test.ts`).

**Decision: close both by serialising the fast path against aggregate decisions, without serialising fast paths against each other.** PostgreSQL's aggregate lock is a transaction-scoped advisory lock (`pg_advisory_xact_lock(1213812818, 1)`), taken by initialization, replacement, aggregate loading and the aggregate commit path. The fast path takes the same key in **shared** mode (`pg_advisory_xact_lock_shared`) before its read:

- A replacement, an aggregate commit or a deletion holds the exclusive mode, so a fast path waits for it to commit and then reads what it wrote (READ COMMITTED takes a new snapshot per statement). A fast path already holding the shared mode makes them wait for it to commit, and they then read its write and conflict on the revision.
- Fast paths share the lock, so independent Space edits still do not wait on each other or on the Meta row. Two fast paths on the same Space still meet at the row lock and revision comparison, and with recreation and deletion excluded, an unchanged revision under the row lock now does prove the Space is as read, which also discharges ticket 20's recorded gap for unchanged Resource rows.
- A fast path that hands the commit to the aggregate path must not ask for the exclusive mode while holding the shared one: two such commits would each wait for the other. So the fast attempt runs in its own transaction, and the aggregate decision runs in a second one, which reads everything afresh under the exclusive lock as it does today.
- SQLite's shared lock is a no-op, for the reason its exclusive one is.

Cost: one statement more per fast-path commit on PostgreSQL, none on SQLite, and fast paths now wait out an in-flight aggregate commit. This adds a member to `SqlStore`, which ADR 0095 asks a reason for: PostgreSQL needs a shared mode because READ COMMITTED lets an unlocked read interleave with a replacement; SQLite does not.

A re-read of the edited Space under its row lock was considered. It needs a new store member too (the existing `relock` writes a placeholder document), costs a second read, and does not close the deletion gap.

This needs no product decision and no new ADR: it keeps ADR 0095's one repository and one commit decision, and changes only which lock the fast path holds. `docs/agents/editing-and-persistence.md` says the fast path "remains independent of that lock", and is updated to say it shares it.

**Tests needed before implementation:**

- [x] A differential property: for generated Map-internal Edits, the widened fast path answers exactly what `decideCommit` answers over the full aggregate. `test/unit/sql-fast-path-decision.test.ts` (pure, in `verify`), plus three new scenarios in `test/support/aggregate-commit-differential.ts`.
- [x] A property that every Edit which changes a Map id, a Graph id, Graph-to-Map ownership or `defaultMap` still goes to the aggregate path. The same unit property.
- [x] A PostgreSQL concurrency test: a Map-internal fast-path commit races an aggregate-path commit that deletes a Graph another Space's Space Resource selects. The outcome must equal a serial order. Written (`test/support/fast-path-races.ts`, run by `test/integration/fast-path-races.test.ts`); passes on SQLite locally, and on PostgreSQL in CI's `postgres` job on PR #293 (run 36105448172, `fast-path-races.test.ts`: 6 passed).
- [x] The ticket 17 harness is re-run, with the before and after numbers recorded here

## Answer

**Design.** Implemented as the review decided.

- `preservesSnapshotBoundary` (`src/persistence/sql-space-repository.ts`) compares `selectableStructure` -- each Map id and each `mapId/graphId` pair, sorted -- instead of `JSON.stringify(maps)`. `defaultMap`, Resource ids and kinds, and Space Resource selections are compared as before.
- `SqlStore` gains `lockAggregateShared`. On PostgreSQL it is `pg_advisory_xact_lock_shared` on `lockAggregate`'s key; on SQLite it is a no-op, as `lockAggregate` is. The fast path takes it before its one-Space read.
- `#commitInTransaction` runs the fast path in its own transaction and, when that hands the commit on, the aggregate decision in a second one. They cannot share a transaction, because a transaction that holds the shared lock and then asks for the exclusive lock deadlocks against another one doing the same. Nothing is written before the hand-off.
- `decideTopologyPreservingUpdate` is exported so the unit property can call it. Its rules are unchanged apart from the boundary.
- `docs/agents/editing-and-persistence.md` now says the fast path holds the lock in shared mode, and no longer that it is independent of the lock.

**Tests.**

- `test/unit/sql-fast-path-decision.test.ts`, which runs in `verify`, uses an aggregate of Meta, T (two Maps, three Graphs) and S. Meta and S hold Space Resources selecting T's Graphs. fast-check generates sequences of 21 kinds of Map edit, 13 Map-internal and 8 structural, applies them to any of the three Spaces, and runs them at a matching or stale revision. For each case: a stale revision is answered with `decideCommit`'s answer; a snapshot whose selectable structure changed, or that fails intake, goes to the aggregate path; every other snapshot is written, and `decideCommit` over the whole aggregate also writes it with the same result. The oracle states "selectable" independently, as sets. The test asserts that all four branches were reached. Three examples pin moving positions, Open, Edges and Graph titles (written), and deleting or moving a Graph another Space selects (aggregate path, refused as `space-resource-graph-missing` or `-graph-outside-map`). Against the old boundary, the property and the Map-internal example fail. With Graph ownership dropped from the boundary, or with `defaultMap` dropped, the property fails.
- `test/support/aggregate-commit-differential.ts` gains `map-internal-update` (expected `committed`), `selected-graph-replaced` (expected `aggregate-refused`) and `graph-added` (expected `committed`). Each is compared memory against SQL on both databases. The expected kinds are asserted so that both sides failing intake together does not pass.
- `test/support/fast-path-races.ts` runs on SQLite (`sqlite-fast-path-races.test.ts`) and PostgreSQL (`fast-path-races.test.ts`). An instrumented `SqlStore` records the lock modes and holds one call until released. Six cases:
  - a Map-internal Edit takes only `shared`; a Graph deletion takes `shared` then `exclusive` and is refused;
  - a move that has read races a Graph deletion (with Meta retargeted): the deletion waits and then conflicts;
  - the reverse: a Graph deletion that has read races a move: the move waits and then conflicts;
  - a move that has read races a `replaceAggregate` that recreates A at revision 0 with new Map and Graph ids: the replacement waits and then replaces, and the stored aggregate passes intake. This is ticket 20's gap. Without the shared lock on PostgreSQL, the replacement would commit inside the pause and the move would write A's old ids over it;
  - a move held after all its writes races a deletion of A: the deletion waits and then conflicts. This is the deletion gap;
  - moves to different Spaces: on PostgreSQL the second commits while the first is held; on SQLite it waits in the per-handle queue.

  Every final state is checked with `loadAggregate`. On SQLite the second operation waits in `serialise`'s queue, so these cases prove the fixtures and the serial outcomes. The lock itself is only exercised on PostgreSQL, in CI.

**Measurement.** Method as in ticket 17: `pnpm exec tsx scripts/persistence-cost/measure.ts`, full matrix, 5 samples, SQLite and memory, Apple M2, Node v26.8.1. Load average was 16–17 before and 4–11 after, so the latencies are orders of magnitude only. The counts are deterministic.

| Edit, edited Space of 10 | aggregate beside it | path before → after | statements | rows read | snapshot parses | Resource docs parsed |
|---|---|---|---|---|---|---|
| move, Open, Resize, Add Edge | nothing | aggregate → **fast** | 12 → 8 | 18 → 4 | 9 → 3 | 63 → 30 |
| same | 10 × 100 | aggregate → **fast** | 12 → 8 | 1,038 → 4 | 39 → 3 | 3,093 → 30 |
| same | 40 × 100 | aggregate → **fast** | 12 → 8 | 4,098 → 4 | 129 → 3 | 12,183 → 30 |
| rename, body | any | fast → fast | 9 → 9 | 4 → 4 | 3 → 3 | 30 → 30 |
| stale move | any | fast (answer) | 1 → 1 | 1 → 1 | 2 → 2 | 30 → 30 |
| Add Resource | any | aggregate → aggregate | unchanged | unchanged | unchanged | unchanged |

The hypothesis holds. A Map-internal Edit now reads 4 rows and parses 3 snapshots however many Spaces sit beside it. At N = 1000 with nothing beside it, a move went from 12 statements / 1,008 rows / 6,003 docs to 8 / 4 / 3,000. Moving in an unrelated 100-Resource Space beside 40 × 100 went from 4,103 rows read to 4. A move is 8 statements where a rename is 9 because it writes no Resource row. Median latency, unreliable: at N = 10 beside 40 × 100, a move went from 85 ms to 1.2 ms; at N = 1000 alone, from 55 ms to 34 ms. The SQLite harness shows no extra statement for the shared lock, because it is a no-op there. On PostgreSQL it adds one `SELECT` per fast-path commit, which this checkout did not measure.

**Judgment calls.**

- `defaultMap` stays on the aggregate path, as the ticket proposed, although no aggregate check reads it. Widening it later is one line.
- Map and Graph order is compared as a set. No aggregate check reads order.
- Serialising the fast path against exclusive holders means a Map Edit now waits for an in-flight replacement or aggregate commit on PostgreSQL. That wait is what closes both gaps, and fast paths still never wait for each other.
- No ADR: this keeps ADR 0095's one repository and one decision, and gives the new store member the reason ADR 0095 asks for (`src/persistence/sql-store.ts`).
- The deletion gap predates this ticket, for renames. It is closed here rather than filed, because the same lock closes it.

### Merged with ticket 20's re-read under the row lock

`origin/cq-changed-resource-writes` gained 6193dd9e, which closes ticket 20's recreation gap in a different way. `#writeUpdate` now re-reads the Space's Resource rows through `Space.loadWithResources` once the revision holds under the row lock, and judges which Resources to write against those rows. The shared contract cases `recreatingBeforeRowLock` recreate the rows inside the commit's transaction, just before `writeDocumentUnderLock`, on both commit paths. This branch merges that commit. Both mechanisms are kept.

- **The shared aggregate lock is not made redundant by the re-read.** The re-read fixes only which Resource rows a commit writes. It does not cover three things:
  - The fast path decides the boundary against the Space it read before the lock. A replacement that recreates the Space with new Map or Graph ids at revision 0 would still have its document overwritten by one carrying the old ids, and the Space Resources in other Spaces would then dangle.
  - Deleting a Space that a written but uncommitted fast path has moved: the delete still passes at the old revision.
  - The races in `test/support/fast-path-races.ts` cover all of the above.
- **The re-read is partly redundant given the shared lock, and I left it in on purpose.** Against this repository's own operations it adds nothing. Every replacement, initialization, deletion and aggregate commit holds the aggregate lock exclusively, and both commit paths read under it (the fast path in shared mode), so none of them can recreate rows between a commit's read and its row lock. It still holds for a row changed by anything that does not take the lock: another process, a raw write, or the contract's in-transaction simulation. The simulation runs inside the commit's own transaction, so the lock cannot exclude it. That is also why the contract cases pass with or without the lock. The cost is one `select` of the edited Space's Resource rows per committed update. The `#writeUpdate` doc comment now states both guarantees.
- **Harness numbers.** The before/after table above was measured before this merge. Ticket 20's re-run records the re-read's cost: one more statement per committed update, and no change to rows written or to parses. A Map-internal fast-path commit therefore costs 9 statements rather than 8. Its reads still do not grow with the rest of the aggregate. A quick re-run after the merge is recorded below.

Quick re-run after the merge: `PERSISTENCE_COST_QUICK=1 PERSISTENCE_COST_SAMPLES=1`, SQLite, N = 10, with nothing beside the Space and with 2 × 10 Spaces beside it.

| Edit | path | statements | rows read | snapshot parses |
|---|---|---|---|---|
| move, Open, Resize, Add Edge | fast | 9 | 5 | 3 |
| rename, body | fast | 10 | 5 | 3 |
| stale revision | fast (answer) | 1 | 1 | 2 |
| Add Resource | aggregate | 14 | 19 and 43 | 9 and 15 |

A Map-internal Edit's statements, rows read and parses are identical at both aggregate sizes.


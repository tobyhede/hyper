# 21: Keep Map-internal Edits on the commit fast path

**Priority:** P2 — measured cost that grows with the whole aggregate, not the edited Space

**Status:** needs-triage. The measurement supports the change. The invariant argument below needs review before it is built.

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

**Invariants: why the widening holds (review this):** `loadSpaceAggregate` (`packages/graph/src/space-aggregate.ts`) reports cross-Space errors only for Space ids, Resource ids, Space Resource targets and cycles, and for a Space Resource's `map`, `graph` and graph-in-map (`space-resource-map-missing`, `-graph-missing`, `-graph-outside-map`). None of them reads positions, Open state, Open Size, Edges, titles or colours. The fast path already runs `loadSpaceSnapshot` on the proposed snapshot, so Edges stay closed over Map membership and geometry stays valid within the Space. Meta reachability (`ordinary-space-unreferenced`) depends only on Space Resource `spaceId`s, which the boundary keeps. The fast path takes no aggregate lock. A concurrent aggregate-path commit that deletes this Space or retargets a Space Resource works only on Map and Graph ids, which this path does not change. The row lock in `#writeUpdate` still detects a racing commit to the same Space.

**Tests needed before implementation:**

- [ ] A differential property: for generated Map-internal Edits, the widened fast path answers exactly what `decideCommit` answers over the full aggregate. Extend `test/support/aggregate-commit-differential.ts`.
- [ ] A property that every Edit which changes a Map id, a Graph id, Graph-to-Map ownership or `defaultMap` still goes to the aggregate path
- [ ] A PostgreSQL concurrency test: a Map-internal fast-path commit races an aggregate-path commit that deletes a Graph another Space's Space Resource selects. The outcome must equal a serial order.
- [ ] The ticket 17 harness is re-run, with the before and after numbers recorded here

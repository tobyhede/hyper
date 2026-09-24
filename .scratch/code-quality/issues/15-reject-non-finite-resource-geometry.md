# 15: Reject non-finite Resource geometry

**Priority:** P2 — confirmed validation defect

**Status:** resolved

**Blocked by:** None

**Problem:** `mapPositionSchema` and `openSizeSchema` in `packages/core/src/schema.ts` accept infinite values. JSON `1e400` parses to `Infinity`, so this is reachable from serialized input rather than only from a TypeScript caller.

**Evidence:** The source-audit probe decoded an update containing `"x":1e400`, passed `loadSpaceSnapshot`, and committed it through `MemorySpaceBackend`. Serializing that snapshot converted infinity to `null`, after which intake failed. `toJsonValue` in `src/persistence/sql-store.ts` rejects the same document with `JSON numbers must be finite`. The SQL converter protects the database; this is not evidence of SQL data corruption. It is an inconsistent domain boundary that accepts a value storage cannot represent.

**What to build:** Require finite coordinates and finite remembered Open Size dimensions at the schema boundary, shared by every intake. Keep existing lower bounds for Open Size. Do not invent coordinate bounds or change the placement algorithm in this fix.

- [x] Regression tests reject positive and negative infinite coordinates and infinite dimensions, while preserving valid negative coordinates and minimum sizes
- [x] A wire request using numeric overflow is refused before repository mutation
- [x] Direct snapshot intake and the memory commit path reject the same invalid geometry
- [x] Accepted finite geometry retains a valid JSON encode/decode round trip
- [x] The SQL converter remains a defensive boundary; domain acceptance no longer relies on its later throw
- [x] Core, graph, HTTP and persistence tests pass

**Resolution:** `mapPositionSchema` now requires finite `x` and `y`, and `openSizeSchema` requires finite `width` and `height` ahead of its existing minimums, in `packages/core/src/schema.ts`. Every intake parses through those schemas, so the wire decoder, `loadSpaceSnapshot` and the memory commit path all refuse the value before any repository changes. No coordinate bounds were added and placement is unchanged; no tracked fixture held non-finite geometry, so nothing rolls forward.

Evidence:

- `packages/core/test/schema.test.ts` (`non-finite geometry`): positive and negative infinity and `NaN` in either coordinate, infinite Open Size dimensions on Open and Closed placements, and a `JSON.parse` of `1e400` are refused; negative coordinates and the minimum Open Size are kept; accepted finite geometry survives a JSON encode/decode round trip.
- `packages/graph/test/space-snapshot.test.ts`: `loadSpaceSnapshot` refuses a decoded `1e400` coordinate and an infinite Open Size as `invalid-shape`.
- `packages/persistence/test/memory-backend.test.ts`: `MemorySpaceBackend.commit` does not commit an infinite coordinate and the stored Space is unchanged.
- `packages/http/test/space-http-app.test.ts`: a `POST /api/spaces` body carrying `"x":1e400` answers `invalid-request` naming the position, and the repository's `commit` is never called.
- `test/unit/sql-json-value.test.ts`: `toJsonValue` still throws `JSON numbers must be finite`, so the SQL converter stays a defensive boundary rather than the one that decides acceptance.

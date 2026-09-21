# 40 — A Revision cannot be constructed out of range

Status: needs-triage
Tags: Cleanup, release/v1
Blocked by: None.

Recommended sequence: after ticket 31's Part A settles failure vocabulary. This is coordination, not a prerequisite to investigating the Revision design.

Audited: 2026-09-20 against `b1ac983d`. Bare-bigint Revision values and the codec remain. Module ownership and the ceiling-advancement outcome still need design decisions, so this remains `needs-triage` on the release roadmap.

Surfaced by: the architecture review of 2026-09-20 (candidate D).

## The defect

`CONTEXT.md` defines a Revision exactly: "a non-negative integer no larger than 2^63−1", "only ever compared for equality and advanced, never ordered or measured". In the code it is a bare `bigint`, and the rule lives in a codec that throws. So every call site has to know which error identity its failure should wear, and that knowledge is held only in doc comments.

`src/persistence/sql-space-repository.ts` carries three reclassification catches: `decodeRevisionReclassified`, `encodeNextRevisionReclassified`, and `#loadStoredSpaceRowForCommit`. `storedRevisionInvariant` is a shared error constructor, not a fourth catch. The load helper wraps a complete stored-Space read, not only a codec call; unrelated failures propagate.

**The identity a call site's failure wears is a question this code keeps re-answering.** `markExported`'s encode was classified as `AggregateInvariantError` by `bf58db05` and unclassified again by `1356f46e` one commit later, on the correct ground that the value is the caller's argument and nothing has read or written it against either database when the encode runs. Two commits, two answers, for one call site — and the question only arises because a Revision out of range is representable at all. That churn is the argument for this ticket, more than any single wrapper is.

What remains once that call site is settled:

- **Which call sites classify is a rule in prose.** `#loadStoredSpaceRow` calls the raw codec deliberately (`:305-307`), `#loadStoredSpaceRowForCommit` wraps the same call, and the two have the same signature. Nothing but a doc comment says which a new caller should reach for.
- **A raw call is safe by argument, not by type**: `#createStoredSpace`'s `encodeStoredRevision(0n)` (`:655`) cannot throw because `0n` cannot exceed the ceiling. Nothing records that.
- **No test asserts either surviving sentence.** `grep` for "revision is not usable" outside `.scratch` returns only the two source lines (`:89`, `:119`); every test on these paths asserts the type alone. The distinction the wrappers draw is unobservable to the suite and to every production reader.

`packages/persistence/src/revision-codec.ts:26-29` still describes `#loadEverySpace` as admitting `RevisionCodecError` "rather than widening its catch to every error"; that catch was widened to unconditional in `5de390f3`, so the codec's own doc comment states the opposite of the code it describes.

## What to build

A Revision module that owns construction, equality, advancement and encoding rules. Valid construction can remove repeated range checks on trusted values, but cannot remove failure classification: malformed stored text and invalid caller input have different origins, and a valid Revision at 2^63−1 still cannot advance. `committedRevision` currently adds `1n`; its ceiling outcome must be decided explicitly rather than promised away by a constrained type.

ADR 0095's storage decision is unchanged: canonical non-negative decimal TEXT on both databases, one format, one ceiling.

- [ ] The domain rule lives in one module: non-negative, no larger than 2^63−1, compared for equality and advanced. Out-of-range is unconstructable rather than caught.
- [ ] **Where that module lives is this ticket's to decide, and the tension is real.** Revision is domain vocabulary (`CONTEXT.md`), which argues for `@project/core`; the codec is storage intake and today sits in `@project/persistence`, whose `LoadedSpace.revision` is the type in question. Record which and why.
- [ ] Concentrate repeated classification where the failure's origin is known. Preserve the distinction between malformed stored input, an invalid `markExported` caller argument and failed advancement of a valid ceiling Revision. Delete catches only where the new guarantee makes them unnecessary; do not map all three situations to broken stored state by default.
- [ ] Decide and prove the ceiling-advancement outcome across SQL and memory. A constrained value alone is insufficient; any change to the current SQL `AggregateInvariantError` answer is a deliberate behaviour change and must be recorded as such.
- [ ] `revision-codec.ts`'s doc comment stops contradicting `#loadEverySpace`'s catch. Fix it here or in 31, but not in neither.
- [ ] `CANONICAL_DECIMAL`'s other consumers keep working: `http-protocol.ts`'s wire parsing and `packages/http/src/backend.ts`'s `Retry-After` bound, which shares the pattern for a different reason its own comment states.
- [ ] Preserve the existing shared SQL revision proofs: above-safe-integer round trip, overflow rollback, non-canonical stored revision, above-ceiling stored revision and corrupt fast-path candidate. Those cases use `writeRawRevision` and skip memory, so they do not prove memory's range behaviour. Add evidence through the Revision interface and affected memory operations for the selected design; do not describe a changed failure outcome as a behaviour-preserving refactor.

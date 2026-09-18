# 28 — decideCommit answers the stored Spaces a write produces

**What to build:** A `write` decision carries the complete set of stored Spaces the commit produces, and `decideCommit` accepts what an implementation read in any order. The two memory implementations install that set instead of re-deriving it, and no caller sorts before calling.

**Blocked by:** None — can start immediately. Stack it on the branch carrying ADR 0097 (tickets 24–25 of the multi-Space Edit work), the only point in the stack where every `decideCommit` caller exists.

**Status:** resolved

**Why:** ADR 0095 made `decideCommit` the one place a commit is judged, and it already builds the candidate stored state it validates — then drops it, answering `write` with the result alone. `MemorySpaceBackend` and `MemorySpaceRepository` each re-run the same apply loop to rebuild that state, so the rule that a commit carries a Space's `exportedRevision` forward is written three times. And `decideCommit` requires `stored` ascending by id, because an `invalid-space-snapshot` refusal names its Space by position. Every caller that does not read through an ordered query has to sort first: both memory implementations and the Session registry's pre-commit check each carry a copy of the sort, and that precondition has already produced one bug (ticket 20). This is an architecture-review finding (2026-09-18) that refines ADR 0095's module without changing any decision it records; no ADR.

The decision's shape, agreed in review:

```ts
type CommitDecision =
  | { readonly kind: 'answer'; readonly result: RepositoryCommitResult }
  | {
      readonly kind: 'write';
      readonly result: RepositoryCommitResult;
      /** Every stored Space once the commit lands, ascending by id. */
      readonly spaces: readonly LoadedSpace[];
    };
```

- [x] Red first, at `decideCommit`'s own interface: a created Space lands at revision `0`; an updated one at `expectedRevision + 1`; a deleted one is absent; an updated Space keeps its stored `exportedRevision` and a created one has `null`; `spaces` is ascending by id; and `stored` passed out of id order still yields the `snapshotIndex` an id-ordered read would.
- [x] `decideCommit` sorts `stored` itself. Its doc comment drops the ordering precondition and states that `spaces` shares the `stored` values it was given — as a `conflict` already does — so an implementation that must not hand out its own state passes copies.
- [x] `MemorySpaceBackend` and `MemorySpaceRepository` install `decision.spaces` on `write` and their apply loops are deleted, with their imports of `committedRevision`.
- [x] The caller-side sorts before `decideCommit` are deleted — both memory implementations and the Session registry's pre-commit check, whose comment explaining the sort goes with it.
- [x] The SQL adapters are unchanged: they write rows and ignore `spaces`. `committedRevision` stays exported for them.
- [x] `spaceRepositoryContract` and the memory backend's own tests pass unchanged.
- [x] Ticket 24 notes that `write.spaces` exists and the one SQL repository deliberately ignores it.
- [x] `pnpm verify` is green. `pnpm e2e` is inapplicable — nothing a browser observes changes — and the report says so.

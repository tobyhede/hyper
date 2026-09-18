# The fast path commits where the commit decision refuses

Status: open
Tags: Defect
Blocked by: None — can start immediately.

Surfaced by: a CodeRabbit review of PR #234 (18 September 2026), then read against the code. The behaviour predates that PR; what the PR added is the written claim that it cannot happen.

## The defect

`decideCommit` refuses a commit outright when the repository has no Meta identity: with `metaSpaceId === undefined` it answers `rejected` / `invalid-commit` / "The repository has no Meta Space" (`packages/persistence/src/commit-decision.ts:141-150`), after conflicts and before any aggregate intake.

The SQL fast path never learns the Meta identity. `decideTopologyPreservingUpdate(change, current)` takes the change and the one stored Space it names, nothing else (`src/persistence/topology-preserving-update.ts`), and its caller reads that Space with `loadStoredSpace` alone. In `#commitInTransaction` the fast path runs *before* `lockMetaIdentity` (`src/persistence/postgres-space-repository.ts:606-610`); the SQLite repository calls the same shared helper (`src/persistence/sqlite-space-repository.ts:323-325`).

So against a store holding Space rows with no `RepositoryState` row, a single update that names an existing Space, matches its revision and preserves the snapshot boundary takes the fast path and **commits**, where the same request through the complete-aggregate decision is **rejected**.

That state is reachable rather than hypothetical: `truncateHyperContent` deletes the `RepositoryState` row first and the Space rows after, so an interrupted truncation leaves exactly it, and the repository already models Spaces-stored-without-Meta as a state worth testing (`test/integration/postgres-space-repository.test.ts`, the "without Meta" cases).

## Why it matters more than its size

Two documents now assert this cannot happen.

- `src/persistence/topology-preserving-update.ts`'s own doc comment: the fast path "answers only what the complete-aggregate decision would answer the same way — a revision conflict, or a write that moves no snapshot boundary — and hands everything else to that decision."
- ADR 0095, third paragraph: "That path runs only after the same identity refusal `decideCommit` begins with, and it hands a snapshot failing intake to the complete-aggregate decision, so no implementation answers a refusal differently."

ADR 0095 is `Status: accepted`, so that sentence cannot be softened — `docs/agents/workflow.md` allows an accepted ADR only its status-line edit. The code is therefore the side that has to move, or a new ADR has to record why the divergence is acceptable.

## The open design question

The fast path holds no singleton lock on purpose, and its own comment says so: it "deliberately holds no singleton lock: another commit — fast or slow — can move the row in between, and the conflict it then raises rolls this transaction back". Passing the Meta identity in must not undo that.

`loadMetaSpaceId` is a plain read rather than `lockMetaIdentity`'s lock, so reading it costs a statement and no serialisation — but whether an unlocked read is *sound* here is the decision this ticket has to take, not assume. A Meta row written between the read and the write would make the fast path refuse something the slow path would have allowed, which is the safe direction; the reverse ordering is the one to reason about.

## Not yet established

No test exercises this. The divergence above is derived from reading the three files named, not from a run — the first checklist item is to make it fail before changing anything.

- [ ] A failing test: against a store with Space rows and no `RepositoryState` row, a boundary-preserving single update at the expected revision is answered `rejected` / `invalid-commit`, and today is answered `committed`. Run it against both SQL targets, since both call the shared helper.
- [ ] Decide whether the Meta identity is read unlocked in the fast path or the fast path is skipped when Meta is absent, and record the reasoning where a reader will meet it.
- [ ] Apply the decision so `decideTopologyPreservingUpdate` cannot answer `write` for a store with no Meta identity, keeping the no-singleton-lock property the fast path exists for.
- [ ] Confirm the two claims quoted above are true afterwards, or record a new ADR saying why the divergence stands. ADR 0095 itself is not editable.

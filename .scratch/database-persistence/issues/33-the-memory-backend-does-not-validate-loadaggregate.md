# 33 — The memory backend's `loadAggregate` does not validate its aggregate

Status: wontfix

Tags: Defect

Blocked by: None.

Surfaced by: ticket 30's own deferral ("Validating in `loadAggregate` is a separate follow-up"), which named a follow-up but pointed it at no ticket. Read against the tree in a review of the resolved ticket set for a deferred tail with nowhere to land (2026-09-20).

## The gap

`packages/persistence/src/repository.ts`'s doc comment on `AggregateInvariantError` states the invariant as universal: "Every implementation of the seam raises it — the one SQL repository (`SqlSpaceRepository`, ADR 0095) and the memory double alike — or a memory-backed test proves nothing about the database."

That holds for `test/support/memory-space-repository.ts`'s `MemorySpaceRepository` (the `SpaceRepository` double used for server-side/start-up tests): its `loadAggregate` runs `loadSpaceAggregate` over the seeded Spaces and Meta id and rejects with `AggregateInvariantError('Stored aggregate violates Meta invariants')` when intake fails, and separately rejects `AggregateInvariantError('Stored Spaces exist without a Meta Space')` when Spaces are seeded with no Meta id at all (`withoutMetaIdentity`) — matching `SqlSpaceRepository`.

It does not hold for `packages/persistence/src/memory.ts`'s `MemorySpaceBackend` (the browser-safe `SpaceBackend` double behind `dev:new`, `dev:fixture` and the E2E memory repository). Its `loadAggregate` is:

```ts
loadAggregate(): ReturnType<SpaceBackend['loadAggregate']> {
  return Promise.resolve({
    kind: 'loaded',
    aggregate: {
      metaSpaceId: this.#metaSpaceId,
      spaces: [...this.#spaces.values()]
        .map(read)
        .sort((left, right) => ascendingById(left.snapshot, right.snapshot)),
    },
  });
}
```

It answers `{ kind: 'loaded', ... }` unconditionally, for whatever `#metaSpaceId`/`#spaces` the constructor (or `asMeta`) was given — including a `#metaSpaceId` that names no Space in `#spaces` while `#spaces` is non-empty, the "Spaces without Meta" state both `MemorySpaceRepository.loadAggregate` and the SQL repositories refuse. It never calls `loadSpaceAggregate` and never raises `AggregateInvariantError`. `packages/persistence/test/backend-contract.ts`'s `spaceBackendContract` (the one shared contract for `SpaceBackend`) exercises only a single well-formed seed — nothing in it asserts the invariant, so nothing currently catches the gap between the doc comment's claim and this implementation.

Ticket 30 (resolved) named exactly this and deliberately left it alone: "No aggregate validation is added: a seed that names a Meta but holds no Spaces, used only as a commit sink, stays legal. Validating in `loadAggregate` is a separate follow-up." **The carve-out that has to survive whatever this ticket does**: an empty `#spaces` with a named `#metaSpaceId` — a fresh backend before its first commit, used only as a commit sink — is legal today and ticket 30 decided it should stay legal. That is not the "Spaces without Meta" state; it is no Spaces at all. This ticket is about the case ticket 30 did not decide either way: `#spaces` non-empty and `#metaSpaceId` naming none of them.

## Why it might matter, and why it might not

- The doc comment's "and the memory double alike" is currently false for one of the two memory doubles, and it does not say which double it means when there are two. A reader who trusts it at face value — to conclude, say, that a `MemorySpaceBackend`-backed test proves something about the "Spaces without Meta" classification `src/http/space-host.ts`'s `readAggregate` or ticket 31's readers depend on — is trusting a claim this code does not hold.
- `MemorySpaceBackend` is confined to isolated development and E2E runs (AGENTS.md), never a stored/production path, so a caller constructing it with a mismatched Meta id is a test- or fixture-authoring error, not stored-state corruption a deployment can reach the way ticket 27's PostgreSQL/SQLite cases can.
- It is not currently a known correctness bug in the sense of an observed wrong answer in a real flow. Hundreds of call sites construct `MemorySpaceBackend`/`MemorySpaceBackend.asMeta` across `packages/app/test`, `packages/persistence/test` and `test/support`; none was read individually for this ticket, and whether any relies on the unvalidated shape is the first checklist item below, not something asserted here.

## Acceptance (draft, for whoever picks this up)

- [ ] Grep every `new MemorySpaceBackend(...)` and `MemorySpaceBackend.asMeta(...)` call site (`grep -rn "new MemorySpaceBackend(\|MemorySpaceBackend\.asMeta("`) and confirm none currently relies on the unvalidated shape — a `metaSpaceId` that resolves to no stored Space while `#spaces` is non-empty. Record what was found before changing behaviour under any of them.
- [ ] Decide whether `MemorySpaceBackend.loadAggregate` should run the same `loadSpaceAggregate` intake `MemorySpaceRepository.loadAggregate` and `SqlSpaceRepository` run, and reject with `AggregateInvariantError` for the same two shapes: Spaces stored without Meta, and an aggregate that fails complete intake. The commit-sink case (`#spaces` empty, `#metaSpaceId` set) stays legal either way — ticket 30 already decided that, and this ticket does not reopen it.
- [ ] If validation is added, `packages/persistence/test/backend-contract.ts`'s `spaceBackendContract` gains a case for it, or the harness gains a deliberate way to construct the invalid shape (the way `MemorySpaceRepository.withoutMetaIdentity` is named and deliberate rather than a second constructor argument meaning), so the shared contract — not just `SqlSpaceRepository` and `MemorySpaceRepository` individually — proves the doc comment's claim for both doubles.
- [ ] If validation is not added, correct `packages/persistence/src/repository.ts`'s `AggregateInvariantError` doc comment: it currently says "the memory double" as if there were one, and asserts a behaviour this one does not have. Say which double it means, or that it means both and record why `MemorySpaceBackend` is the deliberate exception.
- [ ] `pnpm verify` is green. `pnpm e2e`/`pnpm e2e:fixture` also, if `MemorySpaceBackend`'s observable behaviour changes for any seed the tracked fixture or `dev:new`/`dev:fixture` construct.

## Comments

**Audit, 2026-09-21 — closed `wontfix`: the premise does not hold.**

- `MemorySpaceBackend` implements the browser-side `SpaceBackend` (`packages/persistence/src/backend.ts`), not `StoredSpaceRepository`. `AggregateInvariantError`'s doc comment speaks of "every implementation of the seam" — the stored seam — so it never covered this class.
- It is not behind `dev:new`, `dev:fixture` or E2E. Those run `test/support/e2e-http-runtime.ts` over `E2eMemorySpaceRepository`, which extends `MemorySpaceRepository` and already validates. `MemorySpaceBackend` is constructed only in tests (`packages/app/test`, `packages/persistence/test`, `test/support/aggregate-commit-differential.ts`).
- Its production counterpart is `HttpSpaceBackend`, whose `loadAggregate` throws a plain `Error` on a non-2xx response and never raises `AggregateInvariantError`. Making the memory double raise it would make it disagree with the backend it stands in for.
- The one true part — "the memory double" did not say which of two — is fixed in the same change: the doc comment now names `MemorySpaceRepository`.

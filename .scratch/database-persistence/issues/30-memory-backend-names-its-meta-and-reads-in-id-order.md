# 30 — The memory backend names its Meta and reads in id order

**What to build:** `MemorySpaceBackend` is always told which Space is Meta — never infers it from where a Space sits in its seed — and answers every read with Spaces and Things in id order, as `MemorySpaceRepository` and both SQL adapters already do.

**Blocked by:** 28 — decideCommit answers the stored Spaces a write produces. Stack it on that branch.

**Status:** resolved

**Why:** ADR 0078 forbids inferring Meta from array position and holds every implementation to one observable behaviour. `MemorySpaceBackend` still does both things it forbids. With no Meta id its constructor takes the first seeded Space, or a zero UUID when there is none — and since ticket 20 routed its commits through `decideCommit`, that guess decides whether a commit is `aggregate-refused`, so the same Spaces seeded in another order behave differently. `MemorySpaceRepository` refuses exactly this guess. And its reads answer in insertion order until its first commit, then in id order after it (ticket 28 installs `decideCommit`'s id-ordered `spaces`), while every other implementation answers in id order throughout. This is an architecture-review finding (2026-09-18); it applies ADR 0078 and records no new decision.

The constructor's shape, agreed in review:

```ts
new MemorySpaceBackend(metaSpaceId: UUID, spaces?: readonly LoadedSpace[], control?: MemorySpaceBackendTestControl)
MemorySpaceBackend.asMeta(loaded: LoadedSpace, control?: MemorySpaceBackendTestControl)
```

`asMeta` is not a guess: in a one-Space aggregate that Space is the only valid Meta.

- [x] Red first, at the backend's own interface: `asMeta(loaded)` answers `loadAggregate` with that Space as Meta; Spaces seeded out of id order come back in id order from `listSpaces` and `loadAggregate` before any commit; a snapshot whose Things are out of id order comes back with them in id order from `loadSpace` and `loadAggregate`. Removing the guess needs no test — the old call shapes stop typechecking.
- [x] The Meta id is required. Inferring it from the first seeded Space and the zero-UUID fallback are deleted.
- [x] The test control has one position, after the Spaces. The overload that also accepted it in the second slot is deleted, with the test and comment that existed to defend it.
- [x] Every construction that relied on the guess moves to `asMeta` or names its Meta explicitly. Constructions that already name Meta are unchanged.
- [x] No aggregate validation is added: a seed that names a Meta but holds no Spaces, used only as a commit sink, stays legal. Validating in `loadAggregate` is a separate follow-up — ticket 33.
- [x] If ordering Things by id breaks a significant number of app tests that depend on snapshot order, stop and report rather than rewrite them. (One test relied on incidental order — the leftover `MemorySpaceBackend` insertion-order behaviour this ticket removes — and not on a domain ordering concept; it was adjusted to match Things by id rather than position. See report.)
- [x] The `SpaceBackend` contract and the memory backend's own tests pass.
- [x] `pnpm verify` is green. `pnpm e2e` is inapplicable — only a test double and tests change — and the report says so.

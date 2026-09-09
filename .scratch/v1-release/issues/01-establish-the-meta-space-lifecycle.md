# 01 — Establish the Meta Space lifecycle

Status: resolved
Tags: release/v1
Blocked by: none

**What to build:** Give each repository one permanent Meta Space whose identity
is repository state and whose reachability closure is the complete authored
aggregate.

- [x] Use `space-cards/03`'s singleton `metaSpaceId` repository state as the one
      Meta identity. It is not an authored Space field, inferred from graph shape
      or represented by the mutable nullable `spaces.entry` flag.
- [x] First repository initialization establishes the Meta identity through the
      repository's `initializeAggregate` operation, consumed by ticket 16's
      canonical Default Content generator. It does not use the compatibility
      `importSpaces` facade, the ordinary one-Card new-Space initializer, or
      silently seed an already initialized repository.
- [x] Opening the application without another destination opens the Meta Space's
      canonical URL, and reading is the whole of it. The root address never
      initializes: it reads the aggregate (`src/http/space-host.ts:118-127`) and
      answers `loadAggregate`'s `uninitialized` outcome with a 503
      `persistence-unavailable` problem naming the absent Meta Space
      (`:153-169`). Ticket 21 decided that (Option D, PR 162) — a safe method
      must not create durable authored state. Establishment belongs to start-up
      and its unbounded retry alone
      (`src/startup/database-startup.ts:136,156`,
      `src/http/postgres-http-runtime.ts:65`, and
      `test/support/e2e-http-runtime.ts:24` for the E2E host). Contradictory or
      invalid stored Meta state still fails explicitly.
- [x] Authored commits cannot change or delete `metaSpaceId`, and the Meta Space
      cannot be deleted through Space Card removal. Complete administrative
      import may establish or replace repository Meta state.
- [x] Creating an ordinary Space happens only through its first Space Card; no
      ordinary Space may remain outside the Meta reachability closure.
- [x] Remove Entry Space mutation and vocabulary from current implementation:
      retire `spaces.entry`, `setEntry`, `hyper entry` and startup selection by
      repository cardinality.
- [ ] Seeds, fixtures and canonical import/export identify the same Meta Space
      without inventing a second kind of Space.
- [x] Unit, HTTP, PostgreSQL and browser tests cover Meta initialization,
      canonical startup, invalid Meta state and deletion refusal. Ticket 16 owns
      the exact initialized aggregate and destructive reset evidence.

## Comments

### Criteria 1 and 4 were already built, and needed no code here

The aggregate foundation (PR 134, ADR 0077 and ADR 0078) landed both before this
ticket was picked up, and the audit that opened it confirmed each against the
tree:

- **Criterion 1.** `RepositoryState.metaSpaceId` is the singleton repository
  state, declared in `src/prisma/contract.prisma` with `onDelete: Restrict` and
  migrated by `20260831T0159_add_repository_state` and
  `20260831T1233_restrict_repository_state_meta_space`.
- **Criterion 4.** `packages/persistence/src/session-registry.ts` excludes the
  Meta Space from the deletion set and stops the cascade descending into it; the
  restraining foreign key holds it independently of any application code;
  `metaSpaceId` is written only under `lockMetaIdentity`, by `initializeAggregate`
  and by `replaceAggregate`, which is the allowed administrative replacement; and
  complete intake raises `meta-space-missing` for an aggregate the Meta identity
  no longer names.

The one gap was evidence at the repository seam, so this ticket added a shared
contract case — *refuses an authored commit that deletes the Meta Space* — which
both adapters now answer identically (`test/support/repository-contract.ts`).

### Criterion 2's Default Content, and criterion 7, stay with ticket 16

Criterion 2 has two halves. The *lifecycle* half is built: start-up establishes
Meta through `initializeAggregate` alone, and neither `importSpaces` nor the
ordinary new-Space initializer is reachable from a production creation path any
more. (When this was written the root address established it too. Ticket 21
removed that in PR 162, which narrowed the lifecycle rather than changing it.) The *content* half is ticket 16's
(`16-seed-and-restore-the-meta-space-default-content.md`) — ADR 0077's concise
examples of the V1 Card kinds, shared with the CLI hard reset.

The seam left for it is one named function in its own module:
`defaultContentAggregate(newId)` in `src/startup/default-content.ts`. It answers
the `AggregateInput` that initialization takes, and its doc comment names ticket
16 as its replacement. Today it mints the ordinary one-Card new Space (ADR 0018)
as the Meta Space; ticket 16 replaces the body and nothing else, because its one
caller — `establishMetaSpace` — already goes through it. Deliberately not a port,
a registry or an injected generator: it has one in-process implementation and one
caller.

Criterion 7 is unticked for the same reason. Seeds and fixtures already identify
one Meta Space rather than a second kind of Space — the tracked fixture and the
generated roadmap Space are imported and become Meta by being the first Space in
an empty repository, and the E2E runtime calls `establishMetaSpace` for a catalog
that asks for it (`options.startup === true`,
`test/support/e2e-http-runtime.ts:24`, conditional since `0a15bba6`); an imported
catalog is already initialized and needs no call — but "canonical import/export identify the same Meta Space" is the
aggregate round trip ticket 08 owns
(`08-round-trip-multi-space-import-and-export.md`), which also removes the
`importSpaces` compatibility facade. Ticking it here would claim evidence that
ticket's work has not produced.

### The browser still throws on `uninitialized`, deliberately

`createSpaceStartup` in `packages/app/src/space.ts` throws when
`loadAggregate` answers `uninitialized`, and it stays a throw. The browser cannot
initialize a repository — the seam the Fetch application consumes does not
declare initialization — and every server-side runtime has an initialized
repository before a document is served: `src/http/postgres-http-runtime.ts:65`
calls `establishMetaSpace` at composition and retries it, and
`test/support/e2e-http-runtime.ts:24` calls it for an empty catalog while an
imported one arrives initialized. So `uninitialized` reaching the browser means genuinely broken
repository state, and failing loudly is the right answer rather than a
browser-side initialization call.

### Contradictory stored Meta state is a 500, not a redirect

`loadAggregate` raises `AggregateInvariantError` for stored state no Meta
identity names — a named type on the shared seam
(`packages/persistence/src/repository.ts:36`), not the bare `Error` this
paragraph first described, so the wire behaviour turns on type rather than on
message prose. Ticket 21 made both halves of that precise, and one such error is
no longer the verdict: `readAggregate` takes the read again first
(`src/http/space-host.ts:80-88`), because a rival host committing between
`loadAggregate`'s two READ COMMITTED statements shows the same contradiction for
an instant. Only a second failure is reported, and the classification is a
ternary: an invariant failure answers `internal-error`, anything else answers
503 `persistence-unavailable` for a database that is merely unreachable
(`:149-151`). That keeps the reason in the answer — the previous behaviour
redirected to nothing, or handed Vite a bare stack.

### `newId` is threaded rather than defaulted

Establishment mints identities, so ADR 0016 applies: `defaultContentAggregate`,
`establishMetaSpace`, `resolveDatabaseStartup` and `createSpaceHost` all take
`newId` **required, with no default**, and the three composition roots supply it
explicitly — `src/cli/entry.ts`, `src/http/postgres-http-runtime.ts` and
`test/support/e2e-http-runtime.ts`. A default here would reinstate the ambient
generator behind the one owner's back, which is exactly the shape the ADR
rejects.

### Deferred

- Ticket 16: Default Content itself, the CLI hard reset, and destructive-reset
  evidence.
- Ticket 08: the aggregate round trip, and removing the `importSpaces`
  compatibility facade. This ticket only stopped *startup* from using it.
- `test/unit/current-domain-vocabulary.test.ts` gained no Entry Space guard. The
  vocabulary is gone from live source and from `CONTEXT.md`, but nothing scans
  for its return the way it does for Route and Walk. Adding one is a small,
  separable change if the term proves it needs a ratchet.

### Resolved, and what carries the one unticked criterion

Every criterion but 7 is built and ticked, and criterion 7 is explicitly owned by
ticket 08 (`08-round-trip-multi-space-import-and-export.md`) — it is the aggregate
round trip, and ticking it here would claim evidence this ticket's work never
produced. So there is no work left under this number, and the status moves from
`ready-for-human` to `resolved`.

The three body corrections above are why an audit had to read it again: criterion
3 and two comments still described the root address as the second thing that
establishes Meta, which ticket 21 removed in PR 162
(`50f6c20f`), and one comment described the E2E runtime as establishing for every
catalog, which has been conditional on `options.startup` since `0a15bba6`. The
criterion is now written against the built behaviour rather than the behaviour it
was accepted with.

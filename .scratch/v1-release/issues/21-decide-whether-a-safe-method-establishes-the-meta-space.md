# 21 — Decide whether a safe method establishes the Meta Space

Status: ready-for-agent
Tags: release/v1
Blocked by: none. This ticket was briefly marked as blocked by `v1-release/17`.
That mark was wrong and an audit removed it — see "Why ticket 17 does not
unblock this" below. The classification work is this ticket's own.

**Decided:** Option D. The root address must not write. Establishment moves out
of the request path, and `createApp` retries it. See "Decision" below for the
work.

**What was decided:** Whether the root address may write. `GET /` and `HEAD /`
both establish the Meta Space when the repository has none, so a safe method
creates durable authored state. Ticket 01 chose this for `GET` on purpose. It
did not decide `HEAD`.

## The problem

- The root handler admits two methods: `GET` and `HEAD`.
- It calls `establishMetaSpace` for both.
- That function creates the Meta Space when the repository has none.
- It mints four identities: the Space, its first Card, its Layout and that
  Layout's Graph. It then writes a Space row and the `repository_state` row.
- Thus `HEAD /` can write durable data. A safe method must not change data.

## Why the fault does not occur now

- Each runtime calls `establishMetaSpace` when it composes the host
  (`src/http/postgres-http-runtime.ts`, `test/support/e2e-http-runtime.ts`).
- The Vite plugin waits for that host before it serves a request.
- Therefore the Meta Space exists before the first request arrives, and the
  initialization branch does not run.
- PR 156 opened one narrow path. A failure to establish at composition is now
  logged instead of fatal, because a rejected host promise is memoized and
  breaks every later request. So this sequence is possible:
  - The database is down at start-up. The host logs the failure and continues.
  - The database returns.
  - The first request is a `HEAD` request. That request does the initialization.

## Why this is a decision and not a defect

- RFC 9110 requires `HEAD` to be identical to `GET`, without a body. A `HEAD`
  that does not initialize differs by more than the body.
- `packages/app/vite-space-http-plugin.ts` implements that rule deliberately:
  "A `HEAD` response carries no body; nothing else is elided".
- `GET` is also a safe method. Ticket 01 criterion 3 selected the
  GET-initializes design: "Opening the application without another destination
  opens the Meta Space." So the objection applies to the deliberate design, not
  only to `HEAD`.
- RFC 9110 permits side effects for a safe method. It says only that the client
  is not accountable for them.
- No correct status exists for a `HEAD` that refuses to initialize. 404 is
  wrong, because the root is not missing. 503 is wrong, because persistence
  operates correctly. 302 is wrong, because it needs a Space id that does not
  exist yet.

## The options

- **A — Keep the current behaviour.** The fault stays possible in the narrow
  path. No work, no risk, and the HTTP semantics stay correct.
- **B — Let `HEAD` read only.** Removes the write. Breaks the
  identical-minus-body rule. Does not correct the same behaviour in `GET`. You
  must invent a status for the no-Meta condition.
- **C — Remove initialization from the request path.** Only start-up then
  establishes the Meta Space. The most correct design. But it removes the
  recovery path: after PR 156, the root address is what repairs a host whose
  start-up establishment failed.
- **D — Remove initialization from the request path, and retry it there.**
  `createApp` already owns the failure: it catches, logs and continues. It can
  own the repair too, with a bounded retry. The root address then only reads.
  Option C's correctness, without the loss option C was rejected for.

## Decision

**Option D.** A safe method must not create durable authored state, and the
recovery path PR 156 added does not have to live on a safe method to survive.

Why not the others:

- Option A leaves a safe method writing. The sequence is narrow but real, and
  it does not become less real by being cheap.
- Option B corrects `HEAD` only, breaks the identical-minus-body rule, and
  leaves the same behaviour in `GET`.
- Option C was rejected for a reason that does not hold. It removes the repair
  because it moves establishment to start-up and stops there. Option D moves it
  to start-up and keeps retrying, so nothing is lost.

## What to build

- Remove the `establishMetaSpace` call from the root branch of
  `resolveProductRequest` (`src/http/space-host.ts`). The root address reads
  the aggregate and redirects. It never writes.
- Give the repository an identifiable invariant error. Today `loadAggregate`
  and `initializeAggregate` throw a bare `Error` for broken stored state, which
  is indistinguishable by type from a database that is down. The file already
  has the pattern — `SnapshotValidationError`, `DuplicateIdentityError`,
  `CardOwnershipError`, `StaleSpaceRevisionError`. Add one more beside them, in
  a module both the repository and `src/http/space-host.ts` can import.
  - Postgres sites: `src/persistence/postgres-space-repository.ts:576, 630,
    652, 687`.
  - Memory double: `test/support/memory-space-repository.ts:141, 148, 157`,
    which rejects with the same prose. The two implementations must agree, or
    a memory-backed test proves nothing about the database.
- Answer the uninitialized and the unreachable cases from that read, each with
  its own status. The wire behaviour must not turn on message prose.
- Add 503 to `ProductResponse`'s closed status set
  (`packages/http/src/product-destination.ts`), with its reason in the doc
  comment beside the other five. `GET /api/aggregate` already answers 503
  `persistence-unavailable` for this same throw
  (`packages/http/src/index.ts:387`), so the product half stops being the only
  half that can say it.

  Read that handler before citing it. It answers 503 for *every* throw, an
  invariant violation included. It does not classify either. An earlier draft
  of this ticket cited it as already doing the right thing; it does not. Fixing
  it is not in scope here, but do not copy it.
- Retry establishment in `createApp` (`src/http/postgres-http-runtime.ts`).
  Keep the existing rule that a failure is not fatal to composition: the host
  promise is awaited once and memoized, so a rejection is permanent.

## Acceptance

- [x] No safe method creates durable authored state. `HEAD /` and `GET /`
      both only read.
- [x] A host whose start-up establishment failed still recovers once the
      database returns, without a request causing the write.
- [x] The root address distinguishes a broken invariant from an unreachable
      database, and answers each with its own status.
- [x] `ProductResponse` states the reason for every status it admits.
- [ ] `pnpm verify` and `pnpm e2e` pass.

## Why ticket 17 does not unblock this

Two audits, 6 September 2026. Ticket 17 and this ticket describe two different
mechanisms.

- Ticket 17's refusal is a **returned value**. `loadSpaceAggregate` finds a
  topology problem in an attempted write and the caller receives
  `{ kind: 'aggregate-refused', errors }` as an ordinary result. Every one of
  ticket 17's six criteria is written about that path.
- This ticket needs a **thrown** error classified. Nothing in ticket 17's
  criteria gives `loadAggregate` an identifiable throw. An agent could satisfy
  every box in ticket 17 and leave the bare `Error` exactly as it is.
- The sentence linking the two lives in ticket 17's framing, not its
  acceptance. The framing was taken at face value when this ticket was written
  and is corrected here.

## Comments

### Where this came from

The multi-reviewer pass on PR 156 raised it, and it was recorded there as
`needs-decision` rather than fixed. The PR merged with the behaviour unchanged.
The reported reproduction — `curl -I` against a freshly migrated database — does
not occur, for the reason given above. The mechanism is real; only the stated
path was wrong.

### The follow-up that turned out to be this ticket

`src/http/space-host.ts` answered every failure of `establishMetaSpace` with one
fixed detail, because a broken invariant and an unreachable database both arrived
as an ordinary `Error`. Classifying them would have made the wire behaviour
depend on message prose.

This paragraph used to assign that work to ticket 17 and call it a precondition
for option C. Both halves were wrong, and the audit above corrects them: ticket
17 is about a returned refusal and would never have given `loadAggregate` an
identifiable throw. The classification is this ticket's, and it is built —
`AggregateInvariantError` is raised by both implementations of the seam, and the
root address answers a permanent defect with 500 and an unreachable database
with 503.

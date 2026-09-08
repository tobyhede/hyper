# 17 — Preserve structured aggregate refusals

Status: ready-for-human — criteria 1 and 5 contradict each other.
Why: an agent cannot satisfy criterion 5 without first reversing a decision the
code already records. That is a human call. See "Audit, 6 September 2026".
Tags: release/v1
Blocked by: none — its refusal transport is independent of renderer vocabulary
Related: `v1-release/21`. This ticket does **not** unblock it, although an
earlier version of both tickets said so. `21` needs a thrown error classified;
this ticket is about a returned refusal. The two are separate mechanisms and
`21` now owns its own classification work.

**What to build:** Preserve every aggregate refusal's stable identity and
location through coordinated session state and the application feedback surface
instead of flattening several errors into one joined string.

- [ ] Persistence state carries structured aggregate refusals without losing
      Space, Card, Layout, Graph or field location.
- [ ] Retry, conflict and permanent rejection remain distinct states; aggregate
      refusal is the `refused` persistence state and recovers through an authored
      correction, never Retry of the unchanged aggregate.
- [ ] `PersistenceControl` explains each actionable refusal without exposing
      storage or transport vocabulary and without colour as the only signal.
- [ ] Coordinated participants observe the same completed refusal and remain in
      valid recoverable state.
- [ ] Unit, application, stable story, Ladle E2E and Chromium evidence cover one
      refusal, several simultaneous refusals and location-specific feedback.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass.

## Audit, 6 September 2026

Two read-only agents audited this ticket against the tree. Every verdict below
carries file evidence. Roughly half of the ticket is already built.

### What is built

- **Criterion 1 — built.** `SpaceAggregateError`
  (`packages/graph/src/space-aggregate.ts:26`) is a 10-member union and every
  member keeps its Space, Card, Layout and Graph location through every hop:
  `repository.ts:20`, `backend.ts:52`, `http-protocol.ts` (encode and decode,
  all 10 kinds), `session-registry.ts:110`, `session.ts:17`, `memory.ts:214`
  and `postgres-space-repository.ts:851`. A real round-trip test covers all 10
  (`packages/persistence/test/http-protocol.test.ts:181`).
- **Criterion 3 — mostly built.** `AGGREGATE_REFUSAL_REASONS`
  (`packages/app/src/authoring-refusal.ts:261`) gives all 10 kinds a sentence
  and is pinned by `satisfies Record<SpaceAggregateError['kind'], string>`, so
  a new kind without a sentence fails the typecheck. The "not colour alone"
  rule holds: every refusal pairs a destructive variant with title text and an
  icon.

### What is not built

- **Criterion 2 — part built.** An aggregate refusal sits inside `rejected`
  beside `PermanentFailure` (`packages/persistence/src/session.ts:17`). There
  is no `refused` state in the session state machine. The `refused` at
  `session-registry.ts:101` belongs to the Space Card lifecycle result, a
  different state machine for a different operation. Do not read one as the
  other.
- **Criterion 3, two gaps.** Several refusals join into one string
  (`authoring-refusal.ts:283`). The non-aggregate path falls through to the raw
  `failure.message` (`PersistenceControl.tsx:55`), so `HTTP 403`,
  `Network request failed` and `application/problem+json` reach the same
  dialog the clean sentences do.
- **Criterion 4 — part built.** The coordinated multi-participant failure path
  is tested with `permanent-failure` only
  (`packages/persistence/test/space-card-lifecycle.test.ts:845`). The one
  `aggregate-refused` test there (`:270`) exercises the client-side pre-flight
  check, which returns before any participant session is touched.
- **Criterion 5 — about three quarters left.** No stable story, no Ladle E2E
  spec and no Chromium spec drives an `aggregate-refused` at all; the existing
  rejection story and specs all use `permanent-failure`. Location-specific
  feedback is the exception — it has an application test and a story, plus two
  evidence cells exempted on record in `parity-claims.ts:192` because the path
  is unreachable by browser gesture until `entity-url-addressability/08` ships.

### The contradiction a human must settle

- Criterion 1 asks that a refusal keeps its location. Criterion 5 asks for
  evidence of several simultaneous refusals.
- The presentation destroys both, deliberately. `describeAggregateRefusal`
  removes duplicates and joins the rest into one sentence, and its doc comment
  states the reason: the same sentence three times reads as three problems
  rather than one. The ids are dropped for the same stated reason.
- So criterion 5 has nothing to prove while that design stands, and criterion 1
  is satisfied in the transport and discarded at the surface.
- Decide which is wrong: the criteria, or the design. Then this ticket can go
  back to `ready-for-agent`. Until then an agent will implement half of it and
  stop.

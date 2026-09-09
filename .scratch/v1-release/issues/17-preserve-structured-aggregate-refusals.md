# 17 — Preserve structured aggregate refusals

Status: ready-for-agent
Why: the contradiction between criteria 1 and 5 was settled on 9 September 2026.
The one-sentence presentation stands for V1 — a refusal keeps its location on
the wire and the surface deliberately does not recite it — and criterion 5 is
narrowed to the evidence that is genuinely missing under that design. The
richer option is recorded below as post-V1 work. See "Audit, 6 September 2026"
and its correction.
Tags: release/v1
Blocked by: none — its refusal transport is independent of renderer vocabulary
Related: `v1-release/21`. This ticket does **not** unblock it, although an
earlier version of both tickets said so. `21` needs a thrown error classified;
this ticket is about a returned refusal. The two are separate mechanisms and
`21` now owns its own classification work.

**What to build:** Preserve every aggregate refusal's stable identity and
location through coordinated session state, and explain it at the application
feedback surface as one sentence rather than a joined list of transport strings.

**Reduced 2026-09-10.** `error-feedback-pattern/01` landed and took criterion 3
with it (see the audit below), and it moved the ground under criterion 2:
`rejected`'s two arms now each have their own copy, so what remains of the
`rejected`/`refused` split is the state machine and the recovery it names, not
the sentence. Criteria 2, 4 and 5 are what is left.

- [ ] Persistence state carries structured aggregate refusals without losing
      Space, Card, Layout, Graph or field location.
- [ ] Retry, conflict and permanent rejection remain distinct states; aggregate
      refusal is the `refused` persistence state and recovers through an authored
      correction, never Retry of the unchanged aggregate.
- [ ] `PersistenceControl` explains each actionable refusal without exposing
      storage or transport vocabulary and without colour as the only signal.
- [ ] Coordinated participants observe the same completed refusal and remain in
      valid recoverable state.
- [ ] Aggregate-refusal evidence reaches the **persistence rejection** surface:
      a stable story and its Ladle E2E spec drive a rejection whose failure is
      `aggregate-refused` rather than `permanent-failure`, and a Chromium spec
      drives a refused coordinated save end to end. This criterion asks for the
      one sentence to be proved on that surface, **not** for each error's
      location to be shown — criterion 1 keeps the location on the wire and the
      surface deliberately does not recite it (see "The decision, 9 September
      2026").
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass.

## Audit, 6 September 2026

Two read-only agents audited this ticket against the tree. Every verdict below
carries file evidence. Roughly half of the ticket is already built.

Line references were re-verified on 9 September 2026 and are current as written
here; where a position had moved since the audit, the number below is the
verified one.

### What is built

- **Criterion 1 — built.** `SpaceAggregateError`
  (`packages/graph/src/space-aggregate.ts:26-53`) is a 10-member union and every
  member keeps its Space, Card, Layout and Graph location through every hop:
  `packages/persistence/src/repository.ts:71`, `backend.ts:52`,
  `http-protocol.ts` (encode and decode, all 10 kinds),
  `session-registry.ts:110`, `session.ts:17`, `memory.ts:214`, and
  `src/persistence/postgres-space-repository.ts:666`, `:706` and `:876`. Two of
  those the audit misnamed: `repository.ts:20` is a doc comment, not the union
  arm, and the Postgres repository is not under `packages/` at all — the
  numbers above are the verified ones. A real round-trip test covers all 10
  (`packages/persistence/test/http-protocol.test.ts:181`). The wire keeps it
  too: `packages/http/src/index.ts:375` answers an `aggregate-refused` commit
  with `encodeCommitRefusal(result), 422` — the whole structured document, not a
  flattened message.
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
- **Criterion 3, two gaps — closed 2026-09-10 by `error-feedback-pattern/01`,
  not by this ticket.** The audit recorded that several refusals join into one
  string (`authoring-refusal.ts`, still true and still deliberate) and that the
  non-aggregate path fell through to the raw `failure.message` in both
  `rejectionDescription` and `PersistenceNotice`, so `HTTP 403`,
  `Network request failed` and `application/problem+json` reached the same
  dialog as the clean sentences. That second half is gone: every
  `retryable-failure` and `permanent-failure` code now has application-owned
  copy and no surface reads `message`. **Criterion 3 is met.** What this ticket
  still owns of it is nothing — re-read it before planning work against it.
- **Criterion 4 — part built.** The coordinated multi-participant failure path
  is tested with `permanent-failure` only
  (`packages/persistence/test/space-card-lifecycle.test.ts:845`). The one
  `aggregate-refused` test there (`:270`) exercises the client-side pre-flight
  check, which returns before any participant session is touched.
- **Criterion 5 — see the correction below. The audit's original verdict here
  was wrong.**

### Correction to criterion 5, 9 September 2026

The audit claimed no stable story, no Ladle E2E spec and no Chromium spec drives
an `aggregate-refused` at all. That is wrong for the first two, and the evidence
predates the audit.

- **A stable story does drive one.** `NewSpaceCardPaneRefused`
  (`packages/app/stories/components/space-card-panes.stories.tsx:106`) hands
  `NewSpaceCard` a refusal whose `code` is `aggregate-refused`
  (`:114`) carrying a `space-card-reference-cycle` error. Its parity claim is
  `new-space-card-keeps-a-refused-attempt-on-its-target-field`
  (`packages/app/stories/parity-claims.ts:187-198`, the `storyExport` at
  `:189`), and its Ladle E2E spec is
  `packages/app/ladle-e2e/space-card-panes.spec.ts:41`, which asserts the field
  is `aria-invalid` and the sentence "A space card would make a space contain
  itself." is visible.
- **It landed before the audit.** Commit `4776ed2e` ("feat: author a Space Card
  reference") is dated 2026-09-04; the audit was committed in `8b9c1d1a` on
  2026-09-07, three days later.
- **One refusal and several simultaneous refusals already have unit evidence.**
  `packages/app/test/persistence-control.test.tsx:11-39` renders a rejection
  carrying two *distinct* errors and asserts both sentences are visible while
  neither refusal kind is; `:41-59` pins the dedupe, two errors of one kind
  producing one sentence.
- **What is genuinely missing.** Aggregate-refusal evidence on the *persistence
  rejection* surface: `packages/app/stories/space/messaging.stories.tsx:13`
  (`SaveRejected`) is still a `permanent-failure`, so no story or Ladle spec
  drives an `aggregate-refused` through `PersistenceControl`. And no Chromium
  spec drives one at all — `grep -rn 'aggregate-refused' packages/app/e2e/`
  returns nothing. That, and only that, is what the narrowed criterion 5 asks
  for.
- **Location-specific feedback stands as the audit recorded it.** It has an
  application test and a story, with the evidence exemption on record at
  `packages/app/stories/parity-claims.ts:192-198`, because the path is
  unreachable by browser gesture until `entity-url-addressability/08` ships.

## The decision, 9 September 2026

The contradiction the audit surfaced was real: criterion 1 asks that a refusal
keeps its location, the transport does keep it, and
`describeAggregateRefusal` (`packages/app/src/authoring-refusal.ts:283-284`)
then deduplicates the sentences and joins them, dropping every id. The doc
comments at `:251` and `:280` record that as deliberate — a message reciting
UUIDs is less legible than one sentence about what is wrong, and the same
sentence three times reads as three problems rather than one. It is the sole
presentation path for both surfaces
(`packages/app/src/components/PersistenceControl.tsx:57` and
`authoring-refusal.ts:298`).

**The criteria were wrong, not the design.** The one-sentence presentation stays
for V1. Criterion 1 is about the wire and the session state, where the location
is preserved and round-tripped; criterion 5 is about evidence, and it now asks
only for what the standing design leaves unproved. Neither asks the surface to
show an id.

### Post-V1: one sentence plus the locations on request

Recorded, not scheduled. The richer option is to keep the single sentence as the
default and offer the per-error locations behind a disclosure — "which spaces?"
— so an author with several refused Spaces can find them without the default
message becoming a UUID recital.

Its cost is why it is not V1: **an id is not legible, so this needs a
Card-title lookup from an id.** Every member of `SpaceAggregateError` carries
UUIDs and nothing else (`packages/graph/src/space-aggregate.ts:26-53`), and the
Spaces a coordinated refusal names are not all open, so resolving a
`targetSpaceId` or a `cardId` to a title means a reader the refusal surface does
not have today. That is a new seam, not a formatting change, and it is the whole
of the work.

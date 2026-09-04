# Error feedback is one pattern

Source: investigation, 2026-09-04. Prompted by the proposal that persistence
error handling be extracted as the application-wide pattern for errors.

## What the investigation found

**The pattern already exists and is largely built.** ADR 0057 decides it: an
expected failure crosses every seam as a stable machine identity with typed
context, and the application maps that identity to the surface conducting the
interaction, owning the wording, the field attribution and the recovery.

The spine is in place. `AuthoringRefusal` (`packages/app/src/space-authoring.ts:204`)
is a closed union of 24 codes. `describeAuthoringRefusal`
(`packages/app/src/authoring-refusal.ts:7`) is the one place a code becomes a
sentence, and the exhaustive per-surface placement records beside it are the one
place each surface's field mapping lives — every record is
`Record<AuthoringRefusalCode, …>`, so a new code fails to compile until each
surface has said where it goes. The channels are deliberate and written down in
`docs/agents/ui.md`: `StatusFailure`/`StatusBusy` for a blocking operational
state, `AlertDialog` for a decision or recovery action, `Alert` for a standing
notice, `FieldError` for correctable input, and the screen-fixed
`.canvas-refusal` sentence for the one case with no surface left to attach to.
`docs/agents/authoring-refusal-cascade.md` caches the whole cascade.

**Persistence is not the pattern-setter. It is the one surface that departs from
it**, in three ways:

1. It keeps its own copy tables. `AGGREGATE_REFUSAL_REASONS`
   (`PersistenceControl.tsx:69`) and `CONFLICT_DESCRIPTIONS` (`:47`) do
   `describeAuthoringRefusal`'s job, inline in a component, with no placement
   concept.
2. It shows wire prose to the author. `retryable-failure` and
   `permanent-failure` carry a stable `code` *and* a `message`
   (`packages/persistence/src/backend.ts:53-63`); the UI renders the message
   (`PersistenceControl.tsx:154`, `:90`), which every arm of
   `packages/http/src/backend.ts` fills from the wire — `:182`, `:188`, `:199`,
   `:206`, `:211` and `:217` from `problem.detail`, and the catch arms (`:147`,
   `:153`, `:158`) from a thrown `Error` or a transport-owned literal. Their
   seven codes have no copy table at all.
3. `acceptStoredSpace` returns hand-written English *from inside Space
   Authoring* (`space-authoring.ts:1418`, `:1422`) — prose crossing the seam
   ADR 0057 is about.

So extracting persistence as the template would propagate the violation. The
work is the other direction: bring persistence onto the pattern the rest of the
application already follows, then close the two places the pattern is a
convention rather than a mechanism.

## Settled — do not re-litigate

- **No generic error envelope.** ADR 0057 rejected one spanning domain,
  application and HTTP, on the grounds that translating once at each seam keeps
  each module's interface in its own vocabulary. That reasoning is untouched by
  anything here.
- **The identity crosses the seam; the application owns the sentence.** This is
  ADR 0057 and it is the whole of the pattern. Every change below moves a
  surface onto it and none weakens it.
- **Which channel a refusal takes belongs to the surface conducting the
  interaction**, not to a central router. Four channels stay four channels; what
  is missing is not a decision point but a component for the one channel that
  never got one.
- **A refusal code is a domain identity, not a wording.** Renaming one is a
  change to the Authoring surface. `card-not-expanded` stays as it is spelled.

## The three changes

1. `issues/01` — bring persistence onto the refusal pattern: copy tables for
   the seven transport codes, no `problem.detail` on screen, codes rather than
   sentences out of `acceptStoredSpace`.
2. `issues/02` — every surface receives the identity, not the sentence. Four
   call sites take a pre-described `string` today — `01` owns the fifth — and
   three of them sit in the same props type as a structured sibling.
3. `issues/03` — the notice `Alert` becomes a component, the way
   `StatusFailure` already is. Closes the `AlertIcon` inconsistency by
   construction and gives the title voice one place to be decided.

## Relationship to the V1 release

`.scratch/v1-release/issues/17-preserve-structured-aggregate-refusals.md` is
`ready-for-agent` and owns the **aggregate** half of `01` — preserving each
aggregate refusal's identity and location through session state and
`PersistenceControl`. `01` here deliberately leaves that arm alone and takes the
retryable, permanent and `acceptStoredSpace` arms, which `17` does not name.
Whether any of this earns a `release/v1` tag is a scope call for the gate in
`.scratch/v1-release/issues/13-decide-how-feedback-controls-v1-scope.md`, and is
not taken here.

## An adjacent ticket, now independent

`.scratch/interaction-draft-invalidation/issues/04-acknowledge-markdown-prose-discarded-by-replacement.md`
was filed against this same channel and is no longer coupled to it. Its open
question — whether accepting a stored Space may silently discard an opened
Card's Markdown draft — was answered on 2026-09-04 with a warning in the
conflict dialog rather than a status line, so it needs no notice component and
`03` does not gate it. It is recorded here only so a reader who finds one does
not go looking for a dependency that was removed.

## One documentation defect found on the way

ADR 0057's status block says `Build status: not built`; `docs/agents/ui.md` says
the same decision is "built through Authoring, UI and HTTP". One of the two is
stale. Correcting it belongs with `01`, which is the change that makes the
"built" reading true.

## Status

- `01` — `ready-for-agent`. No open questions.
- `02` — `ready-for-agent`, blocked by nothing. `01` owns the `acceptStoredSpace`
  arm, which `02` does not touch, so either may land first.
- `03` — `ready-for-agent` as of 2026-09-04; its title-voice decision is taken
  and recorded in the ticket.

# ADR 0042 is silent on a completion queued across a Space replacement

Status: ready-for-human

Surfaced by: review of PR #39

## Context

ADR 0042's whole subject is what a wholesale Space replacement invalidates. It
defines `replacementEpoch` for interaction-local drafts:

> Every interaction-local owner discards its draft when that epoch changes

and lists what does not advance it:

> Retry, Keep local, persistence status changes, ordinary renderer selection and
> completed Edits do not advance it.

It says nothing about a completion that is **already queued** when
`acceptStoredSpace` lands.

That path is real. Space Authoring has a completion queue with drain semantics,
`installTogether` counts window depth, and `acceptStoredSpace` publishes from
inside its own window — an observer may complete an Edit from there. So a
completion queued before the replacement and drained after it is reachable, and
it is not a draft, so the epoch does not reach it.

What happens then follows from ADR 0035's rule that an edit event is a
notification rather than state transfer: the coordinator derives from its
collaborators' current state, which is now the *replacement*. The queued
completion therefore derives against a Space it never saw, using identities
captured against the one that was replaced. It either refuses on a missing Card
or — worse — succeeds against a same-id entity in the replacement.

## Direction

Say what a replacement does to work already queued. Candidates:

- The epoch gates the drain: completions queued before the current epoch are
  discarded, reported like the existing drained-failure diagnostics.
- Replacement drains the queue before installing, so nothing survives it.
- Queued completions are explicitly allowed to derive against the replacement,
  with a stated reason why that is safe.

The first matches how the epoch already works for drafts and is the smallest
addition to the model.

## Constraint that must survive

The epoch stays invalidation rather than a registry — Space Authoring does not
learn which surfaces are open. Whatever gates the drain reads the epoch; it does
not gain a callback.

## Acceptance

- ADR 0042 answers what happens to a completion queued across a replacement.
- If the answer is "discarded", the discard is reported through the existing
  non-throwing diagnostics rather than silently.
- Coverage for a completion queued before `acceptStoredSpace` and drained after.

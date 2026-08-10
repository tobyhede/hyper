# Queued completions do not record the replacement epoch

Status: ready-for-agent

Surfaced by: review of PR #39

## Context

ADR 0042 rules what a Space replacement does to work already queued:

> Each queued completion records the current `replacementEpoch`. When the queue
> is drained, Space Authoring discards any completion whose recorded epoch
> differs from the current epoch. It must not derive that completion against the
> replaced Space, even if some of its identities still happen to exist there.

**None of that is built.** `replacementEpoch` appears nowhere in
`packages/` or `src/` — zero occurrences of `epoch` in any TypeScript source.
The mechanism the ADR names does not exist yet, for drafts or for completions.

The path the rule closes is reachable in the code as it stands.
`packages/app/src/space-authoring.ts:478` holds the completion queue,
`:510` drains it, and `:265` counts window depth so that `acceptStoredSpace`
(`:555`) publishes from inside its own window — an observer may complete an
Edit from there. A completion queued before the replacement and drained after
it therefore derives against a Space it never saw, using identities captured
against the one that was replaced. It either refuses on a missing Card or,
worse, succeeds against a same-id entity in the replacement.

The drain already contains a completion's failure and reports what it discards
(`:504`–`:527`). That is the diagnostics seam the epoch discard should report
through; it is not a second one to build.

## Direction

Build ADR 0042's rule. The epoch is a monotonic counter in the Space Authoring
interface, incremented when `acceptStoredSpace` installs a replacement. A
completion records the current value when it is enqueued; the drain discards
any entry whose recorded value differs from the current one, and reports the
discard through the existing non-throwing diagnostics rather than silently.

Interaction-draft invalidation is the other half of ADR 0042 and is also
unbuilt. It is a larger surface — title fields, pickers, React Flow's
connection attempt, armed destructive controls — and does not have to land in
the same change, but the epoch it reads is the same one.

## Constraint that must survive

The epoch stays invalidation rather than a registry — Space Authoring does not
learn which surfaces are open. Whatever gates the drain reads the epoch; it
does not gain a callback.

The installation order in `installCompletedEdit` is load-bearing and unchanged:
`session.submit` is deliberately first, and the epoch check belongs in the
drain, before a queued completion is derived, not inside that window.

## Acceptance

- A queued completion records the epoch current when it was enqueued.
- The drain discards a completion whose epoch differs, produces no Edit, and
  reports the discard through the existing diagnostics.
- Coverage for a completion queued before `acceptStoredSpace` and drained after.

## Note

This ticket previously claimed ADR 0035 was silent on the join and that a
follow-up ADR was needed. That was an artifact of the branch sitting two PRs
behind `main`: ADR 0042 was not in the tree, and commit `4f753f3` rewrote the
ticket's citations to match the stale tree rather than the ADR that answers it.
The gap is in the code, not in the record.

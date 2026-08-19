# Queued completions do not record the replacement epoch

Status: resolved

Surfaced by: review of PR #39

Moved from `.scratch/adr-0040-0042/issues/03` when that effort was split by
subject: its ADR 0042 tickets are this effort, its ADR 0040/0041 tickets are
`.scratch/layout-ownership-review/`.

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

(Corrected later, after this ticket resolved: that second paragraph is what was
believed here, and checking it against the tree did not bear it out. See the
close of the Answer below and
`02-interaction-draft-invalidation-is-mostly-already-covered.md`.)

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

## Answer

The counter already existed under another name. `opening` was a monotonic
number in the Space Authoring interface, advanced only where `acceptStoredSpace`
installs a replacement, and already read as an invalidation signal by the render
adapter and by the canvas key that takes an open title editor down with the
Space it names. That is ADR 0042's `replacementEpoch` in everything but
spelling, so it was renamed — alone, in its own commit — rather than joined by a
second counter incremented on the same line.

The queue entry is a named `QueuedCompletion` — the report, the placement and
the Card values it was made against, plus the epoch current at `queued.push` —
and the drain skips any entry whose recorded epoch differs from the current one,
reporting its discards once per drain through `safelyReport`, the sink the
failed-drain report already used. Why a stale entry is discarded rather than
refused, and skipped rather than stopped at, is written out once in AGENTS.md's
install-gate rule and not restated here.

Two tests, each mutation-checked, sharing one arrange helper. The first queues a
completion, accepts the stored Space from the same publication, and asserts the
accepted snapshot comes through untouched — it fails without the gate by writing
the abandoned drag's `{111, 222}` over the stored `{900, 700}`. The second pins
the skip, and fails if the drain breaks at the first stale entry instead.

Interaction-draft invalidation — the other half of ADR 0042 — reads this same
epoch, and is unevenly built rather than unbuilt. Two of the four drafts the
ADR names, a picker's unconfirmed target and an armed destructive control, have
nothing in the tree to invalidate; the two that do are discarded on every
replacement already, by a subtree unmount and the render adapter's own epoch
reset, behind a canvas key that is currently redundant. The ADR's one shared
contract test is `packages/app/test/replacement-invalidation.test.tsx`, which
pins that discard for the two drafts the app's own trigger can leave open — the
opened-Card pane and an in-flight drag. The inline title field is not one of
them: the modal carrying `Accept remote` blurs it, and blur is its commit. What
is genuinely left is that question, the focus effect, which cannot tell a
replacement from a pane close, and two survivors behind a trigger no input
reaches. Established after this ticket resolved, and written out once in
`02-interaction-draft-invalidation-is-mostly-already-covered.md`.

`pnpm verify` green: 86 test files, 871 tests. `pnpm e2e` green: 71 passed,
unchanged.

## Note

This ticket previously claimed ADR 0035 was silent on the join and that a
follow-up ADR was needed. That was an artifact of the branch sitting two PRs
behind `main`: ADR 0042 was not in the tree, and commit `4f753f3` rewrote the
ticket's citations to match the stale tree rather than the ADR that answers it.
The gap is in the code, not in the record.

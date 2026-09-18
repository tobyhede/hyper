# A multi-Space Edit is judged against what it commits

Status: accepted
Refines: 0076
Related: 0079, 0091, 0095

A coordinated Space Thing lifecycle Edit — create, link, delete, and deleting a Diagram or Graph a Space Thing selects — is derived and validated in the browser against the aggregate the repository will judge: the stored Spaces, with the participants' changes applied to their working Spaces. The browser judges it with `decideCommit`, the same decision every repository runs (ADR 0095), not a separate intake call.

ADR 0076 had the coordination derive the Edit "from the latest authoritative working Spaces" and validate it there. Every open Space's working Space entered that candidate, but the commit carries only the participants, so the browser and the repository judged different aggregates. Two outcomes were reachable in one tab over HTTP. Linking a Space Thing to a Space whose newest Graph was still local work selected that Graph, passed the browser's check, answered `completed`, and was then refused by the repository, which had never stored it. And after a coordinated delete failed transiently, leaving its containing Space `failed`, a later delete counted the target's inbound references against the failed Space's working state, cascaded through a Space still referenced in storage, and was answered `conflict`. The browser's own intake call also lacked the repository's forgiveness for a Space already unreferenced before the commit.

So, within the existing browser-wide barrier:

- The barrier waits for every open Space's queued local work to commit, not only for commits already in flight, before deriving the Edit. A session whose commit fails stops in `failed`, `conflicted` or `rejected` and awaits the author, so the wait always ends.
- The Edit reads one stored aggregate per coordination turn. Spaces it does not change are read as stored; participants are read as their working Spaces, which is what the commit sends. Deletion cascades count references in that same view.
- The browser's pre-commit verdict is `decideCommit` over that view, so the refusals it answers before anything is installed are the repository's.
- A link whose target Space is `failed` or `conflicted` is refused as `persistence-recovery-required`, as the containing Space and the Spaces a deletion cascades through already are. The target is the one Space the author expects the Edit to take content from; a failed Space the Edit merely counts references in does not refuse it.

What ADR 0076 decided otherwise stands: per-Space sessions and revisions, a `rejected` Space still participating with its newest local work, a shared persistence outcome for all participants, and the operation answering `completed` once installed, with the repository's answer arriving as observable persistence state. After this refinement that later answer differs from the browser's verdict only when stored state moves during the turn — another tab or client.

Rejected: keeping the working-Space candidate and committing every open Space whose working Space differs from storage as a participant, which makes unrelated local work — including `rejected` work — ride on, and able to sink, a Space Thing Edit. Refusing the Edit whenever any open Space needs recovery, which lets one broken Space block every Space Thing lifecycle operation. Waiting only for the Spaces the Edit reads or writes, which cannot be known before the Edit is derived.

# Multi-Space Edits coordinate per-Space sessions behind Space Card lifecycle

Status: accepted
Refines: 0035, 0042, 0074
Related: 0030, 0057, 0068

Each Space remains an independent optimistic-concurrency unit with its own
working state, stored revision and persistence status. This preserves the
ability of two browser tabs to edit unrelated Spaces without conflict, and it
keeps failure, conflict recovery and changed-since-export state attributable to
the Space they concern. A single Meta-rooted aggregate session and repository
revision were rejected: they would remove coordination, but any Edit anywhere
would make every other tab stale and accepting stored state would replace
unrelated local work across all open Spaces. A hybrid aggregate session with
per-Space revisions was also rejected because it moves the complexity into
aggregate baselines, revision maps and topologically coupled conflict recovery.

A Space Card lifecycle operation that changes several Spaces is one atomic Edit
over coordinated per-Space sessions. Its public interface is domain-shaped:
create a Space Card and its new target Space, reference an existing Space, or
delete a Space Card and cascade through newly unreferenced Spaces. Callers never
submit replacement snapshots, participant sets, revisions or persistence
ordering. The module places one browser-wide barrier on starting persistence,
waits for existing commits, derives the complete Edit from the latest
authoritative working Spaces, validates it, installs every participant before
one external publication, and keeps the barrier through the atomic repository
answer. Authoring remains available throughout; an Edit completed after that
installation is authoritative local work queued for the next commit.

Coordination is an implementation detail of Space Card lifecycle rather than a
generic command or transaction interface. An affected Space already in
`failed` or `conflicted` must recover before the operation begins; a permanently
`rejected` Space may participate because a later valid Edit is already allowed
to attempt its newest local state. A conflict, retryable failure or permanent
rejection belongs to the complete coordinated Edit: every participant carries
the shared persistence outcome, and Retry, Keep local or Accept stored resolves
the participants together rather than independently. The authoring operation
answers the normal `completed`, `unchanged` or `refused` outcome; repository
results remain asynchronous observable persistence state.

This is the multi-Space exception to ADR 0035's statement that Space Authoring
alone mutates a `SpaceSession`. Space Authoring continues to own every
single-Space Edit lifecycle. Space Card lifecycle owns only its three known
multi-Space operations, and the earlier snapshot-based coordinated-submit
interface is replaced rather than retained beside it.

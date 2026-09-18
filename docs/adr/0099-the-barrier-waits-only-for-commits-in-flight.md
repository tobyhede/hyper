# The barrier waits only for commits in flight, and one recovery rule covers both cascades

Status: accepted
Refines: 0097
Related: 0076, 0091

Two refinements to ADR 0097, both found while building it (`.scratch/architecture-review/issues/24`).

**The barrier waits only for whatever is already in flight.** It raises before anything is derived — every session paused, then the in-flight commits awaited — and waits for nothing more. Local work still queued when it raises stays queued for after this turn rather than being drained into it. So linking to a target Space whose newest Graph is still queued and not yet committed takes the Graph the target's *stored* state already has, and the newly added one becomes selectable once its own commit lands, on a later turn.

ADR 0097 said the barrier waits for every open Space's queued local work to commit. That is not what bounds the wait, and it is not what the code can do. Pausing every session *before* awaiting is what makes the wait finite: a commit that completes with further queued work settles to idle instead of chaining into the next one (`session.ts`), so the pause is what stops the queue feeding the wait it is inside. Draining the queue instead would mean the barrier's duration is set by however much local work happens to be outstanding, and a coordination holds a turn, so the queued work cannot drain while the barrier is up in any case — ADR 0097's sentence described a wait that would not end rather than one that always does.

The cost is stated rather than hidden: an author who adds a Graph and immediately links a Space Thing to that Space gets the stored Graph, not the one they just added. That is a stale read of the author's own uncommitted work, resolved by the next turn, and it is preferred to a barrier whose length is unbounded.

**One recovery rule covers a Space Thing deletion and a Diagram/Graph deletion alike.** A Space that needs recovery, whose stored snapshot *or* working Space references a Space the deletion would remove, or selects the Diagram or Graph it deletes, refuses the Edit as `persistence-recovery-required`, naming that Space. A `rejected` Space does not refuse it — its work is already permanently refused, so the deletion strands nothing further.

ADR 0097 refused a link whose *target* needs recovery and left deletion to count references in the stored view alone. Both halves are needed, and for the same reason: a Space that needs recovery is never itself a participant, so counting only stored references, or only stored Diagram/Graph selections, cannot see what that Space's own unsettled working Space still points at or still selects, and reading only that working Space misses the same thing sitting in what is already stored instead. A deletion decided without checking both can remove a Space, Diagram or Graph that the broken Space's eventual retry still needs, stranding that retry with a dangling reference or a missing selection permanently — the one failure in this area with no recovery.

What ADR 0097 decided otherwise stands, including the stored-aggregate read per turn, `decideCommit` as the browser's pre-commit verdict, and the target being read as stored even when its session is open.

Rejected: draining every session's queue before deriving, which is ADR 0097's original sentence and leaves the barrier's duration set by outstanding local work. Refusing the Edit whenever any open Space needs recovery, which ADR 0097 already rejected for letting one broken Space block every lifecycle operation, and which this rule narrows to the Spaces a given deletion would actually strand. Checking only the stored view, or only the working Space, each of which misses half the danglers.

Recorded separately rather than as an edit to ADR 0097, which was already accepted when both changes were found; `docs/agents/workflow.md` allows an accepted ADR no edit but its status line.

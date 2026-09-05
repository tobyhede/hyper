# Space Card references own the target Space

Status: accepted
Refines: 0068, 0069
Refined by: 0076, 0077
Related: 0001, 0018, 0058, 0060, 0078

The Space Cards that reference a Space own its lifetime, and they own it
together. A Space referenced by two Space Cards survives the deletion of either
one. The application deletes it when the last Space Card referencing it is
deleted.

Deleting a Space deletes the Space Cards it held. Each of those may be the last
reference to a further Space, so one deletion continues down the reference
graph. ADR 0068 already rejects reference cycles at intake, so the graph is
acyclic and the deletion terminates.

The application has one permanent **Meta Space**. No Space Card creates it and
no deletion reaches it. Every ordinary Space is created by creating its first
Space Card, so every ordinary Space has at least one reference and Meta Space is
the only Space without one.

## Why: one set of operations rather than two

ADR 0068 gave a Space no lifetime of its own. It therefore needed a separate
Space deletion command, refused while any Space Card still referenced the
target. That is a second set of operations over Spaces standing beside the ones
over Cards, and an author has to learn both and know which applies.

Ownership collapses them into one. Create a Space by creating its first Space
Card. Delete a Space by deleting its last one. There is no Delete Space command
to build, no chooser needed to reach a Space nothing references, and no state in
which a Space exists that no Card can reach.

## Why a reference count is enough

ADR 0060 held that cascade deletion required one owner per Space: *"With one
owner, removing a Space Card identifies one unambiguous descendant subtree;
without it, deletion could destroy a Space another Card still reaches."* ADR
0068 then let references converge, and read 0060's constraint as ruling cascade
out altogether.

That premise was too strong. Uniqueness is one way to make a cascade safe.
Counting references is another, and it survives convergence: the target is
deleted at zero, which is precisely the case 0060 was protecting. So a Space
Card graph may converge *and* own its targets' lifetimes. This is neither
0060's exclusive ownership nor 0068's absence of it, and the word **own** here
always means the shared kind.

The count alone is also sufficient, and **no reachability sweep is needed**.
Cycles are rejected and Meta Space is the only Space without a reference, so
every referenced Space traces up to Meta Space and an unreferenced Space is an
unreachable one. Do not add a mark-and-sweep collector for Spaces; if a Space
ever gains a second way to be reached, that is what changes this, not the
counting.

## What it costs

Deleting one Space Card can destroy a Space and every Space below it that
nothing else references, and V1 has no undo. Refusal is the safer default and
this decision gives it up. What stands in its place is confirmation: a
destructive Card action states whether it affects one Layout or the whole
Space, and asks first wherever authored work would be lost.

## Meta Space and the built Entry Space

**The rest of this section is out of date, and is kept as the record of what
was true when this decision was accepted.** Meta Space is built and the Entry
Space is retired. Meta identity is singleton repository state, established once
by the server-side repository's `initializeAggregate` operation and never moved
(ADR 0077, ADR 0078); opening the application without another destination opens
the Meta Space's canonical URL, and contradictory stored Meta state fails
explicitly rather than being repaired or guessed at.
`.scratch/v1-release/issues/01` landed that lifecycle and removed the Entry
Space with it: the `spaces.entry` column, the `setEntrySpace` repository
operation and the `hyper entry` command are all gone, and `CONTEXT.md` now
lists Entry Space under Meta Space's `_Avoid_` rather than defining it. Do not
reimplement any of them, and read ADR 0069's `entrySpaceId` paragraph as
retired for the same reason. What is *not* yet built is ADR 0077's generated
Default Content: `defaultContentAggregate` currently mints the ordinary
one-Card new Space (ADR 0018) as the Meta Space, and
`.scratch/v1-release/issues/16` replaces that body.

Meta Space is not built. What exists is the **Entry Space**: a mutable
repository-level flag naming the Space `/` redirects to, which `hyper entry`
changes (ADR 0069). `.scratch/v1-release/issues/01` replaces it with the
permanent Meta Space this decision rests on. Until that lands, this ADR
describes the target state and `CONTEXT.md` keeps describing the Entry Space
that exists.

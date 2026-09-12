# 19 — Space Thing creation answers the Thing it created

Status: resolved
Tags: release/v1
Blocked by: nothing. `13` landed the command this is about (`da24496c`, fixed up in `b8de678b`).

**What to build:** pressing Create Space Thing puts the caret in the Thing that
press created, even when another creation is pressed before the first one
settles. Today the caret can land in the wrong Thing, and the Thing that was
actually made is left sitting at its default `Space N`.

## Why the id is guessed

`createSpaceThing` needs the id of the Thing it made, so the continuation can
select it and open its inline Title editor. The lifecycle does not tell it one:
`SpaceThingLifecycleResult`'s success arm is `{ kind: 'completed' }` and nothing
else, shared by `create`, `link` and `delete` through a single `completed`
constant. So the command infers the id — it snapshots the Thing ids before the
`await` and takes the first Thing that is not among them afterwards.

That answers "a Thing that appeared", not "the Thing this call created". The
window is open from the press until the lifecycle installs its Thing, and two
gestures reach into it:

- Press Create Space Thing, then Create Markdown Thing before it resolves.
  `addThing` is synchronous and lands immediately, so both Things are absent
  from the snapshot and the earlier array position wins — the caret opens the
  markdown Thing's Title editor and the author types the Space's name into it.
- Press Create Space Thing twice quickly. Both calls snapshot the same ids; the
  second resolution re-finds the Thing the first one made and continues there.

Nothing guards the window. `createDisabled` is `!availability.addThing`, which
answers presenting, content editing and chrome renaming — availability, not
re-entrancy.

**The asymmetry is the argument.** The sibling command does not guess: Add Thing
reads `createdThingId` straight off the completion, because Space Authoring's
result carries it. Two creation commands beside each other, one reading an id
and one inferring it, is the thing to remove.

## The decision this ticket takes

Both `create` and `link` already mint the id locally, so the value exists at the
moment the result is built. What has to be decided is the shape of the seam,
because `delete` shares the success arm and creates no Thing.

Adding an optional `createdThingId` to the one `completed` arm is the shape to
**reject**: it puts "is it there?" back at every call site, which is what the
guessing already costs. Split the result per operation instead — the creating
operations answer with the Thing they created, deletion answers with what
deletion has to say — so the compiler carries the difference rather than a
reader remembering it.

Whether `link` also continues at the Thing it authors is a **product** question
and not this ticket's: the Things list names the Thing after the Space the
reader just picked (ADR 0083), so it has somewhere to have come from in a way a
minted `Space N` does not. Thread the id; leave the continuation alone.

- [x] The Space Thing lifecycle's success arm carries the created Thing's id for
      the operations that create one, and does not exist on the one that does not
- [x] `createSpaceThing` continues at the id the lifecycle answered, and the
      before/after set difference is gone
- [x] A test fails without the change: a second creation installed while a Space
      Thing creation is in flight leaves the caret in the Space Thing, and the
      other Thing keeps its own title
- [x] The same holds for two Space Thing creations pressed into one window
- [x] `pnpm verify` and `pnpm e2e` green; no story changed

## What was built

`SpaceThingLifecycleResult` is gone, split into `SpaceThingCreationResult`
(`{ kind: 'completed'; thingId }`) and `SpaceThingDeletionResult`
(`{ kind: 'completed' }`) over a shared `SpaceThingRefusal` and a shared
unsettled pair. The refusal union is named once and exported, rather than
extracted back out of whichever result a reader happened to have — `delete` can
make the same refusals and no longer shares a result to extract them from.

Both creating bodies build their completion where they mint the id, on the one
path that returns a change list. `completedCreation` is what turns "no completion
and no refusal" into a throw rather than a third outcome: every path that returns
without an id assigns its refusal first, so there is nothing honest for that case
to say, and answering `unchanged` would name an outcome neither operation
produces.

### Three questions asked while building it

**Where the id comes from.** `newId()`, injected at `registry.spaceThings(newId)`
per ADR 0016 — the same source the Diagram and Graph of a `link`'s target come
from. Nothing new is minted; the value simply stopped being thrown away.

**Whether the press is a complete round trip. It is not, and deliberately so.**
`coordinateSpaceThingLifecycle` resolves from the `installed()` callback, which
fires once every participant has published its coordinated commit and *before*
`await backend.commit(...)`. So the caret lands in a Thing whose durable write is
still in flight, and a later conflict or commit failure reaches the author through
the persistence channel rather than through this promise. That is ADR 0089's
optimistic half and the existing test above pins it.

**The transaction boundary.** `create` is one: the candidate aggregate is validated
whole, then a single `backend.commit` carrying the containing Space's update and
the new Space's creation. `link` is two — the target's initialization is its own
durable single-Space commit issued inside `derive`, which `session-registry.ts`
records as deliberately non-atomic and idempotent on retry.

# 19 — Space Thing creation answers the Thing it created

Status: ready-for-agent
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

- [ ] The Space Thing lifecycle's success arm carries the created Thing's id for
      the operations that create one, and does not exist on the one that does not
- [ ] `createSpaceThing` continues at the id the lifecycle answered, and the
      before/after set difference is gone
- [ ] A test fails without the change: a second creation installed while a Space
      Thing creation is in flight leaves the caret in the Space Thing, and the
      other Thing keeps its own title
- [ ] The same holds for two Space Thing creations pressed into one window
- [ ] `pnpm verify` and `pnpm e2e` green; `pnpm e2e:ladle` if a story changes

# A split presentation move can strand at the wide zoom

Status: resolved

Blocked by: 01 (resolved)

## Context

`PresentingCamera` in `packages/app/src/components/SpaceCanvas.tsx` makes a
**split** move when the zoom changes by more than a tenth: pan at the wider
scale, then close in. ADR 0027 requires the split because one combined move
whips.

The second half is chained on the first half's Promise:

```ts
void setCenter(x, y, { zoom: Math.min(from, zoom), duration: 400 }).then(() => {
  if (!cancelled) void setCenter(x, y, { zoom, duration: 300 });
});
```

Issue `01` establishes what that Promise does at the pinned React Flow:
`getD3Transition` resolves it via `.on('end', onEnd)`, and a **superseded d3
transition fires `interrupt`, not `end`**. The Promise then never settles.

## The failure

Any interruption of the wide pan strands the camera at the wider zoom, with the
close-in half never running. `cancelled` does not cover it — that flag guards
the effect being torn down, not the transition being superseded while the effect
is still live.

Traversing to the next Card during the first 400ms is the ordinary way to
produce it: the new effect issues its own `setCenter`, which supersedes the
in-flight transition, whose `.then` never fires. The new move then runs its own
split correctly, so the visible symptom is intermittent — a presentation that
occasionally sits at the wrong zoom until the next step — which is why it has
survived.

This is present on `main` and is not introduced by the PR that raised it.

## Direction

Do not chain required camera movement on a Promise that a normal interruption
leaves pending. Two shapes worth weighing:

- **Sequence without awaiting.** Schedule the close-in half on a timer matched
  to the pan duration, so the second move is independent of the first Promise
  settling. Simple, and honest about the Promise being unreliable.
- **Supersession.** Make the effect own the whole split and cancel its own
  outstanding work when `activeCardId` changes, so an interrupted move is
  replaced rather than orphaned.

Either way the camera calls stay plain `void` — no rejection handler is involved,
because nothing here rejects.

## Why this is blocked by 01

Whether a caller may depend on a camera Promise resolving at all is exactly what
`01` has to decide. Fixing this one first would settle that question by accident,
in one call site, rather than at the seam.

## Acceptance

- A traversal step during the wide pan still ends at the presenting zoom.
- Coverage at the camera seam for a superseded first-half move, not only for the
  uninterrupted split already pinned by the existing tests.
- No required behaviour chained on a camera Promise anywhere else in the canvas.

## Answer

**Both shapes, because they are one shape.** The close-in is scheduled on a
`window.setTimeout` matched to the pan's duration, and that timer belongs to the
effect that issued the pan — so the cleanup which runs when `activeCardId`
changes cancels it. Sequencing no longer depends on the pan's Promise settling,
and an interrupted move is *replaced* by the next card's own split rather than
orphaned. Treating them as alternatives was the ticket's framing; scheduling
without the cancellation would leave a superseded move's close-in to fire over
the move that replaced it.

The `cancelled` flag is gone. It guarded teardown, which the timer's own cleanup
now covers, and it was never the thing at fault.

`packages/app/src/components/cameras.tsx` is the seam, extracted from
`SpaceCanvas.tsx` under issue `01` — see that ticket for why it is a module.
Every camera call in the app is now inside it, all `void`, none chained: the
third acceptance criterion holds by construction rather than by a grep that has
to be repeated.

The cost, recorded in ADR 0043: a throttled timer can fire slightly off the
transition's true end. That is visually inert, because the close-in supersedes
whatever is left of the pan, and it buys a sequence that always completes over
one that usually completes exactly on time.

Coverage: `packages/app/test/cameras.test.tsx`, where every stubbed `setCenter`
returns a Promise that never settles — the interruption branch, not a synthetic
one. Two of its four tests were confirmed **red against the chained
implementation** before the fix landed: the uninterrupted split never reached its
close-in, and traversing mid-pan produced two moves where three are required.

### Later: the split itself is gone (ADR 0044)

The answer above describes a timer that no longer exists. The two-phase move was
removed outright a few days later: both shapes were built behind a toggle and
watched on the fixture, found indistinguishable, and the move became one
`fitView` call. The tests named above were rewritten around it.

That does not undo this ticket, it generalises it. The defect was a `.then` on a
Promise that never settles, and the fix was to stop depending on settlement;
having one command rather than two means there is no follow-up work left to
depend on it. ADR 0043 remains the standing rule.

# A split presentation move can strand at the wide zoom

Status: ready-for-human

Blocked by: 01

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

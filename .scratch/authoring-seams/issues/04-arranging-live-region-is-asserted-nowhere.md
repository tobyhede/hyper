# The "Arranging…" live region is asserted nowhere

Status: resolved

Split out of `02` during its grilling, where it was the last surviving half of
that ticket's "two user-visible states asserted nowhere". The other half,
`placement-failure`, was resolved separately by `ab9873c`.

## Context

`App.tsx:514-518` draws the third arm of the canvas ternary — what the author
sees between the app loading and the layout strategy returning positions:

```tsx
) : (
  <div className="placement-status" role="status">
    Arranging…
  </div>
)}
```

Nothing asserts it. No test references `placement-status`, `role="status"` or
the string, and **no unit test renders `App` at all**.

The decision behind it is covered one seam lower: `placement-rendering.test.tsx`
pins `canvasContent` returning `placeholder`. What is untested is this rendering.

## What is actually at risk

One thing, and it is small but real. `role="status"` makes this a polite live
region, so a screen reader announces the wait. Remove the role and a
screen-reader user gets silence for the whole layout wait with no other cue, and
nothing in the repo notices.

There is no other behaviour here — three lines, one string. This is not the
`PlacementFailure` case, which had a scroll region, a `tabIndex`, an
`aria-label` and a recorded ARIA decision about `pre` mapping to `generic`.

## What to build

Extract the branch beside `PlacementFailure` — same directory, same shape — and
give it a test pinning the live-region role and the text. Ten lines each.

## What this does not fix, and should say so

Extracting a component does not cover `App` *choosing* the branch. That is
equally uncovered for `PlacementFailure` today (`App.tsx:480`), and closing it
means making `App` renderable in a unit test, which is a larger question than
either div. Record that as the deliberate limit rather than implying the
extraction covers the wiring — `02`'s original filing read `ab9873c` as covering
more than it did.

## Resolution

`PlacementPending` now owns the pending canvas markup beside
`PlacementFailure`. Its component test pins the public rendered behaviour: a
`status` live region containing “Arranging…”.

The test deliberately does **not** cover `App` selecting the placeholder branch.
That wiring remains untested, just as `App` selecting `PlacementFailure` remains
untested; covering either requires the larger, separate work of making `App`
renderable at a unit-test seam.

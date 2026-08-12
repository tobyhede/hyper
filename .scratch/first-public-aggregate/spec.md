# First-public version 1 aggregate

Package 2 of `.scratch/card-route-editing/implementation-handoff.md`, broken
into tickets. Read that document's package 2 section and ADRs 0040, 0041, 0042
and 0045 before starting any of them.

## What this delivers

A Graph stops being a Space-level value and becomes a nested owned value of the
Layout it belongs to (ADR 0040). A View becomes one interface over an open
subject, with closure and fresh identity enforced at its conversion boundary
(ADR 0045). A Graph id stays unique across the whole Space although its owner is
one Layout. The document becomes version 1, and version 2 is rejected rather
than migrated.

## How it is sequenced

`01` is a standalone prefactor and lands on `main` by itself.

`02` opens with a behaviour-preserving commit that gives the handle-id format one
producer, verified green on its own before anything structural moves.

From the commit after that, `02`–`06` share one branch and `pnpm verify` is
**red until `04`**.
That is not a defect to fix in passing. `pnpm typecheck` runs one program
spanning every package's `src` and `test`, so no partial migration typechecks,
and the version 1 shape has no compatibility form to hide behind. Each of those
tickets names a scoped bar it must actually pass; run that one, and do not add a
shim, cast or temporary field to make the root bar go green early.

Expand–contract was the alternative and was rejected. Accepting Layout-owned
Graphs beside the Space-level collection for a few commits would have bought
per-commit green, at the price of a temporarily conditional closure rule — an
Edge endpoint's obligation depending on where its Graph sat. That is the shape
of defect ADR 0045 exists to close, and it would also have meant touching the
~50 affected test files twice. The branch has to stay short; do not park it.

The one thing keeping the blast radius down: the built `Space` value keeps
`graphs` as a derived flatten across its Layouts, so colour assignment, handle
derivation, render Edge derivation, the canvas projection and Navigation are
untouched.

## Order

```
01  delete the Layout graphs filter          → main
02  move Graphs under Layouts                → branch
03  convert a View into a Layout that owns its Graph   (blocked by 02)
04  carry owned Graphs through export, import and CLI  (blocked by 02)
05  roll the tracked fixture forward to two Layouts    (blocked by 04)
06  integrate and verify                               (blocked by 03, 05)
```

`03` and `04` are independent of each other and can run in either order.

## Not in this effort

The omitted-Card fallback band stays standing throughout. Package 5 of the
handoff deletes it and builds its replacement — Cards View, Add to Layout,
Remove from Layout — together. Removing it here leaves a Card no surface can
reach.

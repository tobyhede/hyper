# Declare strategy capability rather than inferring it

Status: needs-triage

## Context

See `../spec.md` for the asymmetry. Two further consequences worth recording.

`RenderAdapterState.moved` exists only because `LayoutGraph` cannot say "this
routed geometry is now stale". A card leaving the position ELK routed around
invalidates the sections, and the flag is how the app compensates. The same rule
is then expressed a second time, independently, by `placement-rendering.ts`
substituting the authored strategy whenever a placement exists — two mechanisms,
two packages, one rule.

There is also no test anywhere from strategy output to rendered SVG. The unit
tests stop at conservation; `projection.test.ts` starts from a hand-written
`layoutGraph` literal. The one behaviour spanning them — did routed geometry
survive the crossing — is asserted only in Chromium, by pattern-matching a path
string for `M` and absence of `C`.

## Direction, to be grilled

Return declared capabilities alongside the graph, so the render adapter reads a
flag instead of guessing, and the shared contract suite can assert per capability:
if you declare it, you must deliver it.

## Constraints

- ADR 0005 forbids an `Arrangement` type — geometry rides as optional fields on
  the elements. A capability declaration must not become one by another name.
- ADR 0014 keeps `Layout` (data) and `LayoutStrategy` (behaviour) distinct.
- This serves both ADRs rather than reopening either; it makes the seam keep the
  promise they already make.

## Open question

Does `moved` fold into a declared staleness, or is it a separate concern that
should stay in the adapter?

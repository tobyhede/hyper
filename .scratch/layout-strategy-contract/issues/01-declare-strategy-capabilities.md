# Declare strategy capability rather than inferring it

Status: needs-triage

## Context

See `../spec.md` for the asymmetry. Two further consequences worth recording.

`RenderAdapterState.moved` exists only because `LayoutGraph` cannot say "this
routed geometry is now stale". A card leaving the position ELK routed around
invalidates the sections, and the flag is how the app compensates — it gates
`projectRouteEdges` alone, so its whole effect is suppressing routed sections.
The same *consequence* is reached a second time by `placement-rendering.ts`
substituting the authored strategy whenever the selected renderer is a Layout.
Two mechanisms, one underlying fact: a `LayoutGraph`'s sections carry no
validity marker. Both are authored in `packages/app/src/`; it is their
consumers that differ by package (`projectRouteEdges` in `react-flow-adapter`
against `positionedStrategy` in `graph`).

There is also no test anywhere from strategy output to rendered SVG. The shared
contract suite stops at conservation and `projection.test.ts` starts from a
hand-written `layoutGraph` literal, importing no strategy at all; `RoutedEdge`
has no rendering test in Vitest, so neither `polyline()` nor the bezier fallback
is exercised. (`elk-strategy.test.ts` does assert sections, but stops at the
`LayoutGraph` boundary and never crosses into projection.) The one behaviour
spanning them — did routed geometry survive the crossing — is asserted only in
Chromium, by pattern-matching a path string for `M` and absence of `C`
(`overview.spec.ts:99`).

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

Verification sharpens this rather than answering it: `moved` does **not** fold
cleanly into the `placement-rendering.ts` substitution, because the two are not
redundant. `moved` is set inside `changeNodes` before `authoring.complete` is
called, so it covers a refused or throwing completion, where the renderer stays
algorithmic and the substitution never happens. It also covers the asynchronous
window after conversion but before the positioned re-layout resolves, during
which `laidOut` still holds ELK's now-stale sections. And it is sticky — reset
only by `selectRenderer` or an `opening` change — where the substitution is
derived state that flips back with the placement.

So a declared staleness would have to carry two different things: the static
capability ("this strategy emits no sections at all") and the per-result
validity ("the sections this strategy produced are no longer true"). Whether one
declaration can carry both is the decision this ticket is actually asking for.

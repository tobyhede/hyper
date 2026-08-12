# A seam for authoring gestures, so the canvas is testable off-browser

Status: resolved

## Context

**Re-measured at `562b06c`, and still current at `6e86a7c` — everything between
the two is docs. The file this was filed against has been renamed:
`GraphView.tsx` is `SpaceCanvas.tsx` (ADR 0041, `7a2a860`). Read the numbers
below, not the ones the original filing carried.**

`packages/app/src/components/SpaceCanvas.tsx` is 487 lines with exactly twenty
props, and it is not exported from any index — `app` has no index files at all,
and its only importers are `App.tsx` and its own test. `SpaceCanvas.test.tsx`
(292 lines) imports it directly and covers title and opening gestures, but the
structural gesture policy below still has no off-browser seam.

All three named pieces are still inline and still unreachable off-browser:
the empty-canvas hit test `isEmptyCanvasTarget` (`SpaceCanvas.tsx:81-87`,
`document.elementFromPoint` at `:292`), the Alt-drop create-and-connect decision
inside `handleConnectEnd` (`:278-312`) and the `connectionGesture` ref (`:213`,
read at `:242`, `:273`, `:309`, `:320`). `packages/app/e2e/` is now 2,737 lines;
the component suite passes inert stubs for `onConnect`, `acceptsConnection`,
`acceptsNewCardTarget`, `onConnectEnd` and `onCreateConnectedCard`
(`SpaceCanvas.test.tsx:59-63`), and never dispatches a connection event.

What Playwright does hold is substantial, so the seam buys coverage that is
faster and more precise rather than coverage that is missing: `new-space.spec.ts`
pins the Alt preview toggling, create/connect/select at the previewed position,
minting the first visible Graph in a filtered positioned Layout, and a release
off the canvas creating no Card; `react-flow-integration.spec.ts` pins a Layout
with no visible Graph suppressing creation; `read-only.spec.ts` pins refusal.

The ref no longer suppresses a post-connect node click. ADR 0036 removed
click-to-open entirely, and `SpaceCanvas.tsx:303-309` records that the flag
survives only because the Alt listener and the empty-canvas hover tracking read
it, "and neither concerns clicks".

### The second half is now one state, not two

`placement-failure` is **resolved**. `ab9873c` extracted
`components/PlacementFailure.tsx` (26 lines) with `PlacementFailure.test.tsx`,
and `b6b98c7` named its detail region; the testid is gone and the panel is found
by `role="alert"`.

What remains is the pending branch — `App.tsx:515-517`, now
`<div className="placement-status" role="status">Arranging…</div>` rather than a
testid. Nothing asserts it: no test references `placement-status`, `role="status"`
or the string, and **no unit test renders `App` at all**. The decision behind it
is covered one seam lower, where `placement-rendering.test.tsx` pins
`canvasContent` returning each of `failure`, `placeholder` and `arrangement`;
what is untested is App's *rendering* of that branch — including the wiring that
sends `failure` to the now-testable `PlacementFailure`.

`persistence-retry` was listed here as a third and should not have been —
`e2e/http-persistence.spec.ts` locates that button by accessible name, asserts it
visible and clicks it to prove recovery. Only its testid is unused, and that is
still true.

## Direction, to be grilled

A pure module taking structural gesture *facts* — `altKey`, `overEmptyCanvas`,
`toNode`, `fromNode`, flow position — and returning an authoring *intent*.
`SpaceCanvas` remains the adapter that supplies facts from the DOM and React
Flow; its existing title/opening component coverage stays where it is.

## What must stay in the browser

Camera behaviour (`OverviewCamera`, `PresentingCamera`) reads viewport width and
height, which are zero in jsdom. Handle geometry needs real `getBoundingClientRect`.
Neither should move; they are genuinely browser-only. Gesture *policy* is not.

## Open questions

- Where does the seam sit — a module in `app`, or does some of it belong in `graph`?
- Does the one remaining unasserted state get unit cover, e2e cover, or both —
  given its `canvasContent` branch is already unit-tested and only App's
  rendering is not, and given nothing renders `App` in a unit test today?

## Answer

`packages/app/src/connection-gesture.ts` — a pure module holding the Alt/Option
empty-drop rule, asked by both callers, tested in the node environment.

**Shape.** A discriminated union rather than a bag of facts, following `03`'s
resolution of the same criticism: `sourceId` and `point` exist only under
`dragging`, so a gesture naming a source while idle is unrepresentable rather
than rejected on a branch. `DropTarget` has four values —
`connection-target | card | empty-canvas | off-canvas` — even though only the
third authors. It is an input a caller reports, not a verdict it reaches, and
naming the catch-all after the answer it happens to produce is what `CanvasContent`
can legitimately do (an output) and this cannot.

**Why neither oracle alone is enough** is the substantive finding, and it is
written out in the module plus one AGENTS.md bullet: `toNode` resolves by handle
proximity within `connectionRadius`, so it is non-null over blank canvas near a
handle and null over a Card's centre. Both halves are load-bearing.

**The rule was spelled twice.** The release and `NewCardPreview` each hand-rolled
the same conjunction against different inputs, and each hand-rolled the same
centre-to-top-left arithmetic, with nothing pinning that they agreed. The
original filing did not notice this; it is the strongest argument the ticket had.
Both now go through `newCardDrop`, so the ghost cannot appear where a release
would refuse or land anywhere but where a release would put it.

**The preview and the release still disagree in one case, deliberately.** Four
of the five facts come from document-wide sources; `over` does not, because
`onMouseMove` is bound to the flow container. Drag out over the toolbar and the
preview's fact freezes while the release hit-tests live. Closing it needs a
document-level listener running `elementFromPoint` per frame against a handler
narrowed precisely to stop per-frame re-renders. So the guarantee is *same facts,
same answer* — not *the two always agree*. The argument lives in the module.

**Behaviour is unchanged**, which was the point: the six existing Playwright
tests across `new-space.spec.ts`, `react-flow-integration.spec.ts` and
`read-only.spec.ts` are the regression net, and none was modified or removed.
They keep what unit tests structurally cannot reach — that `elementFromPoint`
resolves the toolbar, that the `window` Alt listener fires mid-drag.

**Tests.** `connection-gesture.test.ts` (node environment by extension, so the
module cannot reach `document`) covers the refusals by reason plus the whole
sixteen-combination matrix as a count. `connection-gesture.property.test.ts`
pins the one invariant nothing pinned before: an authored Card is centred on the
drop point.

**Also done.** `isEmptyCanvasTarget` became `dropTargetOf`, returning the three
DOM cases it already computed and discarded; `overEmptyCanvas: boolean` became
`pointerOver: DropTarget`; `modifierCreatesCard` was renamed `modifierHeld`,
since an input should not be named for the verdict it feeds. The stale comment
at the old `:69-74` — describing a preview that tracked its own point, untrue
since it moved to `useConnection` — is gone.

**Deliberately not done.** The `connectionGesture` ref and the rest of the local
state stay as they are; collapsing them into one Interaction-draft value helps
only the preview, since the release must read a live event either way, and it
would trade two renders per gesture for no coverage. The twenty props are out of
scope — they are the component's interface to `App`, unaffected by this seam, and
reducing the count is a decomposition question with a different argument. No ADR:
reversible by inlining, so it fails `workflow.md`'s first test. Nothing for
`CONTEXT.md`: this is render-layer vocabulary the glossary excludes.

**Split out.** The `role="status"` "Arranging…" branch is now `04`.

## Comments

### Triage, 2026-08-11 (`562b06c`)

Labelled **`ready-for-human`**, not `ready-for-agent`. The direction is marked
"to be grilled" and both open questions are unanswered; the first is a
package-boundary call with ADR consequences, which is the repo's grilling loop
rather than an AFK task. Nothing here is `wontfix` — the core claim survives
re-measurement intact.

Two things a human should settle before the seam is cut:

**Sequencing against ADR 0040/0045.** Both are accepted and not built, and they
change what an authoring gesture *means*: Layout-owned Card membership brings
explicit Add to Layout and Remove from Layout operations, and Graph identity
moves under the owning Layout. The gesture *facts* the direction names —
`altKey`, `overEmptyCanvas`, `fromNode`, flow position — are indifferent to that.
The *intents* are not: `acceptsNewCardTarget` and the "mints the first visible
Graph in a filtered positioned Layout" behavior sit exactly where 0040 lands.
Cutting the seam at facts→intent before 0040 is safe; naming the intent
vocabulary before 0040 writes it twice.

**What the seam is worth.** Unlike the original filing's reading, the Alt-drop
policy is not untested — it has six Playwright assertions across three specs.
The case for extraction is speed and precision of the *policy* cases (the
predicate has four independent conjuncts and one negative case the comment at
`:287-291` says was a real bug), not missing coverage. Scope it as moving policy
out of a 487-line component, and keep the e2e that proves the DOM facts are read
correctly — that part is genuinely browser-only, same as the camera and handle
geometry the ticket already carves out.

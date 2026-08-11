# A camera command is issued, never awaited

Status: accepted
Refines: 0027
Related: 0024

A React Flow camera Promise is not a completion signal. Camera commands are issued and never awaited: nothing chains required behaviour on `setCenter`, `fitView`, `fitBounds` or `zoomTo` settling, with `.then` or with `await`. Work that must follow a move is scheduled by the effect that issued it and cancelled by that effect's own cleanup, so an interrupted move is *replaced* rather than orphaned.

## What ADR 0027 believed

ADR 0027 chose React Flow's camera over impress.js and counted awaitability among the reasons: its operations "return a Promise you can await and take `duration`, `ease` and `interpolate`, where impress only fires an event." The rest of that comparison stands. This clause does not, and this ADR is the correction rather than an edit to a document the log keeps immutable.

## What the pinned release actually does

Read against `@xyflow/react@12.11.2` and `@xyflow/system@0.0.79`. A camera Promise has three outcomes and only one of them is settlement.

**It resolves when the animation runs to its end.** `getD3Transition` resolves via `.on('end', onEnd)`.

**It never settles when the animation is superseded.** A superseded d3 transition fires `interrupt`, not `end`, and nothing listens for `interrupt`. This is the *common* case in normal use: any second camera command issued while the first is still running produces it.

**It never settles when `fitView` runs before `panZoom` exists.** `resolveFitView()` begins `if (!panZoom) return`, abandoning the resolver `withResolvers()` built, with no cleanup.

Rejection is a fourth thing and is rarer than any of them. Neither bundle calls `reject` anywhere, so there is no deliberate rejection path; a rejection is nonetheless reachable, because `setTransform`, `scaleTo` and `scaleBy` are `new Promise((resolve) => …)` executors that call straight into d3, and a synchronous throw in an executor rejects the Promise whether or not `reject` is named.

## The decision

**Never chain required work on a camera Promise.** The two hangs above are ordinary, not exceptional, so a caller that awaits one is writing a step that sometimes does not happen. Sequencing belongs to the caller's own effect, on its own timer, cancelled by its own cleanup.

**Never contain a camera rejection.** The only reachable rejection is a genuine d3 fault, which is exactly the thing worth hearing; the two failures that actually occur are hangs a `.catch` cannot observe. A blanket `.catch(() => undefined)` therefore silences the one signal and repairs neither problem. Camera calls stay plain `void`, and an unhandled rejection surfaces with its stack.

**Nothing needs to tolerate being called too early.** `fitView` before `panZoom` is a caller ordering rule, not a seam obligation — the overview's only `fitView` runs from a transition out of presenting, long after mount.

## What it cost

The close-in half of a split presentation move now runs on a `setTimeout` matched to the pan's duration rather than on the pan's `end` event. A throttled or descheduled timer can therefore fire slightly before or after the transition truly ends. That is visually inert — the second `setCenter` supersedes whatever remains of the first — and it is the price of a sequence that always completes over one that usually completes exactly on time.

## The negative

A future review will find `void setCenter(...)` with its Promise dropped and read it as a missing `await` or a missing `.catch`. **Both are wrong, for different reasons**, and neither is a style question. Awaiting strands the caller behind an interruption that never settles; catching hides the one fault that would be worth reporting. Before changing either, reproduce a superseded transition and confirm the Promise settles — do not infer it from the return type.

All of the above is a fact about 12.11.2 rather than about the library's contract. Re-read `setTransform`, `scaleTo`, `scaleBy`, `resolveFitView` and `getD3Transition` when the pin moves.

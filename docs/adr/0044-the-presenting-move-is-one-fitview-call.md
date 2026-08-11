# The presenting move is one fitView call

Status: accepted
Refines: 0027
Related: 0043

Moving the camera onto the presented Card is a single `fitView({ nodes: [{ id }], padding, duration })`. There is no two-phase move, no pan-then-close-in, and no camera arithmetic in this repository.

## What this replaces

ADR 0027 built the move as two `setCenter` calls: pan at the wider of the two scales, then close in, split whenever the zoom changed by more than a tenth. That came from the impress.js spike, whose recommendation 6 was "Copy impress's two-phase move for any transition that changes zoom", on the finding that it "is what stops long jumps whipping".

The recommendation outlived the library it was about, and its own next sentence was never acted on:

> React Flow's `ease` and `interpolate: 'smooth' | 'linear'` are where the equivalent would go.

That sentence was right. impress animates with CSS transitions, so a combined move genuinely does whip and the two-phase trick is the fix. React Flow animates through d3-zoom, and `setTransform` calls `d3ZoomInstance.interpolate(options?.interpolate === 'linear' ? interpolate : interpolateZoom)` — so by default every camera move already follows d3's `interpolateZoom`, the Van Wijk & Nuij smooth zoom-out-pan-zoom-in path. We were hand-rolling a workaround for a limitation of the library we did not choose.

## How it was decided

By watching it, which is the one thing ADR 0027 recorded as not having been done:

> The motion was measured but never watched. The spike ran in an automated tab with `requestAnimationFrame` suspended, so distances, framing and timing are measured and perceived smoothness is not. It is a judgement to make on our own canvas.

Both moves were built behind a development-only toggle and run against the fixture, swapping between them on the same traversal steps. The two were indistinguishable. With no perceptible difference, the simpler and more conventional one wins.

The framings were confirmed identical first, so that what was being watched was the motion and not the destination. At 1280x720, landing on the same Card: split `zoom 3.96665, x -1589.26, y -4.16498`; single `zoom 3.97260, x -1592.60, y -3.67123`. The 0.15% is a `Math.floor` inside React Flow's padding maths.

## Why fitView rather than setCenter

`fitView({ nodes: [{ id }] })` is React Flow's documented way to frame one node, used throughout its docs and as the entire navigation mechanism of its own presentation tutorial. Its reference calls the lower-level route we were closer to "quite a low-level utility" and points at `fitView` and `fitBounds` instead.

Three things follow, beyond convention. `fitView` reads measured node bounds, so the card's dimensions stop being something this seam knows. Its result goes through `clamp(zoom, minZoom, maxZoom)`, so the camera cannot leave the extent the canvas declares — which is what made `maxZoom` load-bearing rather than merely correct (see `camera.ts`). And one command has no follow-up work, which removes the only thing this seam ever chained on a camera Promise.

## What it cost

**The `duration` is now one number for a move that changes zoom by a factor of seven.** The split could pace its halves separately. If a long jump ever does read badly, the lever is `ease` or `interpolate`, not a second command.

**`interpolate` is undocumented.** It appears nowhere in React Flow's published docs; the default was read out of the pinned bundle. So the reason this works is a fact about `@xyflow/react@12.11.2`, and belongs on the list to re-check when the pin moves.

**ADR 0027's recommendation is now contradicted rather than refined away.** A reader landing there will find the two-phase move recommended in a document whose status is accepted.

## The negative

A future review will see one `fitView` for a move that both zooms and translates a long way, remember that combined moves whip, and reinstate the split. **Do not.** It was built, watched against this one on the real canvas, and found indistinguishable — and the version it would restore is the one whose chained second half stranded the camera at the overview zoom. If the motion ever does look wrong, watch it first, then reach for `ease` or `interpolate`, which is where React Flow puts that lever.

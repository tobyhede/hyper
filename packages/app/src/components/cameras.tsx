import { useEffect, useRef } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import {
  OVERVIEW_DURATION,
  OVERVIEW_FIT,
  PRESENTING_DURATION,
  PRESENTING_PADDING,
} from '../camera';

/**
 * The camera seam (ADR 0027): the two components that move React Flow's viewport
 * and the whole of what this app asks of it.
 *
 * Both are one `fitView` call (ADR 0044). Framing a set of nodes is what React
 * Flow's own presentation tutorial navigates with, and what the docs point to
 * when they call `getViewportForBounds` "quite a low-level utility". The
 * arithmetic that used to sit here — half a card's width, a letterbox divisor, a
 * zoom computed from the viewport — is all inside `fitView`, and unlike our
 * version it clamps into `[minZoom, maxZoom]` so the camera cannot leave the
 * extent the canvas declares.
 *
 * **A camera command is issued, never awaited (ADR 0043).** Read against
 * `@xyflow/react@12.11.2` and `@xyflow/system@0.0.79`, a camera Promise has three
 * outcomes and only one of them is settlement:
 *
 * - It resolves, when the animation runs to its end.
 * - It never settles, when the animation is superseded. `getD3Transition`
 *   resolves via `.on('end', onEnd)`, and a superseded d3 transition fires
 *   `interrupt`, not `end`. This is the *common* case in normal use — any second
 *   camera command issued while the first is still running produces it.
 * - It never settles, when `fitView` runs before `panZoom` exists.
 *   `resolveFitView()` begins `if (!panZoom) return`, abandoning the resolver
 *   `withResolvers()` built.
 *
 * So **no required behaviour is chained on one of these Promises** — not with
 * `.then`, not with `await`. There is nothing left here that would want to:
 * dropping the two-phase move (ADR 0044) removed the only follow-up work this
 * seam ever had, and it was the `.then` carrying it that stranded the camera at
 * the overview zoom. `fitView` additionally *reuses* one resolver across calls,
 * so a second call before the first settles cannot be told apart from it.
 *
 * Rejection is a separate matter and is deliberately left unhandled. Nothing in
 * either library calls `reject`; the one reachable rejection is a synchronous
 * throw inside a Promise executor calling into d3, which is a genuine fault
 * rather than an interruption. A blanket `.catch` would silence the only signal
 * worth hearing while doing nothing about either hang above, so the `void` here
 * is exactly what it looks like: an unhandled rejection surfaces with its stack.
 *
 * Every claim above is a fact about the pinned release rather than about the
 * library's contract. Re-read `setTransform`, `resolveFitView` and
 * `getD3Transition` when the pin moves.
 */

/**
 * Returns the camera from presenting to the whole-graph overview (ADR 0027).
 *
 * Only the *return* — the initial fit belongs to React Flow's own `fitView`
 * prop, which runs before first paint at the identity transform. This effect
 * used to fire on mount as well, which put a second, animated fit *after* that
 * one, so every load began at the viewport origin and flew the whole graph in.
 * The mount case looked like it needed handling because the effect is the only
 * fit written down here; the prop is the other one, and it already ran.
 *
 * `previouslyPresenting` is what separates the two: an effect keyed on
 * `presenting` cannot otherwise tell "arrived at false" from "was always
 * false".
 */
export function OverviewCamera({ presenting }: { presenting: boolean }) {
  const { fitView } = useReactFlow();
  const previouslyPresenting = useRef(presenting);

  useEffect(() => {
    const wasPresenting = previouslyPresenting.current;
    previouslyPresenting.current = presenting;
    if (presenting || !wasPresenting) return;
    void fitView({ ...OVERVIEW_FIT, duration: OVERVIEW_DURATION });
  }, [presenting, fitView]);

  return null;
}

/**
 * Moves the camera to the Card the traversal has reached (ADR 0027).
 *
 * There is no second surface: presenting is this canvas, drawn close enough that
 * one card fills the screen. One `fitView` over that one card is the whole
 * mechanism (ADR 0044).
 *
 * It used to be two moves — pan at the wider scale, then close in — copied from
 * impress.js, where a combined move really does whip because impress animates
 * with CSS transitions. React Flow animates through d3-zoom, whose default
 * interpolator is `interpolateZoom`, the Van Wijk smooth zoom-out-pan-zoom-in
 * path; it solves the same problem in one call, and watching the two side by
 * side on the fixture found no difference to choose between. **Don't reinstate
 * the two-phase move** — ADR 0027 recommends it and ADR 0044 is why it is gone.
 *
 * The viewport size is a dependency rather than an argument to the fit: `fitView`
 * reads the container itself, but the effect must re-run when it changes, or a
 * resized window leaves the card framed for the old one.
 */
export function PresentingCamera({ activeCardId }: { activeCardId: string | null }) {
  const { fitView, getNode } = useReactFlow();
  const viewportWidth = useStore((s) => s.width);
  const viewportHeight = useStore((s) => s.height);

  useEffect(() => {
    if (!activeCardId || viewportWidth === 0 || viewportHeight === 0) return;
    // A `nodes` filter that matches nothing does not cancel the fit — it fits the
    // bounds of nothing, a zero-size rect at the origin, which lands the camera
    // at `maxZoom` on empty canvas. So the card has to be on screen first.
    if (!getNode(activeCardId)) return;

    void fitView({
      nodes: [{ id: activeCardId }],
      padding: PRESENTING_PADDING,
      duration: PRESENTING_DURATION,
    });
  }, [activeCardId, viewportWidth, viewportHeight, getNode, fitView]);

  return null;
}

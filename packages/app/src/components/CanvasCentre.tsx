import { useEffect } from 'react';
import { useStoreApi } from '@xyflow/react';
import type { LayoutPosition } from '@project/core';
import { CARD_SIZE } from '../card';

/** Where a Card created from a menu or a keystroke lands, in flow coordinates. */
export type VisibleCentre = () => LayoutPosition;

/**
 * Reports where the middle of the visible canvas currently is.
 *
 * Add Card and Add Alias place at the centre of what the author is looking at,
 * and neither is invoked from inside the flow: one is a toolbar control and the
 * other a pane over the graph. So the answer has to be *readable* from outside,
 * and it has to be read at the moment of the gesture rather than at any earlier
 * render — an author who panned after opening the Alias picker is looking
 * somewhere else by the time they choose a Target.
 *
 * Hence a getter handed upwards rather than a value: this component subscribes
 * to nothing and re-renders never. `useStoreApi` reads React Flow's store on
 * demand, where the pane's measured size and the live viewport transform both
 * already are — the same store the cameras read, rather than a second
 * measurement of the same DOM that could disagree with it.
 *
 * **`screenToFlowPosition` was the documented alternative and was weighed.** It
 * is the right call wherever a client point exists — `SpaceCanvas` uses it for
 * exactly that — and its arithmetic is the same `(point - pan) / zoom` written
 * below. The centre of the viewport is not such a point, though: reaching it
 * means measuring the pane with `getBoundingClientRect` and handing back the
 * middle, which is the second measurement this deliberately avoids, and the two
 * genuinely disagree — the store's `width`/`height` come from `offsetWidth` and
 * `offsetHeight` with React Flow's own `500` fallback, while the rect is live
 * and transform-affected. Converting a point we would have to derive from the
 * store anyway buys a documented name and costs the agreement.
 *
 * It is a component only because a hook needs somewhere to live inside
 * `ReactFlowProvider`. It draws nothing.
 *
 * **Not a camera.** It issues no command and moves nothing (ADR 0043): creating
 * a Card leaves the viewport exactly where it was, which is what makes the
 * centre the right place to put one.
 */
export function CanvasCentre({ report }: { report: (centre: VisibleCentre | null) => void }) {
  const store = useStoreApi();

  useEffect(() => {
    report(() => {
      const { width, height, transform } = store.getState();
      const [panX, panY, zoom] = transform;
      // A zoom of zero is not a viewport React Flow produces, but it is the one
      // value that would answer with `Infinity` and place a Card nowhere.
      const scale = zoom === 0 ? 1 : zoom;
      return {
        x: (-panX + width / 2) / scale - CARD_SIZE.width / 2,
        y: (-panY + height / 2) / scale - CARD_SIZE.height / 2,
      };
    });
    // Withdrawn on the way out, because the reader outlives the reporter. This
    // component is inside the canvas's `cards` branch — it needs React Flow's store —
    // and both controls that read the centre are outside it: the toolbar's Add
    // Card, and the Alias creation pane. A placement failure or a Space replaced
    // under the canvas unmounts this and leaves them holding a getter closed over
    // an unmounted provider's store, which is not a viewport and must not answer
    // as one. `App` falls back to the origin, exactly as it does before the first
    // report.
    return () => report(null);
  }, [report, store]);

  return null;
}

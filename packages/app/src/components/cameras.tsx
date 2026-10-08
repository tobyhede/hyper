import { useEffect, useRef } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import { viewportFromFraming, type SpaceResourceFraming } from '../space-resource-framing';

/**
 * Places the entered canvas at a Space Resource's stored camera.
 *
 * The stored framing is a Map-coordinate camera, and `viewportFromFraming`
 * places it on the *entered* canvas's own size, so the source Resource's
 * rectangle never becomes the destination viewport.
 *
 * **A camera command is issued, never awaited (ADR 0043).** Read against
 * `@xyflow/react@12.11.2` and `@xyflow/system@0.0.79`, a camera Promise never
 * settles when its animation is superseded: `getD3Transition` resolves on d3's
 * `end`, and a superseded transition fires `interrupt` instead. So no required
 * behaviour is chained on it. Re-read `setTransform` and `getD3Transition` when
 * the pin moves.
 *
 * Absent framing leaves React Flow's `fitView` prop to run.
 */
export function OpeningFramingCamera({ framing }: { framing: SpaceResourceFraming | undefined }) {
  const { setViewport } = useReactFlow();
  const viewportWidth = useStore((s) => s.width);
  const viewportHeight = useStore((s) => s.height);
  const applied = useRef(false);

  useEffect(() => {
    if (framing === undefined || applied.current || viewportWidth === 0 || viewportHeight === 0)
      return;
    applied.current = true;
    void setViewport(viewportFromFraming(framing, viewportWidth, viewportHeight), { duration: 0 });
  }, [framing, viewportWidth, viewportHeight, setViewport]);

  return null;
}

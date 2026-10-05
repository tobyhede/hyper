import type { ResourceShape } from '@project/core';
import {
  CanvasResource,
  CLOSED_DISPLAY,
  type CanvasResourceFront,
  type CanvasResourceState,
} from '@project/ui';

interface CanvasResourceSpecimenProps {
  readonly title: string;
  readonly kind?: CanvasResourceFront['kind'];
  readonly state?: Exclude<CanvasResourceState, 'editing'>;
  readonly graphColor?: string;
  /** The Shape a Map records for the Resource, which its Closed front draws. */
  readonly shape?: ResourceShape;
}

/**
 * Story fixture that composes the shipped visual primitive without redrawing it.
 *
 * Every front the component declares is reachable from here, each in its
 * resting, closed shape: every Resource kind and the creation ghost, which is
 * not a Resource yet and carries neither content nor open state. None of them is
 * handed an authoring callback, so what a specimen draws is the front itself
 * rather than the controls a canvas would hang off it.
 */
export function CanvasResourceSpecimen({
  title,
  kind = 'markdown',
  state = 'rest',
  graphColor = '#ffc53d',
  shape: resourceShape = 'rectangle',
}: CanvasResourceSpecimenProps) {
  const front: CanvasResourceFront = { kind };
  return (
    <CanvasResource
      front={front}
      display={CLOSED_DISPLAY}
      title={title}
      state={state}
      graphColor={graphColor}
      shape={resourceShape}
    />
  );
}

import type { CSSProperties } from 'react';
import type { ResourceShape } from '@project/core';
import {
  CanvasResource,
  CLOSED_DISPLAY,
  type KindOperations,
  type CanvasResourceState,
} from '@project/ui';

interface CanvasResourceSpecimenCommonProps {
  readonly title: string;
  readonly state?: Exclude<CanvasResourceState, 'editing'>;
  readonly graphColor?: string;
  /** The Shape a Map records for the Resource, which its front draws at any size. */
  readonly shape?: ResourceShape;
  /**
   * Draws the Resource Closed at this size, as a canvas adapter draws one
   * resized to it. Absent, it is the Closed Size.
   */
  readonly size?: { readonly width: number; readonly height: number };
  readonly kind?: KindOperations['kind'];
}

/** The two custom properties the stylesheet sizes a Resource from. */
export type ResourceFrameStyle = CSSProperties & {
  readonly '--resource-width': string;
  readonly '--resource-height': string;
};

type CanvasResourceSpecimenProps = CanvasResourceSpecimenCommonProps;

/**
 * Story fixture that composes the shipped visual primitive without redrawing it.
 *
 * Every front the component declares is reachable from here, each at rest and
 * Closed: every Resource kind and the creation ghost, which is not a Resource
 * yet and carries neither content nor open state. A specimen may also be drawn
 * at a given size. None of them is handed an authoring callback, so
 * what a specimen draws is the front itself rather than the controls a canvas
 * would hang off it.
 */
export function CanvasResourceSpecimen({
  title,
  kind = 'markdown',
  state = 'rest',
  graphColor = '#ffc53d',
  shape: resourceShape = 'rectangle',
  size,
}: CanvasResourceSpecimenProps) {
  const kindOperations: KindOperations = { kind };
  if (size === undefined) {
    return (
      <CanvasResource
        kindOperations={kindOperations}
        display={CLOSED_DISPLAY}
        title={title}
        state={state}
        graphColor={graphColor}
        shape={resourceShape}
      />
    );
  }
  const sized: ResourceFrameStyle = {
    '--resource-width': `${size.width}px`,
    '--resource-height': `${size.height}px`,
  };
  return (
    <div style={sized}>
      <CanvasResource
        kindOperations={kindOperations}
        display={CLOSED_DISPLAY}
        title={title}
        state={state}
        graphColor={graphColor}
        shape={resourceShape}
        size={size}
      />
    </div>
  );
}

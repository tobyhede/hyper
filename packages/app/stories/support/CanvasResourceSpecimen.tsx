import type { CSSProperties } from 'react';
import type { ResourceShape } from '@project/core';
import {
  CanvasResource,
  CLOSED_DISPLAY,
  type CanvasResourceFront,
  type CanvasResourceState,
} from '@project/ui';

interface CanvasResourceSpecimenCommonProps {
  readonly title: string;
  readonly state?: Exclude<CanvasResourceState, 'editing'>;
  readonly graphColor?: string;
  /** The Shape a Map records for the Resource, which its front draws Open or Closed. */
  readonly shape?: ResourceShape;
}

/** The two custom properties the stylesheet sizes a Resource from. */
type OpenFrameStyle = CSSProperties & {
  readonly '--resource-width': string;
  readonly '--resource-height': string;
};

type CanvasResourceSpecimenProps = CanvasResourceSpecimenCommonProps &
  (
    | { readonly kind?: CanvasResourceFront['kind']; readonly openSize?: never }
    | {
        readonly kind: 'ur';
        /**
         * Draws the Ur Resource Open at this size, as a canvas adapter draws one
         * resized to it. An Ur Resource has no content to supply, so it is the
         * one kind a specimen draws Open.
         */
        readonly openSize: { readonly width: number; readonly height: number };
      }
  );

/**
 * Story fixture that composes the shipped visual primitive without redrawing it.
 *
 * Every front the component declares is reachable from here, each at rest and
 * Closed: every Resource kind and the creation ghost, which is not a Resource
 * yet and carries neither content nor open state. An Ur Resource may also be
 * drawn Open at a given size. None of them is handed an authoring callback, so
 * what a specimen draws is the front itself rather than the controls a canvas
 * would hang off it.
 */
export function CanvasResourceSpecimen({
  title,
  kind = 'markdown',
  state = 'rest',
  graphColor = '#ffc53d',
  shape: resourceShape = 'rectangle',
  openSize,
}: CanvasResourceSpecimenProps) {
  const front: CanvasResourceFront = { kind };
  if (openSize === undefined) {
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
  const sized: OpenFrameStyle = {
    '--resource-width': `${openSize.width}px`,
    '--resource-height': `${openSize.height}px`,
  };
  return (
    <div style={sized}>
      <CanvasResource
        front={front}
        display={{ shown: 'open', content: { kind: 'ur', via: 'self' } }}
        title={title}
        state={state}
        graphColor={graphColor}
        shape={resourceShape}
        size={openSize}
      />
    </div>
  );
}

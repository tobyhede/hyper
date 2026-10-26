import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { COLLAPSED_RESOURCE_SIZE, type ResourceContent } from '@project/core';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import { CanvasResource } from '@project/ui';

/** A width and a height, in canvas units unless named otherwise. */
export interface Extent {
  readonly width: number;
  readonly height: number;
}

/**
 * The width Open and expand gives a Resource narrower than it, so a document
 * reads at a line length rather than in the Closed Size's column (ADR 0137).
 */
export const READING_WIDTH = 640;

/** The Stage's frame (ADR 0123), the least Open and expand gives a Resource at its width. */
const FRAME_RATIO = 16 / 9;

/** The screen pixels kept clear on each side of the visible canvas. */
const VIEW_MARGIN = 48;

/**
 * The most Open and expand may give a Resource: the visible canvas at the current
 * zoom, less a margin on each side, never below the Closed Size.
 */
export function visibleCanvasCap(viewport: Extent, zoom: number): Extent {
  return {
    width: Math.max(COLLAPSED_RESOURCE_SIZE.width, (viewport.width - 2 * VIEW_MARGIN) / zoom),
    height: Math.max(COLLAPSED_RESOURCE_SIZE.height, (viewport.height - 2 * VIEW_MARGIN) / zoom),
  };
}

/**
 * The size Open and expand asks for (ADR 0137): the reading width, or the
 * Resource's own when it is wider, and the height its Open content needs at
 * that width, at least the Stage's frame. Both are capped at the visible
 * canvas and floored at the Closed Size, whole units.
 *
 * `needs` answers the height the Open Resource takes at a width when drawn at
 * a height, which is the height given when its content asks for no more.
 */
export function openAndExpandSize(
  current: Extent,
  cap: Extent,
  needs: (size: Extent) => number,
): Extent {
  const width = Math.round(
    Math.max(
      COLLAPSED_RESOURCE_SIZE.width,
      Math.min(cap.width, Math.max(current.width, READING_WIDTH)),
    ),
  );
  const frame = Math.min(cap.height, width / FRAME_RATIO);
  const height = Math.round(
    Math.max(COLLAPSED_RESOURCE_SIZE.height, Math.min(cap.height, needs({ width, height: frame }))),
  );
  return { width, height };
}

/**
 * The height a Resource Open with `content` takes at `size`: the height given,
 * grown by however far its content overflows it.
 *
 * Measured, because what a document's text needs is a fact of its type, not of
 * its source: the Resource is drawn read-only into `host`, hidden, through the
 * same `CanvasResource` the canvas draws, and taken down before this returns.
 * Content that adapts to its rect — a picture scales, an embedded Map fits —
 * never overflows, and asks for the height given.
 */
export function openHeight(
  host: Element,
  node: ResourceFlowNode,
  content: ResourceContent,
  size: Extent,
): number {
  const frame = host.ownerDocument.createElement('div');
  frame.setAttribute('aria-hidden', 'true');
  frame.inert = true;
  frame.className = 'rf-resource-node__inner';
  Object.assign(frame.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: `${size.width}px`,
    height: `${size.height}px`,
    visibility: 'hidden',
    pointerEvents: 'none',
  });
  host.append(frame);
  const root = createRoot(frame);
  try {
    flushSync(() => {
      root.render(
        <CanvasResource
          readOnly
          kindOperations={node.data.kindOperations}
          display={{ shown: 'open', content }}
          shape={node.data.shape}
          size={size}
          title={node.data.title}
          graphColor={node.data.activeGraphColor}
          state="rest"
        />,
      );
    });
    let overflow = 0;
    for (const element of frame.querySelectorAll(
      '.canvas-resource__content, .canvas-resource__content *',
    )) {
      overflow = Math.max(overflow, element.scrollHeight - element.clientHeight);
    }
    return size.height + overflow;
  } finally {
    root.unmount();
    frame.remove();
  }
}

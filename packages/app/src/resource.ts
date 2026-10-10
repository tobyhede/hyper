/**
 * The Closed Size, read from `COLLAPSED_RESOURCE_SIZE` in `@project/core` and
 * handed to the stylesheet.
 *
 * It is the size of a Resource whose Map entry authors none (`resourceSize` in
 * `@project/core`), and the floor every authored size keeps, which the Map
 * entry's size schema enforces (`packages/core/test/schema.test.ts`, "refuses a
 * size below the Closed Size on either axis, Open or Closed"). A Resource's size
 * is authored and independent of Open: Resize changes it, Open and Close do not
 * (`packages/app/test/space-authoring-operations.test.ts`, "Resource size and
 * Open"). So a measured DOM size never decides placement here, the way it
 * must in a layout whose nodes are content-sized: content adapts to the
 * Resource, not the Resource to its content.
 *
 * Only the proportion is a design decision. The base width is arbitrary:
 * placement is authored in its own coordinate space, and React Flow's zoom maps
 * it to the viewport.
 *
 * **16:9, matching the presentation surface.** A Resource at the Closed Size and
 * the same Resource being presented share a silhouette. The ratio is chosen for the medium a
 * presentation actually lands on: projectors and external displays are
 * overwhelmingly 16:9, and that is the worst case to letterbox.
 *
 * **There is one source for the size, and it is `COLLAPSED_RESOURCE_SIZE`.** Do
 * not restate the ratio in a stylesheet: a mismatch would make the graph
 * misrepresent what an audience sees.
 */

import type { CSSProperties } from 'react';
import { COLLAPSED_RESOURCE_SIZE } from '@project/core';

export const RESOURCE_WIDTH = COLLAPSED_RESOURCE_SIZE.width;
export const RESOURCE_HEIGHT = COLLAPSED_RESOURCE_SIZE.height;

/** The size a layout strategy arranges resources at. */
export const RESOURCE_SIZE = { width: RESOURCE_WIDTH, height: RESOURCE_HEIGHT } as const;

/**
 * Handed to the graph container so the stylesheet draws resources at exactly the size
 * the strategy placed them at. If these drift, anchors land where the resource isn't.
 */
export const resourceSizeVars =
  // SAFETY: CSSProperties doesn't type CSS custom properties (`--*`); these
  // two are read only by the stylesheet, which is their actual contract.
  {
    '--resource-width': `${RESOURCE_WIDTH}px`,
    '--resource-height': `${RESOURCE_HEIGHT}px`,
  } as CSSProperties;

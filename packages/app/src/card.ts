/**
 * The shape of a card in the graph — declared once, consumed by both the layout
 * and the stylesheet.
 *
 * A card draws its title (ADR 0006), so its content is bounded and every card is
 * the same shape. That makes the size a design constant rather than something
 * measured: content adapts to the card, not the card to the content. It is why
 * feeding measured DOM sizes into ELK — which React Flow's elkjs example must do,
 * because its nodes are content-sized — is unnecessary here.
 *
 * Expressed as a ratio because that is the part that is deliberate. The base
 * width is arbitrary: ELK lays out in its own coordinate space, and React Flow's
 * zoom maps it to the viewport, so only the proportion is a design decision.
 *
 * **16:9, matching the presentation surface.** A card in the graph and the same
 * card being presented are one object, so they share a silhouette — click a card,
 * present it, and the shape does not change. The ratio is chosen for the medium a
 * presentation actually lands on: projectors and external displays are
 * overwhelmingly 16:9, and that is the worst case to letterbox.
 *
 * This couples the surfaces deliberately. The frame an opened or presented card
 * is drawn in (`.card-pane__panel`) uses the same ratio. **If one changes, change
 * the other** — a mismatch would make the graph misrepresent what an audience
 * sees, and would break outright if the "show full content" view of ADR 0006
 * arrives and a card becomes a live preview of a slide.
 *
 * (The predecessor was 260x300 portrait, inherited from when a card rendered a
 * clipped page rather than a title.)
 */

import type { CSSProperties } from 'react';
import { COLLAPSED_CARD_SIZE } from '@project/core';

export const CARD_ASPECT_RATIO = 16 / 9;

export const CARD_WIDTH = COLLAPSED_CARD_SIZE.width;
export const CARD_HEIGHT = COLLAPSED_CARD_SIZE.height;

/** The size a layout arranges cards at. */
export const CARD_SIZE = { width: CARD_WIDTH, height: CARD_HEIGHT } as const;
export const DEFAULT_EXPANDED_CARD_SIZE = { width: 560, height: 420 } as const;

/**
 * Handed to the graph container so the stylesheet draws cards at exactly the size
 * the layout placed them at. If these drift, ports land where the card isn't.
 */
export const cardSizeVars =
  // SAFETY: CSSProperties doesn't type CSS custom properties (`--*`); these
  // two are read only by the stylesheet, which is their actual contract.
  {
    '--card-width': `${CARD_WIDTH}px`,
    '--card-height': `${CARD_HEIGHT}px`,
  } as CSSProperties;

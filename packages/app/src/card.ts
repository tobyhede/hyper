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
 * 16:10 landscape. A title-sized card reads as a label, and the shipped 260x300
 * portrait box was inherited from when a card rendered a clipped page. Landscape
 * also roughly halves a card's height, so far more of a space fits on screen —
 * which is the point of an overview.
 */

import type { CSSProperties } from 'react';

export const CARD_ASPECT_RATIO = 16 / 10;

const BASE_WIDTH = 260;

export const CARD_WIDTH = BASE_WIDTH;
export const CARD_HEIGHT = Math.round(BASE_WIDTH / CARD_ASPECT_RATIO);

/** The size a layout arranges cards at. */
export const CARD_SIZE = { width: CARD_WIDTH, height: CARD_HEIGHT } as const;

/**
 * Handed to the graph container so the stylesheet draws cards at exactly the size
 * the layout placed them at. If these drift, ports land where the card isn't.
 */
export const cardSizeVars = {
  '--card-width': `${CARD_WIDTH}px`,
  '--card-height': `${CARD_HEIGHT}px`,
} as CSSProperties;

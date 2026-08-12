import { uuidSchema, type SpaceSnapshot } from '@project/core';

/**
 * The minimal valid Space the root HTTP tests commit and read back.
 *
 * Shared because three suites were each declaring the same two ids and the same
 * one-card snapshot, which reads as three unrelated fixtures that coincidentally
 * agree — and would drift the moment one of them needed a second card.
 */
export const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
export const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');

export const oneCardSnapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 1, title: 'One' },
  cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: '' } }],
};

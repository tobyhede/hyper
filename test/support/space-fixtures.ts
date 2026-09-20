import { uuidSchema, type SpaceSnapshot } from '@project/core';

/**
 * The minimal valid Space the root HTTP tests commit and read back.
 *
 * Shared because three suites were each declaring the same two ids and the same
 * one-resource snapshot, which reads as three unrelated fixtures that coincidentally
 * agree — and would drift the moment one of them needed a second resource.
 */
export const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
export const RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');

export const oneResourceSnapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 1, title: 'One' },
  resources: [{ id: RESOURCE_ID, document: { title: 'A', kind: 'markdown', body: '' } }],
};

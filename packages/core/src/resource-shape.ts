import type { ResourcePlacement, ResourceShape } from './types';

/**
 * The Shape a Map entry with none stored draws as (ADR 0120). No Edit writes it
 * on a Resource's behalf: an entry stores a Shape only once the author chooses
 * one.
 */
export const DEFAULT_RESOURCE_SHAPE: ResourceShape = 'rectangle';

/** The Shape a Map draws a Resource in: its entry's stored one, else the default. */
export const resourceShape = (entry: Pick<ResourcePlacement, 'shape'>): ResourceShape =>
  entry.shape ?? DEFAULT_RESOURCE_SHAPE;

import { COLLAPSED_RESOURCE_SIZE } from './resource-geometry';
import type { ResourcePlacement } from './types';

/** A Resource's size on a Map, in canvas units. */
export type ResourceSize = { readonly width: number; readonly height: number };

/**
 * The size a Map draws a Resource at: its entry's stored one, else the Closed
 * Size. Open or Closed alike — Opening changes what is drawn inside the rect,
 * never the rect. No Edit writes a size on a Resource's behalf: an entry stores
 * one only once the author resizes it.
 */
export const resourceSize = (entry: Pick<ResourcePlacement, 'size'>): ResourceSize =>
  entry.size ?? COLLAPSED_RESOURCE_SIZE;

/** Whether a Map draws a Resource Open: its entry's stored state, else Closed. */
export const resourceOpen = (entry: Pick<ResourcePlacement, 'open'>): boolean =>
  entry.open ?? false;

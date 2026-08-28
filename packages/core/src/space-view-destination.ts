import { decodeCompactUuid, encodeCompactUuid } from './compact-uuid';
import { isComputedViewId } from './schema';
import type { SpaceSnapshot, UUID } from './types';

export type SpaceViewDestinationResolution =
  | { readonly kind: 'malformed' }
  | { readonly kind: 'unresolved' }
  | { readonly kind: 'resolved'; readonly spaceId: UUID; readonly spaceViewId: UUID };

export type ParsedSpaceViewDestination =
  | { readonly kind: 'malformed' }
  | { readonly kind: 'parsed'; readonly spaceId: UUID; readonly spaceViewId: UUID };

/** Parse ADR 0069's one variant-neutral Space View route shape. */
export function parseSpaceViewDestination(pathname: string): ParsedSpaceViewDestination {
  const match = /^\/spaces\/([^/]+)\/views\/([^/]+)$/.exec(pathname);
  if (match === null) return { kind: 'malformed' };
  const compactSpaceId = match[1];
  const compactSpaceViewId = match[2];
  if (compactSpaceId === undefined || compactSpaceViewId === undefined) {
    return { kind: 'malformed' };
  }
  const spaceId = decodeCompactUuid(compactSpaceId);
  const spaceViewId = decodeCompactUuid(compactSpaceViewId);
  return spaceId === undefined || spaceViewId === undefined
    ? { kind: 'malformed' }
    : { kind: 'parsed', spaceId, spaceViewId };
}

/** Format the one public route shared by Computed Views and Layouts. */
export const spaceViewDestinationPath = (spaceId: UUID, spaceViewId: UUID): string =>
  `/spaces/${encodeCompactUuid(spaceId)}/views/${encodeCompactUuid(spaceViewId)}`;

/** Resolve ADR 0069's variant-neutral Space View product destination. */
export function resolveSpaceViewDestination(
  snapshot: SpaceSnapshot,
  pathname: string,
): SpaceViewDestinationResolution {
  const parsed = parseSpaceViewDestination(pathname);
  if (parsed.kind === 'malformed') return parsed;
  const { spaceId, spaceViewId } = parsed;
  if (snapshot.id !== spaceId) return { kind: 'unresolved' };

  const layout = snapshot.document.layouts?.find(({ id }) => id === spaceViewId);
  const computed = isComputedViewId(spaceViewId);
  if (layout !== undefined && computed) {
    throw new Error(`Space View identity collision for ${spaceViewId}`);
  }
  if (layout === undefined && !computed) return { kind: 'unresolved' };
  return { kind: 'resolved', spaceId, spaceViewId };
}

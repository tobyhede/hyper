import { decodeCompactUuid, encodeCompactUuid, isComputedViewId, type UUID } from '@project/core';
import type { LoadedSpace, SpaceBackend } from '@project/persistence';

export type ProductDestination =
  | { readonly kind: 'space'; readonly spaceId: UUID }
  | { readonly kind: 'space-view'; readonly spaceId: UUID; readonly spaceViewId: UUID };

export type ProductDestinationResolution =
  | { readonly kind: 'outside' }
  | { readonly kind: 'malformed' }
  | { readonly kind: 'unresolved' }
  | {
      readonly kind: 'resolved';
      readonly destination: ProductDestination;
      readonly loaded: LoadedSpace;
    };

export const productDestinationPath = (destination: ProductDestination): string => {
  const space = `/spaces/${encodeCompactUuid(destination.spaceId)}`;
  return destination.kind === 'space'
    ? space
    : `${space}/views/${encodeCompactUuid(destination.spaceViewId)}`;
};

type ProductDestinationLoader = Pick<SpaceBackend, 'loadSpace'>;

const parseProductDestination = (pathname: string): ProductDestination | undefined => {
  const segments = pathname.split('/');
  if (segments.length !== 3 && segments.length !== 5) return undefined;
  if (segments[0] !== '' || segments[1] !== 'spaces') return undefined;
  const spaceId = decodeCompactUuid(segments[2] ?? '');
  if (spaceId === undefined) return undefined;
  if (segments.length === 3) return { kind: 'space', spaceId };
  if (segments[3] !== 'views') return undefined;
  const spaceViewId = decodeCompactUuid(segments[4] ?? '');
  return spaceViewId === undefined ? undefined : { kind: 'space-view', spaceId, spaceViewId };
};

export const resolveProductDestination = async (
  loader: ProductDestinationLoader,
  pathname: string,
): Promise<ProductDestinationResolution> => {
  if (pathname !== '/spaces' && !pathname.startsWith('/spaces/')) return { kind: 'outside' };
  const destination = parseProductDestination(pathname);
  if (destination === undefined) return { kind: 'malformed' };
  const loaded = await loader.loadSpace(destination.spaceId);
  if (loaded === undefined) return { kind: 'unresolved' };
  if (destination.kind === 'space-view') {
    const layout = loaded.snapshot.document.layouts?.find(
      ({ id }) => id === destination.spaceViewId,
    );
    const computed = isComputedViewId(destination.spaceViewId);
    if (layout !== undefined && computed) {
      throw new Error(`Space View identity collision for ${destination.spaceViewId}`);
    }
    if (layout === undefined && !computed) return { kind: 'unresolved' };
  }
  return { kind: 'resolved', destination, loaded };
};

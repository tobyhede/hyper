import {
  decodeCompactUuid,
  encodeCompactUuid,
  isComputedViewId,
  type CardId,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import type { LoadedSpace, SpaceBackend } from '@project/persistence';

export type ProductDestination =
  | { readonly kind: 'space'; readonly spaceId: UUID }
  | { readonly kind: 'space-view'; readonly spaceId: UUID; readonly spaceViewId: UUID }
  | { readonly kind: 'card'; readonly spaceId: UUID; readonly cardId: CardId }
  | {
      readonly kind: 'space-view-card';
      readonly spaceId: UUID;
      readonly spaceViewId: UUID;
      readonly cardId: CardId;
    };

export type ProductDestinationResolution =
  | { readonly kind: 'outside' }
  | { readonly kind: 'malformed' }
  | { readonly kind: 'unresolved' }
  | {
      readonly kind: 'resolved';
      readonly destination: ProductDestination;
      readonly loaded: LoadedSpace;
    };

export type ProductDestinationSnapshotResolution =
  | { readonly kind: 'outside' }
  | { readonly kind: 'malformed' }
  | { readonly kind: 'unresolved' }
  | { readonly kind: 'resolved'; readonly destination: ProductDestination };

export const productDestinationPath = (destination: ProductDestination): string => {
  const space = `/spaces/${encodeCompactUuid(destination.spaceId)}`;
  if (destination.kind === 'space') return space;
  if (destination.kind === 'card') return `${space}/cards/${encodeCompactUuid(destination.cardId)}`;
  const view = `${space}/views/${encodeCompactUuid(destination.spaceViewId)}`;
  return destination.kind === 'space-view'
    ? view
    : `${view}/cards/${encodeCompactUuid(destination.cardId)}`;
};

type ProductDestinationLoader = Pick<SpaceBackend, 'loadSpace'>;

const parseProductDestination = (pathname: string): ProductDestination | undefined => {
  const segments = pathname.split('/');
  if (segments.length !== 3 && segments.length !== 5 && segments.length !== 7) return undefined;
  if (segments[0] !== '' || segments[1] !== 'spaces') return undefined;
  const spaceId = decodeCompactUuid(segments[2] ?? '');
  if (spaceId === undefined) return undefined;
  if (segments.length === 3) return { kind: 'space', spaceId };
  if (segments[3] === 'cards' && segments.length === 5) {
    const cardId = decodeCompactUuid(segments[4] ?? '');
    return cardId === undefined ? undefined : { kind: 'card', spaceId, cardId };
  }
  if (segments[3] !== 'views') return undefined;
  const spaceViewId = decodeCompactUuid(segments[4] ?? '');
  if (spaceViewId === undefined) return undefined;
  if (segments.length === 5) return { kind: 'space-view', spaceId, spaceViewId };
  if (segments[5] !== 'cards') return undefined;
  const cardId = decodeCompactUuid(segments[6] ?? '');
  return cardId === undefined
    ? undefined
    : { kind: 'space-view-card', spaceId, spaceViewId, cardId };
};

const destinationInSnapshot = (
  snapshot: SpaceSnapshot,
  destination: ProductDestination,
): ProductDestinationSnapshotResolution => {
  if (destination.spaceId !== snapshot.id) return { kind: 'unresolved' };
  if (destination.kind === 'card' || destination.kind === 'space-view-card') {
    if (!snapshot.cards.some(({ id }) => id === destination.cardId)) return { kind: 'unresolved' };
  }
  if (destination.kind === 'space-view' || destination.kind === 'space-view-card') {
    const layout = snapshot.document.layouts?.find(({ id }) => id === destination.spaceViewId);
    const computed = isComputedViewId(destination.spaceViewId);
    if (layout !== undefined && computed) {
      throw new Error(`Space View identity collision for ${destination.spaceViewId}`);
    }
    if (layout === undefined && !computed) return { kind: 'unresolved' };
    if (
      destination.kind === 'space-view-card' &&
      layout !== undefined &&
      layout.positions[destination.cardId] === undefined
    ) {
      return { kind: 'unresolved' };
    }
  }
  return { kind: 'resolved', destination };
};

/** Resolve browser history against the snapshot the application already has open. */
export const resolveProductDestinationInSnapshot = (
  snapshot: SpaceSnapshot,
  pathname: string,
): ProductDestinationSnapshotResolution => {
  if (pathname !== '/spaces' && !pathname.startsWith('/spaces/')) return { kind: 'outside' };
  const destination = parseProductDestination(pathname);
  return destination === undefined
    ? { kind: 'malformed' }
    : destinationInSnapshot(snapshot, destination);
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
  const resolution = destinationInSnapshot(loaded.snapshot, destination);
  return resolution.kind === 'resolved' ? { ...resolution, loaded } : resolution;
};

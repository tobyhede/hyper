import {
  decodeCompactUuid,
  encodeCompactUuid,
  isComputedViewId,
  type CardId,
  type GraphId,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import type { LoadedSpace, SpaceResourceRepository } from '@project/persistence';

export type ProductDestination =
  | { readonly kind: 'space'; readonly spaceId: UUID }
  | { readonly kind: 'space-view'; readonly spaceId: UUID; readonly spaceViewId: UUID }
  | { readonly kind: 'card'; readonly spaceId: UUID; readonly cardId: CardId }
  | { readonly kind: 'graph'; readonly spaceId: UUID; readonly graphId: GraphId }
  | {
      readonly kind: 'space-view-card';
      readonly spaceId: UUID;
      readonly spaceViewId: UUID;
      readonly cardId: CardId;
    }
  | {
      readonly kind: 'space-view-graph';
      readonly spaceId: UUID;
      readonly spaceViewId: UUID;
      readonly graphId: GraphId;
    }
  | {
      readonly kind: 'presentation';
      readonly spaceId: UUID;
      readonly spaceViewId: UUID;
      readonly graphId: GraphId;
      readonly cardId: CardId;
    };

/**
 * A Space View id that an available Computed View and a declared Layout both
 * claim (ADR 0069). Neither takes precedence, so the destination names no one
 * thing and resolution says so instead of choosing.
 *
 * It is a resolution kind and not a throw because both callers are handlers:
 * server-side it decides a response, and in the browser it runs inside a
 * `popstate` listener, where an exception reaches nothing that could answer.
 * Intake already rejects such a Space (`space-view-id-collision`), so this is
 * the answer for a document that reached storage some other way — not a second
 * validation pass, which is why it costs no scan the resolution below was not
 * doing anyway.
 */
type ProductDestinationCollision = {
  readonly kind: 'collision';
  readonly spaceViewId: UUID;
};

export type ProductDestinationResolution =
  | { readonly kind: 'outside' }
  | { readonly kind: 'malformed' }
  | { readonly kind: 'unresolved' }
  | ProductDestinationCollision
  | {
      readonly kind: 'resolved';
      readonly destination: ProductDestination;
      readonly loaded: LoadedSpace;
    };

export type ProductDestinationSnapshotResolution =
  | { readonly kind: 'outside' }
  | { readonly kind: 'malformed' }
  | { readonly kind: 'unresolved' }
  | ProductDestinationCollision
  | { readonly kind: 'resolved'; readonly destination: ProductDestination };

export const productDestinationPath = (destination: ProductDestination): string => {
  const space = `/spaces/${encodeCompactUuid(destination.spaceId)}`;
  if (destination.kind === 'space') return space;
  if (destination.kind === 'card') return `${space}/cards/${encodeCompactUuid(destination.cardId)}`;
  if (destination.kind === 'graph') {
    return `${space}/graphs/${encodeCompactUuid(destination.graphId)}`;
  }
  const view = `${space}/views/${encodeCompactUuid(destination.spaceViewId)}`;
  if (destination.kind === 'presentation') {
    return `${view}/graphs/${encodeCompactUuid(destination.graphId)}/present/${encodeCompactUuid(destination.cardId)}`;
  }
  return destination.kind === 'space-view'
    ? view
    : destination.kind === 'space-view-card'
      ? `${view}/cards/${encodeCompactUuid(destination.cardId)}`
      : `${view}/graphs/${encodeCompactUuid(destination.graphId)}`;
};

type ProductDestinationLoader = Pick<SpaceResourceRepository, 'loadSpace'>;

const parseProductDestination = (pathname: string): ProductDestination | undefined => {
  const segments = pathname.split('/');
  if (
    segments.length !== 3 &&
    segments.length !== 5 &&
    segments.length !== 7 &&
    segments.length !== 9
  ) {
    return undefined;
  }
  if (segments[0] !== '' || segments[1] !== 'spaces') return undefined;
  const spaceId = decodeCompactUuid(segments[2] ?? '');
  if (spaceId === undefined) return undefined;
  if (segments.length === 3) return { kind: 'space', spaceId };
  if (segments[3] === 'cards' && segments.length === 5) {
    const cardId = decodeCompactUuid(segments[4] ?? '');
    return cardId === undefined ? undefined : { kind: 'card', spaceId, cardId };
  }
  if (segments[3] === 'graphs' && segments.length === 5) {
    const graphId = decodeCompactUuid(segments[4] ?? '');
    return graphId === undefined ? undefined : { kind: 'graph', spaceId, graphId };
  }
  if (segments[3] !== 'views') return undefined;
  const spaceViewId = decodeCompactUuid(segments[4] ?? '');
  if (spaceViewId === undefined) return undefined;
  if (segments.length === 5) return { kind: 'space-view', spaceId, spaceViewId };
  if (segments.length === 9) {
    if (segments[5] !== 'graphs' || segments[7] !== 'present') return undefined;
    const graphId = decodeCompactUuid(segments[6] ?? '');
    const cardId = decodeCompactUuid(segments[8] ?? '');
    return graphId === undefined || cardId === undefined
      ? undefined
      : { kind: 'presentation', spaceId, spaceViewId, graphId, cardId };
  }
  if (segments[5] === 'cards') {
    const cardId = decodeCompactUuid(segments[6] ?? '');
    return cardId === undefined
      ? undefined
      : { kind: 'space-view-card', spaceId, spaceViewId, cardId };
  }
  if (segments[5] === 'graphs') {
    const graphId = decodeCompactUuid(segments[6] ?? '');
    return graphId === undefined
      ? undefined
      : { kind: 'space-view-graph', spaceId, spaceViewId, graphId };
  }
  return undefined;
};

const destinationInSnapshot = (
  snapshot: SpaceSnapshot,
  destination: ProductDestination,
): ProductDestinationSnapshotResolution => {
  if (destination.spaceId !== snapshot.id) return { kind: 'unresolved' };
  if (
    destination.kind === 'card' ||
    destination.kind === 'space-view-card' ||
    destination.kind === 'presentation'
  ) {
    if (!snapshot.cards.some(({ id }) => id === destination.cardId)) return { kind: 'unresolved' };
  }
  const graphOwner =
    destination.kind === 'graph' ||
    destination.kind === 'space-view-graph' ||
    destination.kind === 'presentation'
      ? snapshot.document.layouts?.find((layout) =>
          layout.graphs.some(({ id }) => id === destination.graphId),
        )
      : undefined;
  if (
    (destination.kind === 'graph' ||
      destination.kind === 'space-view-graph' ||
      destination.kind === 'presentation') &&
    graphOwner === undefined
  ) {
    return { kind: 'unresolved' };
  }
  if (
    destination.kind === 'space-view' ||
    destination.kind === 'space-view-card' ||
    destination.kind === 'space-view-graph' ||
    destination.kind === 'presentation'
  ) {
    const layout = snapshot.document.layouts?.find(({ id }) => id === destination.spaceViewId);
    const computed = isComputedViewId(destination.spaceViewId);
    if (layout === undefined && !computed) return { kind: 'unresolved' };
    // Both, which is the broken invariant: the id names two Space Views and
    // neither wins. Read off the two facts the Layout branch already had rather
    // than scanned for, so a destination naming no Space View — a canonical
    // Space, Card or Graph — never asks the question and never pays for it.
    if (layout !== undefined && computed) {
      return { kind: 'collision', spaceViewId: destination.spaceViewId };
    }
    if (
      destination.kind === 'space-view-card' &&
      layout !== undefined &&
      layout.positions[destination.cardId] === undefined
    ) {
      return { kind: 'unresolved' };
    }
    if (
      (destination.kind === 'space-view-graph' || destination.kind === 'presentation') &&
      layout !== undefined &&
      layout.id !== graphOwner?.id
    ) {
      return { kind: 'unresolved' };
    }
    if (destination.kind === 'presentation') {
      const graph = graphOwner?.graphs.find(({ id }) => id === destination.graphId);
      const graphContainsCard = graph?.edges.some(
        ({ from, to }) => from === destination.cardId || to === destination.cardId,
      );
      if (graphContainsCard !== true) return { kind: 'unresolved' };
    }
  }
  return { kind: 'resolved', destination };
};

/**
 * What a pathname claims, before any Space is read: not a product address at
 * all, one that cannot be read, or one that reads as a destination.
 *
 * The step both resolutions below take first, named because a host owes an
 * answer to a request it will never serve — a method the product contract does
 * not offer — and owes it without reading a Space, since no Space could change
 * it. `/spaces` is malformed rather than outside: the collection is not
 * addressable, and a bad address of ours is still ours to answer.
 */
export type ProductAddress =
  | { readonly kind: 'outside' }
  | { readonly kind: 'malformed' }
  | { readonly kind: 'addressed'; readonly destination: ProductDestination };

export const productAddress = (pathname: string): ProductAddress => {
  if (pathname !== '/spaces' && !pathname.startsWith('/spaces/')) return { kind: 'outside' };
  const destination = parseProductDestination(pathname);
  return destination === undefined ? { kind: 'malformed' } : { kind: 'addressed', destination };
};

/** Resolve browser history against the snapshot the application already has open. */
export const resolveProductDestinationInSnapshot = (
  snapshot: SpaceSnapshot,
  pathname: string,
): ProductDestinationSnapshotResolution => {
  const address = productAddress(pathname);
  return address.kind === 'addressed'
    ? destinationInSnapshot(snapshot, address.destination)
    : address;
};

export const resolveProductDestination = async (
  loader: ProductDestinationLoader,
  pathname: string,
): Promise<ProductDestinationResolution> => {
  const address = productAddress(pathname);
  if (address.kind !== 'addressed') return address;
  const loaded = await loader.loadSpace(address.destination.spaceId);
  if (loaded === undefined) return { kind: 'unresolved' };
  const resolution = destinationInSnapshot(loaded.snapshot, address.destination);
  return resolution.kind === 'resolved' ? { ...resolution, loaded } : resolution;
};

/**
 * What a host answers for a product address it owns, ahead of the SPA fallback.
 *
 * Declared here because the seam has two sides and neither can typecheck the
 * other: the Node host composes the answer (`src/http/space-host.ts`) and the
 * Vite plugin writes it onto a `ServerResponse`, importing this by relative
 * path because a Vite config externalizes bare specifiers. Both sides used to
 * declare their own copy, and the copies had already drifted — one naming the
 * statuses it produces, the other any `number` at all.
 *
 * A closed set of statuses rather than `number`, because the set is the
 * contract ADR 0069 states for a direct request: a temporary redirect to the
 * Entry Space, a bad request for an address that cannot be read at all, a
 * not-found for one that reads and names nothing, a method rejection for a
 * request that is not a read, and an internal error for a stored document whose
 * Space View identities collide.
 */
export interface ProductResponse {
  readonly status: 302 | 400 | 404 | 405 | 500;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

/**
 * The product half of a host application: what it owns before the application
 * shell is served at all.
 *
 * `undefined` is the fallthrough — the address is not the host's, or it is and
 * the destination resolves, and either way the shell answers it.
 */
export interface ProductRequestResolver {
  resolveProductRequest(
    pathname: string,
    method: string,
    accept?: string,
  ): Promise<ProductResponse | undefined>;
}

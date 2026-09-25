import {
  decodeCompactUuid,
  encodeCompactUuid,
  type ResourceId,
  type GraphId,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import type { LoadedSpace, StoredSpaceRepository } from '@project/persistence';

export type ProductDestination =
  | { readonly kind: 'space'; readonly spaceId: UUID }
  | { readonly kind: 'map'; readonly spaceId: UUID; readonly mapId: UUID }
  | { readonly kind: 'resource'; readonly spaceId: UUID; readonly resourceId: ResourceId }
  | { readonly kind: 'graph'; readonly spaceId: UUID; readonly graphId: GraphId }
  | {
      readonly kind: 'map-resource';
      readonly spaceId: UUID;
      readonly mapId: UUID;
      readonly resourceId: ResourceId;
    }
  | {
      readonly kind: 'map-graph';
      readonly spaceId: UUID;
      readonly mapId: UUID;
      readonly graphId: GraphId;
    }
  | {
      readonly kind: 'presentation';
      readonly spaceId: UUID;
      readonly mapId: UUID;
      readonly graphId: GraphId;
      readonly resourceId: ResourceId;
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
  if (destination.kind === 'resource')
    return `${space}/resources/${encodeCompactUuid(destination.resourceId)}`;
  if (destination.kind === 'graph') {
    return `${space}/graphs/${encodeCompactUuid(destination.graphId)}`;
  }
  const map = `${space}/maps/${encodeCompactUuid(destination.mapId)}`;
  if (destination.kind === 'presentation') {
    return `${map}/graphs/${encodeCompactUuid(destination.graphId)}/present/${encodeCompactUuid(destination.resourceId)}`;
  }
  return destination.kind === 'map'
    ? map
    : destination.kind === 'map-resource'
      ? `${map}/resources/${encodeCompactUuid(destination.resourceId)}`
      : `${map}/graphs/${encodeCompactUuid(destination.graphId)}`;
};

type ProductDestinationLoader = Pick<StoredSpaceRepository, 'loadSpace'>;

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
  if (segments[3] === 'resources' && segments.length === 5) {
    const resourceId = decodeCompactUuid(segments[4] ?? '');
    return resourceId === undefined ? undefined : { kind: 'resource', spaceId, resourceId };
  }
  if (segments[3] === 'graphs' && segments.length === 5) {
    const graphId = decodeCompactUuid(segments[4] ?? '');
    return graphId === undefined ? undefined : { kind: 'graph', spaceId, graphId };
  }
  if (segments[3] !== 'maps') return undefined;
  const mapId = decodeCompactUuid(segments[4] ?? '');
  if (mapId === undefined) return undefined;
  if (segments.length === 5) return { kind: 'map', spaceId, mapId };
  if (segments.length === 9) {
    if (segments[5] !== 'graphs' || segments[7] !== 'present') return undefined;
    const graphId = decodeCompactUuid(segments[6] ?? '');
    const resourceId = decodeCompactUuid(segments[8] ?? '');
    return graphId === undefined || resourceId === undefined
      ? undefined
      : { kind: 'presentation', spaceId, mapId, graphId, resourceId };
  }
  if (segments[5] === 'resources') {
    const resourceId = decodeCompactUuid(segments[6] ?? '');
    return resourceId === undefined
      ? undefined
      : { kind: 'map-resource', spaceId, mapId, resourceId };
  }
  if (segments[5] === 'graphs') {
    const graphId = decodeCompactUuid(segments[6] ?? '');
    return graphId === undefined ? undefined : { kind: 'map-graph', spaceId, mapId, graphId };
  }
  return undefined;
};

const destinationInSnapshot = (
  snapshot: SpaceSnapshot,
  destination: ProductDestination,
): ProductDestinationSnapshotResolution => {
  if (destination.spaceId !== snapshot.id) return { kind: 'unresolved' };
  if (
    destination.kind === 'resource' ||
    destination.kind === 'map-resource' ||
    destination.kind === 'presentation'
  ) {
    if (!snapshot.resources.some(({ id }) => id === destination.resourceId))
      return { kind: 'unresolved' };
  }
  const graphOwner =
    destination.kind === 'graph' ||
    destination.kind === 'map-graph' ||
    destination.kind === 'presentation'
      ? snapshot.document.maps?.find((map) =>
          map.graphs.some(({ id }) => id === destination.graphId),
        )
      : undefined;
  if (
    (destination.kind === 'graph' ||
      destination.kind === 'map-graph' ||
      destination.kind === 'presentation') &&
    graphOwner === undefined
  ) {
    return { kind: 'unresolved' };
  }
  if (
    destination.kind === 'map' ||
    destination.kind === 'map-resource' ||
    destination.kind === 'map-graph' ||
    destination.kind === 'presentation'
  ) {
    const map = snapshot.document.maps?.find(({ id }) => id === destination.mapId);
    if (map === undefined) return { kind: 'unresolved' };
    if (
      destination.kind === 'map-resource' &&
      map.positions[destination.resourceId] === undefined
    ) {
      return { kind: 'unresolved' };
    }
    if (
      (destination.kind === 'map-graph' || destination.kind === 'presentation') &&
      map.id !== graphOwner?.id
    ) {
      return { kind: 'unresolved' };
    }
    if (destination.kind === 'presentation') {
      const graph = graphOwner?.graphs.find(({ id }) => id === destination.graphId);
      const graphContainsResource = graph?.edges.some(
        ({ from, to }) => from === destination.resourceId || to === destination.resourceId,
      );
      if (graphContainsResource !== true) return { kind: 'unresolved' };
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
 * path because a Vite config externalizes bare specifiers. Do not declare a
 * copy on either side: two copies drift apart.
 *
 * A closed set of statuses rather than `number`, because the set is the
 * contract ADR 0069 states for a direct request: a temporary redirect to the
 * Meta Space, a bad request for an address that cannot be read at all, a
 * not-found for one that reads and names nothing, a method rejection for a
 * request that is not a read, a service-unavailable for a repository that
 * cannot be read from yet, and an internal error for a stored document whose
 * Map identities collide.
 *
 * Why a given host has nothing to serve yet, and what it does about it, is that
 * host's to say and not this module's: Node, Vite, PostgreSQL and process
 * lifecycle stay in adapters (ADR 0034).
 */
export interface ProductResponse {
  readonly status: 302 | 400 | 404 | 405 | 500 | 503;
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

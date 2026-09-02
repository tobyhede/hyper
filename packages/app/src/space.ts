import { newUuid, type UUID } from '@project/core';
import { HttpSpaceBackend, resolveProductDestination } from '@project/http';
import { loadSpaceSnapshot } from '@project/graph';
import { createWorkingSpaceLoader, type SpaceBackend } from '@project/persistence';
import type { OpenedApplicationStartup } from './startup';
import { destinationOpening } from './destination-opening';
import { createOpenSpaces, type OpenSpaces } from './open-spaces';

export type { OpenSpace } from './open-spaces';

export interface SpaceStartup {
  resolve(pathname: string): Promise<OpenedApplicationStartup>;
}

/** Compose browser startup around one fixed persistence backend. */
export const createSpaceStartup = (
  backend: SpaceBackend = new HttpSpaceBackend(),
  newId: () => UUID = newUuid,
): SpaceStartup => {
  const loadWorkingSpace = createWorkingSpaceLoader(backend, newId);
  let owner: Promise<OpenSpaces> | undefined;
  const openSpaces = (): Promise<OpenSpaces> => {
    owner ??= backend.loadAggregate().then((result) => {
      if (result.kind === 'uninitialized')
        throw new Error('The Space repository is uninitialized.');
      return createOpenSpaces({ backend, metaSpaceId: result.aggregate.metaSpaceId, newId });
    });
    return owner;
  };
  return {
    resolve: async (pathname) => {
      const resolution = await resolveProductDestination({ loadSpace: loadWorkingSpace }, pathname);
      if (resolution.kind === 'outside') {
        throw new Error('The URL is outside product addressing.');
      }
      if (resolution.kind === 'malformed') throw new Error('The product URL is malformed.');
      if (resolution.kind === 'unresolved') throw new Error('The product URL does not resolve.');
      // An available Computed View and a declared Layout claiming one id. Neither
      // wins (ADR 0069), so there is no Space View to open and nothing here can
      // pick one; intake rejects such a Space, which is why this is a broken
      // invariant rather than an address the author can correct.
      if (resolution.kind === 'collision')
        throw new Error('The product URL names two Space Views.');
      const spaces = await openSpaces();
      const resolvedSpace = loadSpaceSnapshot(resolution.loaded.snapshot);
      if (!resolvedSpace.ok) throw new Error('The product URL resolved an invalid Space.');
      const opening = destinationOpening(resolvedSpace.space, resolution.destination);
      const opened = await spaces.open(resolution.loaded.snapshot.id, opening.selection);
      return {
        kind: 'opened',
        opened,
        opening,
      };
    },
  };
};

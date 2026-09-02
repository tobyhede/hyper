import { newUuid, type UUID } from '@project/core';
import { HttpSpaceBackend, resolveProductDestination } from '@project/http';
import {
  createSpaceSessionRegistry,
  createWorkingSpaceLoader,
  type SpaceBackend,
} from '@project/persistence';
import { openLoadedSpace } from './open-space';
import type { OpenedApplicationStartup } from './startup';
import { destinationOpening } from './destination-opening';

export type { OpenedSpace } from './open-space';

export interface SpaceStartup {
  resolve(pathname: string): Promise<OpenedApplicationStartup>;
}

/** Compose browser startup around one fixed persistence backend. */
export const createSpaceStartup = (
  backend: SpaceBackend = new HttpSpaceBackend(),
  newId: () => UUID = newUuid,
): SpaceStartup => {
  const registry = createSpaceSessionRegistry(backend);
  const loadWorkingSpace = createWorkingSpaceLoader(backend, newId);
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
      const opened = openLoadedSpace(backend, resolution.loaded, registry);
      const opening = destinationOpening(opened.space, resolution.destination);
      return {
        kind: 'opened',
        opened,
        opening,
      };
    },
  };
};

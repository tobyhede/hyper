import { HttpSpaceBackend } from '@project/http';
import { newUuid, type UUID } from '@project/core';
import type { SpaceBackend } from '@project/persistence';
import type { OpenedApplicationStartup } from './startup';
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
      const spaces = await openSpaces();
      const { opened, opening } = await spaces.openPath(pathname);
      return {
        kind: 'opened',
        opened,
        opening,
      };
    },
  };
};

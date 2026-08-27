import { HttpSpaceBackend } from '@project/http';
import type { SpaceBackend } from '@project/persistence';
import { openStoredSpace } from './open-space';
import { decodeCompactUuid } from '@project/core';
import type { OpenedApplicationStartup } from './startup';

export type { OpenedSpace } from './open-space';

export interface SpaceStartup {
  resolve(compactId: string): Promise<OpenedApplicationStartup>;
}

/** Compose browser startup around one fixed persistence backend. */
export const createSpaceStartup = (
  backend: SpaceBackend = new HttpSpaceBackend(),
): SpaceStartup => ({
  resolve: async (compactId) => {
    const id = decodeCompactUuid(compactId);
    if (id === undefined) throw new Error('The Space URL contains an invalid id.');
    return { kind: 'opened', opened: await openStoredSpace(backend, id) };
  },
});

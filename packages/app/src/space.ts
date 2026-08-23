import { HttpSpaceBackend } from '@project/http';
import type { SpaceBackend } from '@project/persistence';
import { openStoredSpace, type OpenedSpace } from './open-space';
import type { ApplicationStartupResult } from './startup';

export type { OpenedSpace } from './open-space';

export interface SpaceStartup {
  resolve(): Promise<ApplicationStartupResult>;
  openSelected(id: Parameters<typeof openStoredSpace>[1]): Promise<OpenedSpace>;
}

/** Compose browser startup around one fixed persistence backend. */
export const createSpaceStartup = (
  backend: SpaceBackend = new HttpSpaceBackend(),
): SpaceStartup => ({
  resolve: async () => {
    const spaces = await backend.listSpaces();
    if (spaces.length === 0) {
      throw new Error('The persistence service returned no database spaces.');
    }
    if (spaces.length > 1) return { kind: 'selection', spaces };
    const [space] = spaces;
    if (space === undefined) throw new Error('The database catalog changed unexpectedly.');
    return { kind: 'opened', opened: await openStoredSpace(backend, space.id) };
  },
  openSelected: (id) => openStoredSpace(backend, id),
});

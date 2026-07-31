import { HttpSpaceBackend, type SpaceBackend } from '@project/persistence';
import { openStoredWorkspace, type OpenedSpace } from './open-workspace';
import type { ApplicationStartupResult } from './startup';

export type { OpenedSpace } from './open-workspace';

export interface WorkspaceStartup {
  resolve(): Promise<ApplicationStartupResult>;
  openSelected(id: Parameters<typeof openStoredWorkspace>[1]): Promise<OpenedSpace>;
}

/** Compose browser startup around one fixed persistence backend. */
export const createWorkspaceStartup = (
  backend: SpaceBackend = new HttpSpaceBackend('/api/spaces'),
): WorkspaceStartup => ({
  resolve: async () => {
    const spaces = await backend.listSpaces();
    if (spaces.length === 0) {
      throw new Error('The persistence service returned no database workspaces.');
    }
    if (spaces.length > 1) return { kind: 'selection', spaces };
    const [space] = spaces;
    if (space === undefined) throw new Error('The database catalog changed unexpectedly.');
    return { kind: 'opened', opened: await openStoredWorkspace(backend, space.id) };
  },
  openSelected: (id) => openStoredWorkspace(backend, id),
});

import type { CardFile, Space } from '@project/graph';
import { loadSpace, loadSpaceSnapshot } from '@project/graph';
import {
  MemorySpaceBackend,
  openSpaceSession,
  type SpaceBackend,
  type SpaceSession,
} from '@project/persistence';
import { snapshotFromSpace } from './snapshot';

export interface OpenedSpace {
  space: Space;
  spaceSession: SpaceSession;
}

/** Import files into the configured backend, then open its first workspace. */
export const openImportedWorkspace = async (
  spaceFile: unknown,
  cardFiles: readonly CardFile[],
): Promise<OpenedSpace> => {
  const imported = loadSpace(spaceFile, cardFiles);
  if (!imported.ok) {
    throw new Error(
      `The bundled space failed to import:\n${imported.errors.map((error) => `  - ${error.message}`).join('\n')}`,
    );
  }
  const spaceBackend: SpaceBackend = new MemorySpaceBackend([
    {
      snapshot: snapshotFromSpace(imported.space),
      revision: 0n,
      exportedRevision: null,
    },
  ]);

  const [first] = await spaceBackend.listSpaces();
  if (first === undefined) throw new Error('The backend contains no spaces');
  const loaded = await spaceBackend.loadSpace(first.id);
  if (loaded === undefined) throw new Error(`The backend could not load space ${first.id}`);

  const spaceSession = openSpaceSession(spaceBackend, loaded);
  const runtime = loadSpaceSnapshot(loaded.snapshot);
  if (!runtime.ok) {
    throw new Error(
      `The backend returned an invalid space:\n${runtime.errors.map((error) => `  - ${error.message}`).join('\n')}`,
    );
  }
  return { space: runtime.space, spaceSession };
};

import { loadSpace, loadSpaceSnapshot, type Space } from '@project/graph';
import {
  MemorySpaceBackend,
  openSpaceSession,
  type SpaceBackend,
  type SpaceSession,
} from '@project/persistence';
import { cardFiles, spaceFile } from 'virtual:space-file';
import { snapshotFromSpace } from './snapshot';

export interface OpenedSpace {
  space: Space;
  spaceSession: SpaceSession;
}

/** List, load and open the first workspace through the configured backend. */
export const openWorkspace = async (): Promise<OpenedSpace> => {
  // Files are an import source only. The imported snapshot seeds this
  // development adapter; all live edits flow through its backend contract.
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

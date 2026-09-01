import type { UUID } from '@project/core';
import type { CardFile, Space } from '@project/graph';
import { loadSpace, loadSpaceSnapshot } from '@project/graph';
import {
  createSpaceSessionRegistry,
  MemorySpaceBackend,
  type SpaceBackend,
  type SpaceSessionRegistry,
  type SpaceSession,
  type LoadedSpace,
} from '@project/persistence';
import { snapshotFromSpace } from './snapshot';

export interface OpenedSpace {
  space: Space;
  spaceSession: SpaceSession;
}

/** Compose one exact Space value already loaded by the configured backend. */
export const openLoadedSpace = (
  spaceBackend: SpaceBackend,
  loaded: LoadedSpace,
  registry: SpaceSessionRegistry = createSpaceSessionRegistry(spaceBackend),
): OpenedSpace => {
  const runtime = loadSpaceSnapshot(loaded.snapshot);
  if (!runtime.ok) {
    throw new Error(
      `The backend returned an invalid space:\n${runtime.errors.map((error) => `  - ${error.message}`).join('\n')}`,
    );
  }
  return {
    space: runtime.space,
    spaceSession: registry.open(loaded),
  };
};

/** Open one exact Space already stored by the configured backend. */
export const openStoredSpace = async (
  spaceBackend: SpaceBackend,
  id: UUID,
): Promise<OpenedSpace> => {
  const loaded = await spaceBackend.loadSpace(id);
  if (loaded === undefined) throw new Error(`The backend could not load space ${id}`);
  return openLoadedSpace(spaceBackend, loaded);
};

/** Import files into the configured backend, then open its first Space. */
export const openImportedSpace = async (
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

  return openStoredSpace(spaceBackend, imported.space.id);
};

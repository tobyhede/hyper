import type { SpaceSnapshot, UUID } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import type { LoadedSpace } from './backend';
import type { CommitResult, SpaceCommit } from './backend';
import type { RepositoryCommitResult, SpaceResourceRepository } from './repository';

/**
 * The two methods initialization needs, taken from the stored seam rather than
 * declared a second time.
 *
 * `commit` is the one half that cannot be: the browser reaches a `SpaceBackend`
 * whose `CommitResult` carries transport failures the stored
 * `RepositoryCommitResult` does not, so this loader serves both by accepting
 * either. Narrowing it to the repository's own result would reject the browser.
 */
interface WorkingSpaceStore extends Pick<SpaceResourceRepository, 'loadSpace'> {
  readonly commit: (request: SpaceCommit) => Promise<CommitResult | RepositoryCommitResult>;
}

const initializedSnapshot = (
  snapshot: SpaceSnapshot,
  newId: () => UUID,
): { readonly snapshot: SpaceSnapshot; readonly createdLayout: boolean } | undefined => {
  const layouts = snapshot.document.layouts ?? [];
  if (layouts.length > 0) {
    if (snapshot.document.defaultRenderer !== undefined) return undefined;
    const firstLayout = layouts[0];
    if (firstLayout === undefined) throw new Error('A non-empty Layout list lost its first value');
    return {
      snapshot: {
        ...snapshot,
        document: { ...snapshot.document, defaultRenderer: firstLayout.id },
      },
      createdLayout: false,
    };
  }
  const layoutId = newId();
  const graphId = newId();
  return {
    snapshot: {
      ...snapshot,
      document: {
        ...snapshot.document,
        layouts: [
          {
            id: layoutId,
            title: 'Layout 1',
            kind: 'positioned',
            positions: {},
            graphs: [{ id: graphId, title: 'Graph 1', edges: [] }],
            activeGraph: graphId,
          },
        ],
        // Ticket 03 renames this transitional persisted selection to defaultLayout.
        defaultRenderer: layoutId,
      },
    },
    createdLayout: true,
  };
};

async function loadWorkingSpace(
  repository: WorkingSpaceStore,
  id: UUID,
  newId: () => UUID,
): Promise<LoadedSpace | undefined> {
  let loaded = await repository.loadSpace(id);
  if (loaded === undefined) return undefined;
  // Let the ordinary opening intake report its complete diagnostics. Repairing
  // an already-invalid aggregate would replace them with a commit refusal.
  if (!loadSpaceSnapshot(loaded.snapshot).ok) return loaded;
  for (;;) {
    const initialization = initializedSnapshot(loaded.snapshot, newId);
    if (initialization === undefined) return loaded;

    const result = await repository.commit({
      changes: [
        {
          kind: 'update',
          spaceId: id,
          snapshot: initialization.snapshot,
          expectedRevision: loaded.revision,
        },
      ],
    });
    if (result.kind === 'conflict') {
      const current = result.conflicts.find((conflict) => conflict.spaceId === id)?.current;
      if (current === undefined) {
        throw new Error(`Space ${id} changed without returning its current working state`);
      }
      loaded = current;
      continue;
    }
    if (result.kind !== 'committed') {
      throw new Error(`Space ${id} could not initialize its working state: ${result.kind}`);
    }
    const revision = result.revisions.find((candidate) => candidate.spaceId === id)?.revision;
    if (revision === undefined) throw new Error(`Space ${id} initialization returned no revision`);
    const working = {
      snapshot: initialization.snapshot,
      revision,
      exportedRevision: loaded.exportedRevision,
    };
    if (!initialization.createdLayout) return working;
    return { ...working, initialization: 'created-layout' };
  }
}

export const createWorkingSpaceLoader =
  (repository: WorkingSpaceStore, newId: () => UUID) =>
  (id: UUID): Promise<LoadedSpace | undefined> =>
    loadWorkingSpace(repository, id, newId);

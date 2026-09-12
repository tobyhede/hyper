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
): SpaceSnapshot | undefined => {
  const diagrams = snapshot.document.diagrams ?? [];
  if (diagrams.length > 0) {
    if (snapshot.document.defaultDiagram !== undefined) return undefined;
    const firstDiagram = diagrams[0];
    if (firstDiagram === undefined)
      throw new Error('A non-empty Diagram list lost its first value');
    return {
      ...snapshot,
      document: { ...snapshot.document, defaultDiagram: firstDiagram.id },
    };
  }
  const diagramId = newId();
  const graphId = newId();
  return {
    ...snapshot,
    document: {
      ...snapshot.document,
      diagrams: [
        {
          id: diagramId,
          title: 'Diagram 1',
          kind: 'positioned',
          positions: {},
          graphs: [{ id: graphId, title: 'Graph 1', edges: [] }],
          activeGraph: graphId,
        },
      ],
      defaultDiagram: diagramId,
    },
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
    const initialized = initializedSnapshot(loaded.snapshot, newId);
    if (initialized === undefined) return loaded;

    const result = await repository.commit({
      changes: [
        {
          kind: 'update',
          spaceId: id,
          snapshot: initialized,
          expectedRevision: loaded.revision,
        },
      ],
    });
    if (result.kind === 'conflict') {
      const conflict = result.conflicts.find((candidate) => candidate.spaceId === id);
      if (conflict === undefined) {
        throw new Error(`Space ${id} changed without returning its current working state`);
      }
      // A conflict that names this Space and reports no current state is saying
      // it was deleted between the read and this Edit. That is the answer the
      // loader already spells `undefined`, not a broken repository.
      if (conflict.current === undefined) return undefined;
      loaded = conflict.current;
      continue;
    }
    if (result.kind !== 'committed') {
      throw new Error(`Space ${id} could not initialize its working state: ${result.kind}`);
    }
    const revision = result.revisions.find((candidate) => candidate.spaceId === id)?.revision;
    if (revision === undefined) throw new Error(`Space ${id} initialization returned no revision`);
    return { snapshot: initialized, revision, exportedRevision: loaded.exportedRevision };
  }
}

export const createWorkingSpaceLoader =
  (repository: WorkingSpaceStore, newId: () => UUID) =>
  (id: UUID): Promise<LoadedSpace | undefined> =>
    loadWorkingSpace(repository, id, newId);

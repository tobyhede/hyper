import type { ImportSpace } from '@project/core';
import { newSpace, parseCardFile } from '@project/graph';
import { requireImportedSpaces } from '../import/import-space';
import type { SpaceRepository, StoredSpace } from '../persistence/space-repository';

export interface OpenedDatabaseStartup {
  kind: 'opened';
  space: StoredSpace;
}

const createNewSpaceImport = (): ImportSpace => {
  const minted = newSpace();
  const cards = minted.cardFiles.map((file) => {
    const parsed = parseCardFile(file);
    if (!parsed.ok) {
      throw new Error(parsed.errors.map(({ message }) => message).join('\n'));
    }
    const { id, ...document } = parsed.card;
    return { id, document };
  });
  const { id, ...document } = minted.file;
  return { id, document, cards };
};

/** Resolve the initial durable workspace from the database catalog. */
export const resolveDatabaseStartup = async (
  repository: SpaceRepository,
): Promise<OpenedDatabaseStartup> => {
  const catalog = await repository.listSpaces();
  if (catalog.length !== 0) {
    throw new Error('Database startup for an existing catalog is not implemented');
  }

  const imported = requireImportedSpaces(
    await repository.importSpaces([createNewSpaceImport()], 'insert'),
  );
  const [created] = imported;
  if (created === undefined || imported.length !== 1) {
    throw new Error(`New-space import returned ${imported.length} spaces`);
  }

  const loaded = await repository.loadSpace(created.snapshot.id);
  if (loaded === undefined) {
    throw new Error(`The repository could not load new space ${created.snapshot.id}`);
  }
  return { kind: 'opened', space: loaded };
};

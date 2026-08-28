import type { ImportSpace, UUID } from '@project/core';
import { newSpace, parseCardFile } from '@project/graph';
import { requireImportedSpaces } from '../import/import-space';
import type { LoadedSpace } from '@project/persistence';
import type { SpaceRepository } from '../persistence/space-repository';

export interface OpenedDatabaseStartup {
  kind: 'opened';
  space: LoadedSpace;
}

export type DatabaseStartupResult = OpenedDatabaseStartup;

/** Open the durable Space selected from the database catalog. */
export const openDatabaseSelection = async (
  repository: SpaceRepository,
  id: UUID,
): Promise<OpenedDatabaseStartup> => {
  const loaded = await repository.loadSpace(id);
  if (loaded === undefined) throw new Error(`The selected space ${id} could not be loaded`);
  return { kind: 'opened', space: loaded };
};

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
  const { id: _persistenceOwnedId, ...document } = minted.file;
  return { document, cards };
};

/** Establish the normal first Space only when the repository is empty. */
export const bootstrapEmptyDatabase = async (repository: SpaceRepository): Promise<void> => {
  const catalog = await repository.listSpaces();
  if (catalog.length > 0) return;

  const imported = requireImportedSpaces(
    await repository.importSpaces([createNewSpaceImport()], 'insert'),
  );
  const [created] = imported;
  if (created === undefined || imported.length !== 1) {
    throw new Error(`New-space import returned ${imported.length} spaces`);
  }

  await repository.setEntrySpace(created.snapshot.id);
};

/** Resolve the configured Entry Space; the database catalog only determines whether bootstrap is necessary. */
export const resolveDatabaseStartup = async (
  repository: SpaceRepository,
  importedSpaces?: readonly LoadedSpace[],
): Promise<DatabaseStartupResult> => {
  if (importedSpaces !== undefined) {
    if (importedSpaces.length === 0) throw new Error('Database import returned no spaces');
  }

  const entrySpaceId = await repository.entrySpaceId();
  if (entrySpaceId !== undefined) return openDatabaseSelection(repository, entrySpaceId);

  if (importedSpaces?.length === 1) {
    const imported = importedSpaces[0];
    if (imported === undefined) throw new Error('The imported space changed unexpectedly');
    await repository.setEntrySpace(imported.snapshot.id);
    return openDatabaseSelection(repository, imported.snapshot.id);
  }

  await bootstrapEmptyDatabase(repository);
  const configured = await repository.entrySpaceId();
  if (configured === undefined) throw new Error('The database has no configured Entry Space');
  return openDatabaseSelection(repository, configured);
};

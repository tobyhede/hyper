import { fileURLToPath } from 'node:url';
import { requireImportedSpaces } from '../../src/import/import-space';
import { readSingleSpace } from '../../src/import/read-single-space';
import type { SpaceRepository } from '../../src/persistence/space-repository';

const fixtureDirectory = fileURLToPath(new URL('../../packages/app/fixture', import.meta.url));

/** Import the tracked abstract-layout fixture through the production file importer. */
export const importFixture = async (repository: SpaceRepository): Promise<void> => {
  const input = await readSingleSpace(fixtureDirectory);
  requireImportedSpaces(await repository.importSpaces([input], 'insert'));
};

import { fileURLToPath } from 'node:url';
import { requireImportedSpaces } from '../../src/import/import-space';
import { readSingleSpace } from '../../src/import/read-single-space';
import type { SpaceRepository } from '../../src/persistence/space-repository';
import type { LoadedSpace } from '@project/persistence';

const fixtureDirectory = fileURLToPath(new URL('../../packages/app/fixture', import.meta.url));

/** Import the tracked abstract-layout fixture through the production file importer. */
export const importFixture = async (repository: SpaceRepository): Promise<LoadedSpace> => {
  const input = await readSingleSpace(fixtureDirectory);
  const imported = requireImportedSpaces(await repository.importSpaces([input], 'insert'));
  const fixture = imported[0];
  if (fixture === undefined || imported.length !== 1) {
    throw new Error(`Tracked fixture import returned ${imported.length} Spaces`);
  }
  return fixture;
};

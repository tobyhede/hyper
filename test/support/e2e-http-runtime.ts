import { newUuid } from '@project/core';
import { establishMetaSpace } from '../../src/startup/database-startup';
import { createSpaceHost, type SpaceHostApplication } from '../../src/http/space-host';
import { E2eMemorySpaceRepository } from './e2e-memory-space-repository';
import { importFixture, importSpaceDirectory } from './import-fixture';

export type E2eHttpRuntimeOptions = {
  startup?: boolean;
} & ({ catalog: 'fixture' | 'empty' } | { catalog: 'directory'; directory: string });

const importCatalog = (repository: E2eMemorySpaceRepository, options: E2eHttpRuntimeOptions) => {
  if (options.catalog === 'fixture') return importFixture(repository);
  if (options.catalog === 'directory') return importSpaceDirectory(repository, options.directory);
  return Promise.resolve(undefined);
};

/** Create one isolated in-process catalog for one browser test. */
export const createApp = async (options: E2eHttpRuntimeOptions): Promise<SpaceHostApplication> => {
  const repository = new E2eMemorySpaceRepository();
  await importCatalog(repository, options);
  // An imported catalog is already initialized, and its first Space is its
  // Meta Space; an empty one is initialized from Default Content here, exactly
  // as the database runtime is.
  if (options.startup === true) await establishMetaSpace(repository, newUuid);
  return createSpaceHost(repository, newUuid);
};

import { resolveDatabaseStartup } from '../../src/startup/database-startup';
import { createSpaceHost, type SpaceHostApplication } from '../../src/http/space-host';
import { E2eMemorySpaceRepository } from './e2e-memory-space-repository';
import { importFixture } from './import-fixture';

export interface E2eHttpRuntimeOptions {
  catalog: 'fixture' | 'empty';
  startup?: boolean;
}

/** Create one isolated in-process catalog for one browser test. */
export const createApp = async (options: E2eHttpRuntimeOptions): Promise<SpaceHostApplication> => {
  const repository = new E2eMemorySpaceRepository();
  const imported = options.catalog === 'fixture' ? await importFixture(repository) : undefined;
  if (options.startup === true) await resolveDatabaseStartup(repository, imported);
  return createSpaceHost(repository);
};

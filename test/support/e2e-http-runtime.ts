import { createSpaceHttpHandler, type SpaceHttpHandler } from '../../src/http/space-http-handler';
import { resolveDatabaseStartup } from '../../src/startup/database-startup';
import { E2eMemorySpaceRepository } from './e2e-memory-space-repository';
import { importFixture } from './import-fixture';

export interface E2eHttpRuntimeOptions {
  catalog: 'fixture' | 'empty';
  startup?: boolean;
}

/** Create one isolated in-process catalog for one browser test. */
export const createHandler = async (options: E2eHttpRuntimeOptions): Promise<SpaceHttpHandler> => {
  const repository = new E2eMemorySpaceRepository();
  if (options.catalog === 'fixture') await importFixture(repository);
  if (options.startup === true) await resolveDatabaseStartup(repository);
  return createSpaceHttpHandler(repository);
};

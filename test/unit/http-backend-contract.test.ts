import { HttpSpaceBackend } from '@project/persistence';
import { spaceBackendContract } from '../../packages/persistence/test/backend-contract';
import { createSpaceHttpHandler } from '../../src/http/space-http-handler';
import { E2eMemorySpaceRepository } from '../support/e2e-memory-space-repository';
import { startHttpServer } from '../support/http-server';

spaceBackendContract('HttpSpaceBackend', async (initial) => {
  const server = await startHttpServer(
    createSpaceHttpHandler(new E2eMemorySpaceRepository(initial)),
  );
  return {
    backend: new HttpSpaceBackend(`${server.url}/api/spaces`),
    close: () => server.close(),
  };
});

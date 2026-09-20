import { newUuid } from '@project/core';
import { createSpaceHost } from '../../src/http/space-host';
import { E2eMemorySpaceRepository } from '../../test/support/e2e-memory-space-repository';
import { readAggregate } from '../../src/aggregate-directory';

export const createApp = async (options: { directory: string }) => {
  const repository = new E2eMemorySpaceRepository();
  const aggregate = await readAggregate(options.directory, newUuid);
  const result = await repository.initializeAggregate(aggregate);
  if (result.kind !== 'initialized') throw new Error(`Benchmark aggregate refused: ${result.kind}`);
  return createSpaceHost(repository, newUuid);
};

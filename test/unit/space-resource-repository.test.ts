import type { SpaceResourceRepository } from '@project/http';
import { expectTypeOf, it } from 'vitest';
import type { PostgresSpaceRepository } from '../../src/persistence/postgres-space-repository';
import type { E2eMemorySpaceRepository } from '../support/e2e-memory-space-repository';

it('accepts the existing PostgreSQL and E2E repositories without adapters', () => {
  expectTypeOf<PostgresSpaceRepository>().toExtend<SpaceResourceRepository>();
  expectTypeOf<E2eMemorySpaceRepository>().toExtend<SpaceResourceRepository>();
});

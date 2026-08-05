import type { LoadedSpace, SpaceResourceRepository } from '@project/persistence';
import { expectTypeOf, it } from 'vitest';
import type { PostgresSpaceRepository } from '../../src/persistence/postgres-space-repository';
import type { SpaceRepository } from '../../src/persistence/space-repository';
import type { E2eMemorySpaceRepository } from '../support/e2e-memory-space-repository';

it('accepts the existing PostgreSQL and E2E repositories without adapters', () => {
  expectTypeOf<PostgresSpaceRepository>().toExtend<SpaceResourceRepository>();
  expectTypeOf<E2eMemorySpaceRepository>().toExtend<SpaceResourceRepository>();
});

// The server seam adds to the HTTP one rather than restating it. The two were
// separate declarations, mutually assignable only by coincidence of shape; this
// fails the moment `SpaceRepository` stops being a superset of what the HTTP
// application consumes, and it fails at the declaration rather than at a call site.
it('declares the server repository as a strict superset of the HTTP seam', () => {
  expectTypeOf<SpaceRepository>().toExtend<SpaceResourceRepository>();
  expectTypeOf<Awaited<ReturnType<SpaceRepository['loadSpace']>>>().toEqualTypeOf<
    LoadedSpace | undefined
  >();
  expectTypeOf<ReturnType<SpaceRepository['commitSpace']>>().toEqualTypeOf<
    ReturnType<SpaceResourceRepository['commitSpace']>
  >();
});

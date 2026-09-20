import type { LoadedSpace, StoredSpaceRepository } from '@project/persistence';
import { expectTypeOf, it } from 'vitest';
import type { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import type { SpaceRepository } from '../../src/persistence/space-repository';
import type { E2eMemorySpaceRepository } from '../support/e2e-memory-space-repository';

// `Handle`/`Order` are the database-specific type parameters `SqlStore`
// supplies (`src/prisma/sql-store.ts`, `src/sqlite/sql-store.ts`); neither
// appears in this class's public surface, so `unknown` here proves the same
// fact a concrete database's own store would, without a runtime import of
// either.
it('accepts the one SQL repository and the E2E repository without adapters', () => {
  expectTypeOf<SqlSpaceRepository<unknown, unknown>>().toExtend<StoredSpaceRepository>();
  expectTypeOf<E2eMemorySpaceRepository>().toExtend<StoredSpaceRepository>();
});

// The server seam adds to the HTTP one rather than restating it. The two were
// separate declarations, mutually assignable only by coincidence of shape; this
// fails the moment `SpaceRepository` stops being a superset of what the HTTP
// application consumes, and it fails at the declaration rather than at a call site.
it('declares the server repository as a strict superset of the HTTP seam', () => {
  expectTypeOf<SpaceRepository>().toExtend<StoredSpaceRepository>();
  // Strict in both directions: the two aggregate lifecycle doors
  // (`initializeAggregate` and `replaceAggregate`, ADR 0078) and `markExported`
  // are CLI capability and must stay unnameable from the browser-safe seam.
  // Without this, lifting any of them onto `StoredSpaceRepository` leaves the
  // two mutually assignable again and the assertion above still passes.
  expectTypeOf<StoredSpaceRepository>().not.toExtend<SpaceRepository>();
  expectTypeOf<Awaited<ReturnType<SpaceRepository['loadSpace']>>>().toEqualTypeOf<
    LoadedSpace | undefined
  >();
  expectTypeOf<ReturnType<SpaceRepository['commit']>>().toEqualTypeOf<
    ReturnType<StoredSpaceRepository['commit']>
  >();
  expectTypeOf<ReturnType<SpaceRepository['loadAggregate']>>().toEqualTypeOf<
    ReturnType<StoredSpaceRepository['loadAggregate']>
  >();
});

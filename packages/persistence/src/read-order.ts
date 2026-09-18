import type { UUID } from '@project/core';
import type { LoadedSpace } from './backend';

const clone = <T>(value: T): T => structuredClone(value);

/**
 * Codepoint order, not `localeCompare`: over canonical lowercase UUID text it is
 * byte order over the `uuid` value PostgreSQL compares, so the two agree by
 * construction rather than by a property of ICU collation. A listing that sorts
 * by collation instead — `MemorySpaceRepository.listSpaces` — keeps its order
 * outside the shared contract for exactly that reason.
 */
export const ascendingById = (
  left: { readonly id: UUID },
  right: { readonly id: UUID },
): number => {
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
};

/**
 * A stored Space as every in-memory double answers it: cloned, and its Things
 * ascending by id regardless of seed or write order. PostgreSQL orders the
 * aggregate's Things on read — `loadSpaceAggregate` sorts `thing.id.asc()`,
 * inside an import transaction and outside it alike — and SQLite matches, so a
 * double that answered insertion order would be a divergence the shared
 * contract asserts, `toEqual` being order-sensitive on arrays.
 */
export const readInIdOrder = (loaded: LoadedSpace): LoadedSpace =>
  clone({
    ...loaded,
    snapshot: { ...loaded.snapshot, things: [...loaded.snapshot.things].sort(ascendingById) },
  });

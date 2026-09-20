import type { UUID } from '@project/core';
import { loadSpaceAggregate } from '@project/graph';
import {
  AggregateInvariantError,
  ascendingById,
  decideCommit,
  readInIdOrder as read,
  type AggregateLoadResult,
  type LoadedAggregate,
  type LoadedSpace,
  type RepositoryCommitResult,
  type SpaceCommit,
  type SpaceSummary,
} from '@project/persistence';
import type {
  AggregateInput,
  InitializeAggregateResult,
  ReplaceAggregateResult,
  SpaceRepository,
} from '../../src/persistence/space-repository';
import { classifyInitializedAggregate } from '../../src/persistence/aggregate-lifecycle';

const clone = <T>(value: T): T => structuredClone(value);

/* `readInIdOrder` and its ordering rule are `@project/persistence`'s, shared
 * with `MemorySpaceBackend` so the two doubles cannot drift apart from each
 * other or from the SQL adapters. `listSpaces` below still sorts by collation,
 * and its order stays outside the contract for the reason stated there. */

const loadedAggregate = (metaSpaceId: UUID, spaces: Iterable<LoadedSpace>): LoadedAggregate => ({
  metaSpaceId,
  spaces: [...spaces].map(read).sort((left, right) => ascendingById(left.snapshot, right.snapshot)),
});

/** Behavioral repository for server-side startup tests. */
export class MemorySpaceRepository implements SpaceRepository {
  readonly #spaces = new Map<UUID, LoadedSpace>();
  #metaSpaceId: UUID | undefined;

  /**
   * Either an uninitialized repository — no Spaces and no Meta identity — or
   * stored Spaces under the Meta identity the fixture *names*. There is no
   * third shape, because "these Spaces, and whichever one happens to be first
   * is Meta" is the ordering inference ADR 0078 refuses every adapter, and a
   * double that takes it decides an aggregate's validity by array position:
   * seeded the other way round, the same two Spaces leave the one Meta does not
   * reach unreferenced, and `loadAggregate` refuses what it accepted before.
   *
   * The overloads are what make the omission unwriteable rather than merely
   * discouraged; `withoutMetaIdentity` below is the one deliberate way to reach
   * the broken state, and it is named.
   */
  constructor();
  constructor(spaces: readonly LoadedSpace[], metaSpaceId: UUID);
  constructor(spaces: readonly LoadedSpace[] = [], metaSpaceId?: UUID) {
    for (const space of spaces) this.#spaces.set(space.snapshot.id, clone(space));
    this.#metaSpaceId = metaSpaceId;
  }

  /**
   * Stored Spaces that no Meta identity names — the contradictory state
   * `loadAggregate` refuses and `establishMetaSpace` deliberately does not
   * catch.
   *
   * A named constructor rather than a third meaning for the `metaSpaceId`
   * argument, and it exists because **no sequence of seam calls reaches this
   * state on the SQL repository**, so the shared contract cannot set it up.
   * `SqlSpaceRepository` writes the singleton Meta row inside the same
   * transaction that writes the Spaces (`#replaceAllSpaces`), and every other
   * path that would store a Space without one — `commit` — is refused with
   * `invalid-commit` first. The state is what an out-of-band deletion of the
   * singleton row, or a half-migrated database, leaves behind; the SQL
   * repository refuses it, and this is what lets the memory one be asked.
   */
  static withoutMetaIdentity(spaces: readonly LoadedSpace[]): MemorySpaceRepository {
    const repository = new MemorySpaceRepository();
    for (const space of spaces) repository.#spaces.set(space.snapshot.id, clone(space));
    return repository;
  }

  listSpaces(): Promise<readonly SpaceSummary[]> {
    return Promise.resolve(
      [...this.#spaces.values()]
        .map(({ snapshot }) => ({ id: snapshot.id, title: snapshot.document.title }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    );
  }

  loadSpace(id: UUID): Promise<LoadedSpace | undefined> {
    const stored = this.#spaces.get(id);
    return Promise.resolve(stored === undefined ? undefined : read(stored));
  }

  loadAggregate(): Promise<AggregateLoadResult> {
    if (this.#metaSpaceId === undefined) {
      if (this.#spaces.size === 0) return Promise.resolve({ kind: 'uninitialized' });
      return Promise.reject(
        new AggregateInvariantError('Stored Spaces exist without a Meta Space'),
      );
    }
    const aggregate = loadedAggregate(this.#metaSpaceId, this.#spaces.values());
    const intake = loadSpaceAggregate({
      metaSpaceId: aggregate.metaSpaceId,
      snapshots: aggregate.spaces.map(({ snapshot }) => snapshot),
    });
    if (!intake.ok)
      return Promise.reject(
        new AggregateInvariantError('Stored aggregate violates Meta invariants'),
      );
    return Promise.resolve({ kind: 'loaded', aggregate });
  }

  initializeAggregate(input: AggregateInput): Promise<InitializeAggregateResult> {
    const intake = loadSpaceAggregate({ metaSpaceId: input.metaSpaceId, snapshots: input.spaces });
    if (!intake.ok) return Promise.resolve({ kind: 'aggregate-refused', errors: intake.errors });
    if (this.#metaSpaceId !== undefined || this.#spaces.size > 0) {
      if (this.#metaSpaceId === undefined) {
        return Promise.reject(
          new AggregateInvariantError('Stored Spaces exist without a Meta Space'),
        );
      }
      const existing = loadedAggregate(this.#metaSpaceId, this.#spaces.values());
      return Promise.resolve(classifyInitializedAggregate(input, existing));
    }
    const aggregate = loadedAggregate(
      input.metaSpaceId,
      input.spaces.map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
    );
    this.#spaces.clear();
    for (const space of aggregate.spaces) this.#spaces.set(space.snapshot.id, clone(space));
    this.#metaSpaceId = input.metaSpaceId;
    return Promise.resolve({ kind: 'initialized', aggregate });
  }

  loadMetaSpaceId(): Promise<UUID | undefined> {
    return Promise.resolve(this.#metaSpaceId);
  }

  replaceAggregate(
    input: AggregateInput,
    expectedMetaSpaceId: UUID | undefined,
  ): Promise<ReplaceAggregateResult> {
    const intake = loadSpaceAggregate({ metaSpaceId: input.metaSpaceId, snapshots: input.spaces });
    if (!intake.ok) return Promise.resolve({ kind: 'aggregate-refused', errors: intake.errors });
    if (this.#metaSpaceId === undefined && this.#spaces.size === 0) {
      return Promise.resolve({ kind: 'uninitialized' });
    }
    if (this.#metaSpaceId !== expectedMetaSpaceId) {
      return Promise.resolve({ kind: 'conflict', currentMetaSpaceId: this.#metaSpaceId });
    }
    const aggregate = loadedAggregate(
      input.metaSpaceId,
      input.spaces.map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
    );
    return Promise.resolve().then(() => {
      this.#spaces.clear();
      for (const space of aggregate.spaces) this.#spaces.set(space.snapshot.id, clone(space));
      this.#metaSpaceId = input.metaSpaceId;
      return { kind: 'replaced', aggregate };
    });
  }

  markExported(id: UUID, revision: bigint): Promise<void> {
    const stored = this.#spaces.get(id);
    if (stored === undefined) return Promise.reject(new Error(`Space ${id} does not exist`));
    this.#spaces.set(id, { ...stored, exportedRevision: revision });
    return Promise.resolve();
  }

  commit(request: SpaceCommit): Promise<RepositoryCommitResult> {
    const decision = decideCommit(request, this.#metaSpaceId, [...this.#spaces.values()].map(read));
    if (decision.kind === 'write') {
      this.#spaces.clear();
      for (const space of decision.spaces) this.#spaces.set(space.snapshot.id, clone(space));
    }
    return Promise.resolve(decision.result);
  }
}

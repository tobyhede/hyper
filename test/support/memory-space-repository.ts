import type { UUID } from '@project/core';
import { loadSpaceAggregate } from '@project/graph';
import {
  AggregateInvariantError,
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

const ascendingById = (left: { readonly id: UUID }, right: { readonly id: UUID }): number => {
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
};

/**
 * PostgreSQL orders the aggregate's things on read — `loadSpaceAggregate` sorts
 * `thing.id.asc()`, on the read inside an import transaction and on the one
 * outside it alike — so every `LoadedSpace` this double hands back has to be
 * ordered the same way. The shared contract compares whole snapshots, and
 * `toEqual` is order-sensitive on arrays, so insertion order here would be a
 * divergence the suite asserts.
 *
 * Codepoint order, not `localeCompare`: over canonical lowercase UUID text it is
 * byte order over the `uuid` value PostgreSQL compares, so the two agree by
 * construction rather than by a property of ICU collation. `listSpaces` below
 * still sorts by collation, and its order stays outside the contract for exactly
 * that reason.
 */
const read = (loaded: LoadedSpace): LoadedSpace =>
  clone({
    ...loaded,
    snapshot: { ...loaded.snapshot, things: [...loaded.snapshot.things].sort(ascendingById) },
  });

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
   * state on either adapter**, so the shared contract cannot set it up.
   * `PostgresSpaceRepository` writes the singleton Meta row inside the same
   * transaction that writes the Spaces (`replaceAllSpaces`), and every other
   * path that would store a Space without one — `commit` — is refused with
   * `invalid-commit` first. The state is what an out-of-band deletion of the
   * singleton row, or a half-migrated database, leaves behind; both adapters
   * refuse it, and this is what lets the memory one be asked.
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

  replaceAggregate(
    input: AggregateInput,
    expectedMetaSpaceId: UUID,
  ): Promise<ReplaceAggregateResult> {
    const intake = loadSpaceAggregate({ metaSpaceId: input.metaSpaceId, snapshots: input.spaces });
    if (!intake.ok) return Promise.resolve({ kind: 'aggregate-refused', errors: intake.errors });
    if (this.#metaSpaceId === undefined) {
      if (this.#spaces.size > 0)
        return Promise.reject(new AggregateInvariantError('Stored Spaces exist without Meta'));
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
    if (request.changes.length === 0) {
      return Promise.resolve({ kind: 'rejected', code: 'invalid-commit', message: 'Empty commit' });
    }
    const named = new Set<UUID>();
    for (const change of request.changes) {
      if (named.has(change.spaceId)) {
        return Promise.resolve({
          kind: 'rejected',
          code: 'invalid-commit',
          message: `Space ${change.spaceId} is named more than once`,
        });
      }
      named.add(change.spaceId);
      if (change.kind !== 'delete' && change.snapshot.id !== change.spaceId) {
        return Promise.resolve({
          kind: 'rejected',
          code: 'invalid-commit',
          message: `Change Space id ${change.spaceId} does not match its snapshot`,
        });
      }
    }

    const conflicts = request.changes.flatMap((change) => {
      const current = this.#spaces.get(change.spaceId);
      const conflict =
        change.kind === 'create'
          ? current !== undefined
          : current?.revision !== change.expectedRevision;
      return conflict
        ? [{ spaceId: change.spaceId, current: current === undefined ? undefined : read(current) }]
        : [];
    });
    if (conflicts.length > 0) return Promise.resolve({ kind: 'conflict', conflicts });

    const baseline =
      this.#metaSpaceId === undefined
        ? undefined
        : loadSpaceAggregate({
            metaSpaceId: this.#metaSpaceId,
            snapshots: [...this.#spaces.values()].map(({ snapshot }) => snapshot),
          });
    const baselineUnreferenced = new Set(
      baseline?.ok === false
        ? baseline.errors.flatMap((error) =>
            error.kind === 'ordinary-space-unreferenced' ? [error.spaceId] : [],
          )
        : [],
    );
    const candidate = new Map(this.#spaces);
    for (const change of request.changes) {
      if (change.kind === 'delete') {
        candidate.delete(change.spaceId);
        continue;
      }
      const current = candidate.get(change.spaceId);
      candidate.set(change.spaceId, {
        snapshot: clone(change.snapshot),
        revision: current === undefined ? 0n : current.revision + 1n,
        exportedRevision: current?.exportedRevision ?? null,
      });
    }
    if (this.#metaSpaceId === undefined) {
      return Promise.resolve({
        kind: 'rejected',
        code: 'invalid-commit',
        message: 'The repository has no Meta Space',
      });
    }
    const intake = loadSpaceAggregate({
      metaSpaceId: this.#metaSpaceId,
      snapshots: [...candidate.values()].map(({ snapshot }) => snapshot),
    });
    if (!intake.ok) {
      const deleted = new Set(
        request.changes.flatMap((change) => (change.kind === 'delete' ? [change.spaceId] : [])),
      );
      const changed = new Set(request.changes.map(({ spaceId }) => spaceId));
      const incompleteDeletionIds = new Set(
        intake.errors.flatMap((error) =>
          error.kind === 'space-thing-target-missing' &&
          deleted.has(error.targetSpaceId) &&
          !changed.has(error.spaceId)
            ? [error.targetSpaceId]
            : [],
        ),
      );
      if (incompleteDeletionIds.size > 0) {
        return Promise.resolve({
          kind: 'conflict',
          conflicts: [...incompleteDeletionIds].map((spaceId) => {
            const current = this.#spaces.get(spaceId);
            if (current === undefined) throw new Error('Deleted Space disappeared during commit');
            return { spaceId, current: read(current) };
          }),
        });
      }
      const errors = intake.errors.filter(
        (error) =>
          error.kind !== 'ordinary-space-unreferenced' || !baselineUnreferenced.has(error.spaceId),
      );
      if (errors.length > 0) {
        return Promise.resolve({ kind: 'aggregate-refused', errors });
      }
    }

    this.#spaces.clear();
    for (const [id, loaded] of candidate) this.#spaces.set(id, loaded);
    return Promise.resolve({
      kind: 'committed',
      revisions: request.changes.flatMap((change) => {
        if (change.kind === 'delete') return [];
        const loaded = candidate.get(change.spaceId);
        if (loaded === undefined) throw new Error('Candidate omitted a changed Space');
        return [{ spaceId: change.spaceId, revision: loaded.revision }];
      }),
      deletedSpaceIds: request.changes.flatMap((change) =>
        change.kind === 'delete' ? [change.spaceId] : [],
      ),
    });
  }
}

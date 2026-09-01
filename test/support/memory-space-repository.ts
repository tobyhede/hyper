import { newUuid, type ImportSpace, type SpaceSnapshot, type UUID } from '@project/core';
import { loadSpaceAggregate, loadSpaceSnapshot } from '@project/graph';
import type {
  LoadedAggregate,
  LoadedSpace,
  RepositoryCommitResult,
  SpaceCommit,
  SpaceSummary,
} from '@project/persistence';
import type {
  ImportMode,
  RepositoryImportResult,
  SpaceRepository,
} from '../../src/persistence/space-repository';

const clone = <T>(value: T): T => structuredClone(value);

const ascendingById = (left: { readonly id: UUID }, right: { readonly id: UUID }): number => {
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
};

/**
 * PostgreSQL orders the aggregate's cards on read — `loadSpaceAggregate` sorts
 * `card.id.asc()`, on the read inside an import transaction and on the one
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
    snapshot: { ...loaded.snapshot, cards: [...loaded.snapshot.cards].sort(ascendingById) },
  });

/**
 * A layout's own id and the ids of the graphs it owns are minted in one pass,
 * because a graph is reached only through its owner now (ADR 0040) — there is no
 * space-level collection left to walk instead. `resolveImport` in
 * `PostgresSpaceRepository` mints the same way and for the same reason; the
 * shared contract holds the two to it.
 */
const identifyImport = (input: ImportSpace): SpaceSnapshot => {
  const { layouts: importedLayouts, ...document } = input.document;
  const layouts = importedLayouts?.map(({ id, graphs, ...layout }) => ({
    ...layout,
    id: id ?? newUuid(),
    graphs: graphs.map(({ id: graphId, ...graph }) => ({ ...graph, id: graphId ?? newUuid() })),
  }));
  return {
    id: input.id ?? newUuid(),
    // The document is carried through rather than rebuilt field by field, so a
    // version this build does not read reaches domain intake and is rejected
    // there. Rebuilding it stamped `version` with a constant, which quietly
    // rewrote an unsupported document into a supported one — the one thing a
    // double of an insert-only importer must not do.
    document: layouts === undefined ? { ...document } : { ...document, layouts },
    cards: input.cards.map(({ id, ...card }) => ({ ...card, id: id ?? newUuid() })),
  };
};

/** Behavioral repository for server-side startup tests. */
export class MemorySpaceRepository implements SpaceRepository {
  readonly #spaces = new Map<UUID, LoadedSpace>();
  #entrySpaceId: UUID | undefined;
  #metaSpaceId: UUID | undefined;

  constructor(spaces: readonly LoadedSpace[] = [], entrySpaceId?: UUID, metaSpaceId?: UUID) {
    for (const space of spaces) this.#spaces.set(space.snapshot.id, clone(space));
    this.#entrySpaceId = entrySpaceId;
    this.#metaSpaceId = metaSpaceId ?? entrySpaceId ?? spaces[0]?.snapshot.id;
  }

  entrySpaceId(): Promise<UUID | undefined> {
    return Promise.resolve(this.#entrySpaceId);
  }

  setEntrySpace(id: UUID): Promise<void> {
    if (!this.#spaces.has(id)) return Promise.reject(new Error(`Space ${id} does not exist`));
    this.#entrySpaceId = id;
    this.#metaSpaceId ??= id;
    return Promise.resolve();
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

  loadAggregate(): Promise<LoadedAggregate> {
    if (this.#metaSpaceId === undefined) {
      return Promise.reject(new Error('The repository has no Meta Space'));
    }
    return Promise.resolve({
      metaSpaceId: this.#metaSpaceId,
      spaces: [...this.#spaces.values()].map(read),
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
          error.kind === 'space-card-target-missing' &&
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
      return Promise.resolve({ kind: 'aggregate-refused', errors: intake.errors });
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

  importSpaces(input: readonly ImportSpace[], mode: ImportMode): Promise<RepositoryImportResult> {
    const identified = input.map(identifyImport);

    // Batch identity is settled before any Space faces domain intake, because
    // `PostgresSpaceRepository` settles it before its transaction opens:
    // `parseImport` then `validateImportIdentities` run over the whole batch,
    // and `loadSpaceSnapshot` runs per Space inside. A batch that is both
    // duplicated and domain-invalid is therefore a `duplicate-identity` there
    // whatever order it is in, and has to be one here.
    //
    // One deliberate difference of input, not of outcome: `duplicateIdentity`
    // there reads the ids the caller *supplied* and skips every absent one,
    // while this runs over the identified batch, after `identifyImport` has
    // minted the missing ones. A minted id is a fresh `newUuid` and can collide
    // with nothing, so the wider read rejects no batch of id-less Spaces the
    // real backend would accept — where it, too, mints ids that cannot repeat.
    const batchSpaceIds = new Set<UUID>();
    // Two distinct facts, deliberately not merged. `batchCardIds` is what this
    // batch already claims, and a repeat is `duplicate-identity`. `storedCardOwner`
    // below is what survives the call, and claiming one of those is
    // `card-ownership` — a collision the real backend only meets on its card
    // writes, inside the transaction. Folding them together makes this double
    // reject valid input under a code the real backend never returns for it.
    const batchCardIds = new Set<UUID>();
    for (const snapshot of identified) {
      if (batchSpaceIds.has(snapshot.id)) {
        return Promise.resolve({
          kind: 'rejected',
          code: 'duplicate-identity',
          message: `Duplicate Space identity ${snapshot.id}`,
        });
      }
      batchSpaceIds.add(snapshot.id);

      for (const card of snapshot.cards) {
        if (batchCardIds.has(card.id)) {
          return Promise.resolve({
            kind: 'rejected',
            code: 'duplicate-identity',
            message: `Duplicate card identity "${card.id}"`,
          });
        }
        batchCardIds.add(card.id);
      }
    }

    const storedCardOwner = new Map<UUID, UUID>();
    if (mode === 'insert') {
      for (const { snapshot } of this.#spaces.values()) {
        for (const card of snapshot.cards) storedCardOwner.set(card.id, snapshot.id);
      }
    }

    // Then per Space in batch order, in the order the real transaction meets
    // each fault: the row insert a stored Space identity rejects, then domain
    // intake, then the card writes a stored owner rejects.
    const snapshots: SpaceSnapshot[] = [];
    for (const identifiedSnapshot of identified) {
      if (mode === 'insert' && this.#spaces.has(identifiedSnapshot.id)) {
        return Promise.resolve({
          kind: 'rejected',
          code: 'duplicate-identity',
          message: `Space ${identifiedSnapshot.id} already exists`,
        });
      }

      const intake = loadSpaceSnapshot(identifiedSnapshot);
      if (!intake.ok) {
        return Promise.resolve({
          kind: 'rejected',
          code: 'invalid-snapshot',
          message: intake.errors.map(({ message }) => message).join('\n'),
        });
      }

      for (const card of intake.snapshot.cards) {
        const owner = storedCardOwner.get(card.id);
        if (owner !== undefined && owner !== intake.snapshot.id) {
          return Promise.resolve({
            kind: 'rejected',
            code: 'card-ownership',
            message: `Card ${card.id} belongs to space ${owner}`,
          });
        }
      }
      snapshots.push(intake.snapshot);
    }

    if (mode === 'truncate') {
      this.#spaces.clear();
      this.#entrySpaceId = undefined;
      this.#metaSpaceId = undefined;
    }
    const stored = snapshots.map((snapshot): LoadedSpace => ({
      snapshot: clone(snapshot),
      revision: 0n,
      exportedRevision: null,
    }));
    for (const space of stored) this.#spaces.set(space.snapshot.id, clone(space));
    this.#metaSpaceId ??= stored[0]?.snapshot.id;
    return Promise.resolve({ kind: 'imported', spaces: stored.map(read) });
  }
}

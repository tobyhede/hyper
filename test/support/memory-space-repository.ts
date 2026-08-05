import { newUuid, type ImportSpace, type SpaceSnapshot, type UUID } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import type { LoadedSpace, RepositoryCommitResult, SpaceSummary } from '@project/persistence';
import type {
  ImportMode,
  RepositoryImportResult,
  SpaceRepository,
} from '../../src/persistence/space-repository';

const clone = <T>(value: T): T => structuredClone(value);

const identifyImport = (input: ImportSpace): SpaceSnapshot => {
  const layouts = input.document.layouts?.map(({ id, ...layout }) => ({
    ...layout,
    id: id ?? newUuid(),
  }));
  return {
    id: input.id ?? newUuid(),
    document: {
      version: 2,
      title: input.document.title,
      routes: input.document.routes.map(({ id, ...route }) => ({
        ...route,
        id: id ?? newUuid(),
      })),
      ...(layouts === undefined ? {} : { layouts }),
      ...(input.document.defaultView === undefined
        ? {}
        : { defaultView: input.document.defaultView }),
    },
    cards: input.cards.map(({ id, ...card }) => ({ ...card, id: id ?? newUuid() })),
  };
};

/** Behavioral repository for server-side startup tests. */
export class MemorySpaceRepository implements SpaceRepository {
  readonly #spaces = new Map<UUID, LoadedSpace>();

  constructor(spaces: readonly LoadedSpace[] = []) {
    for (const space of spaces) this.#spaces.set(space.snapshot.id, clone(space));
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
    return Promise.resolve(stored === undefined ? undefined : clone(stored));
  }

  markExported(id: UUID, revision: bigint): Promise<void> {
    const stored = this.#spaces.get(id);
    if (stored === undefined) return Promise.reject(new Error(`Space ${id} does not exist`));
    this.#spaces.set(id, { ...stored, exportedRevision: revision });
    return Promise.resolve();
  }

  commitSpace(snapshot: SpaceSnapshot, expectedRevision: bigint): Promise<RepositoryCommitResult> {
    const intake = loadSpaceSnapshot(snapshot);
    if (!intake.ok) {
      return Promise.resolve({
        kind: 'rejected',
        code: 'invalid-snapshot',
        message: intake.errors.map(({ message }) => message).join('\n'),
      });
    }

    const current = this.#spaces.get(intake.snapshot.id);
    if (current === undefined) {
      return Promise.resolve({
        kind: 'rejected',
        code: 'not-found',
        message: `Space ${intake.snapshot.id} does not exist`,
      });
    }
    if (current.revision !== expectedRevision) {
      return Promise.resolve({ kind: 'conflict', current: clone(current) });
    }
    for (const card of intake.snapshot.cards) {
      const owner = [...this.#spaces.values()].find(
        ({ snapshot }) =>
          snapshot.id !== intake.snapshot.id &&
          snapshot.cards.some((storedCard) => storedCard.id === card.id),
      );
      if (owner !== undefined) {
        return Promise.resolve({
          kind: 'rejected',
          code: 'invalid-snapshot',
          message: `Card ${card.id} belongs to space ${owner.snapshot.id}`,
        });
      }
    }

    const revision = current.revision + 1n;
    this.#spaces.set(intake.snapshot.id, {
      snapshot: clone(intake.snapshot),
      revision,
      exportedRevision: current.exportedRevision,
    });
    return Promise.resolve({ kind: 'committed', revision });
  }

  importSpaces(input: readonly ImportSpace[], mode: ImportMode): Promise<RepositoryImportResult> {
    const snapshots: SpaceSnapshot[] = [];
    for (const inputSpace of input) {
      const intake = loadSpaceSnapshot(identifyImport(inputSpace));
      if (!intake.ok) {
        return Promise.resolve({
          kind: 'rejected',
          code: 'invalid-snapshot',
          message: intake.errors.map(({ message }) => message).join('\n'),
        });
      }
      snapshots.push(intake.snapshot);
    }

    const incomingSpaceIds = new Set<UUID>();
    // Two distinct facts, deliberately not merged. `batchCardIds` is what this
    // batch already claims, and a repeat is `duplicate-identity`. `storedCardOwner`
    // is what survives the call, and claiming one of those is `card-ownership`.
    // `PostgresSpaceRepository` draws the same line — `duplicateIdentity` runs
    // over the batch before its transaction opens — so folding them together
    // makes this double reject valid input under a code the real backend
    // never returns for it.
    const batchCardIds = new Set<UUID>();
    const storedCardOwner = new Map<UUID, UUID>();
    if (mode === 'insert') {
      for (const { snapshot } of this.#spaces.values()) {
        for (const card of snapshot.cards) storedCardOwner.set(card.id, snapshot.id);
      }
    }
    for (const snapshot of snapshots) {
      if (incomingSpaceIds.has(snapshot.id)) {
        return Promise.resolve({
          kind: 'rejected',
          code: 'duplicate-identity',
          message: `Duplicate Space identity ${snapshot.id}`,
        });
      }
      incomingSpaceIds.add(snapshot.id);

      if (mode === 'insert') {
        const current = this.#spaces.get(snapshot.id);
        if (current !== undefined) {
          return Promise.resolve({
            kind: 'rejected',
            code: 'duplicate-identity',
            message: `Space ${snapshot.id} already exists`,
          });
        }
      }

      for (const card of snapshot.cards) {
        if (batchCardIds.has(card.id)) {
          return Promise.resolve({
            kind: 'rejected',
            code: 'duplicate-identity',
            message: `Duplicate card identity "${card.id}"`,
          });
        }
        batchCardIds.add(card.id);

        const owner = storedCardOwner.get(card.id);
        if (owner !== undefined && owner !== snapshot.id) {
          return Promise.resolve({
            kind: 'rejected',
            code: 'card-ownership',
            message: `Card ${card.id} belongs to space ${owner}`,
          });
        }
      }
    }

    if (mode === 'truncate') this.#spaces.clear();
    const stored = snapshots.map((snapshot): LoadedSpace => ({
      snapshot: clone(snapshot),
      revision: 0n,
      exportedRevision: null,
    }));
    for (const space of stored) this.#spaces.set(space.snapshot.id, clone(space));
    return Promise.resolve({ kind: 'imported', spaces: clone(stored) });
  }
}

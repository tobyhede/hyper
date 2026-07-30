import {
  newUuid,
  spaceSnapshotSchema,
  type ImportSpace,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import type {
  ImportMode,
  RepositoryCommitResult,
  RepositoryImportResult,
  SpaceRepository,
  SpaceSummary,
  StoredSpace,
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
  readonly #spaces = new Map<UUID, StoredSpace>();

  listSpaces(): Promise<readonly SpaceSummary[]> {
    return Promise.resolve(
      [...this.#spaces.values()]
        .map(({ snapshot }) => ({ id: snapshot.id, title: snapshot.document.title }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    );
  }

  loadSpace(id: UUID): Promise<StoredSpace | undefined> {
    const stored = this.#spaces.get(id);
    return Promise.resolve(stored === undefined ? undefined : clone(stored));
  }

  commitSpace(snapshot: SpaceSnapshot, expectedRevision: bigint): Promise<RepositoryCommitResult> {
    const parsed = spaceSnapshotSchema.safeParse(snapshot);
    if (!parsed.success) {
      return Promise.resolve({
        kind: 'rejected',
        code: 'invalid-snapshot',
        message: parsed.error.message,
      });
    }
    const intake = loadSpaceSnapshot(parsed.data);
    if (!intake.ok) {
      return Promise.resolve({
        kind: 'rejected',
        code: 'invalid-snapshot',
        message: intake.errors.map(({ message }) => message).join('\n'),
      });
    }

    const current = this.#spaces.get(parsed.data.id);
    if (current === undefined) {
      return Promise.resolve({
        kind: 'rejected',
        code: 'not-found',
        message: `Space ${parsed.data.id} does not exist`,
      });
    }
    if (current.revision !== expectedRevision) {
      return Promise.resolve({ kind: 'conflict', current: clone(current) });
    }

    const revision = current.revision + 1n;
    this.#spaces.set(parsed.data.id, {
      snapshot: clone(parsed.data),
      revision,
      exportedRevision: current.exportedRevision,
    });
    return Promise.resolve({ kind: 'committed', revision });
  }

  importSpaces(input: readonly ImportSpace[], mode: ImportMode): Promise<RepositoryImportResult> {
    const snapshots = input.map(identifyImport);
    for (const snapshot of snapshots) {
      const parsed = spaceSnapshotSchema.safeParse(snapshot);
      if (!parsed.success) {
        return Promise.resolve({
          kind: 'rejected',
          code: 'invalid-snapshot',
          message: parsed.error.message,
        });
      }
      const intake = loadSpaceSnapshot(parsed.data);
      if (!intake.ok) {
        return Promise.resolve({
          kind: 'rejected',
          code: 'invalid-snapshot',
          message: intake.errors.map(({ message }) => message).join('\n'),
        });
      }
      if (mode === 'insert') {
        const current = this.#spaces.get(parsed.data.id);
        if (current !== undefined) {
          return Promise.resolve({ kind: 'conflict', current: clone(current) });
        }
      }
    }

    if (mode === 'truncate') this.#spaces.clear();
    const stored = snapshots.map((snapshot): StoredSpace => ({
      snapshot: clone(snapshot),
      revision: 0n,
      exportedRevision: null,
    }));
    for (const space of stored) this.#spaces.set(space.snapshot.id, clone(space));
    return Promise.resolve({ kind: 'imported', spaces: clone(stored) });
  }
}

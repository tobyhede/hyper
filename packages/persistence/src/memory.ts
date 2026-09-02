import { uuidSchema, type UUID } from '@project/core';
import { loadSpaceAggregate } from '@project/graph';
import type { CommitResult, LoadedSpace, SpaceBackend, SpaceCommit, SpaceSummary } from './backend';

const clone = <T>(value: T): T => structuredClone(value);
const isLoadedSpaceCollection = (
  value: UUID | readonly LoadedSpace[],
): value is readonly LoadedSpace[] => Array.isArray(value);

export interface MemoryCommitAttempt {
  snapshot: LoadedSpace['snapshot'];
  expectedRevision: bigint;
}

/** Explicit adapter controls for deterministic behavioral tests. */
export class MemorySpaceBackendTestControl {
  /** Singleton update attempts retained as the session test observation seam. */
  readonly attempts: MemoryCommitAttempt[] = [];
  readonly requests: SpaceCommit[] = [];
  readonly #results: CommitResult[] = [];
  readonly #errors: Error[] = [];
  readonly #gates: Promise<void>[] = [];

  queueResult(result: CommitResult): void {
    this.#results.push(clone(result));
  }

  throwNext(error: Error): void {
    this.#errors.push(error);
  }

  deferNextCommit(): () => void {
    let release = (): void => undefined;
    this.#gates.push(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    return release;
  }

  record(request: SpaceCommit): void {
    this.requests.push(clone(request));
    const change = request.changes.length === 1 ? request.changes[0] : undefined;
    if (change?.kind === 'update') {
      this.attempts.push({
        snapshot: clone(change.snapshot),
        expectedRevision: change.expectedRevision,
      });
    }
  }

  nextResult(): CommitResult | undefined {
    return this.#results.shift();
  }

  nextError(): Error | undefined {
    return this.#errors.shift();
  }

  async waitForCommit(): Promise<void> {
    await this.#gates.shift();
  }
}

const invalidCommit = (message: string): CommitResult => ({
  kind: 'permanent-failure',
  code: 'invalid-commit',
  message,
});

/** Browser-safe asynchronous adapter used for development and behavioral tests. */
export class MemorySpaceBackend implements SpaceBackend {
  readonly #metaSpaceId: UUID;
  readonly #spaces = new Map<UUID, LoadedSpace>();
  readonly #testControl: MemorySpaceBackendTestControl | undefined;

  constructor(
    metaSpaceIdOrInitial: UUID | readonly LoadedSpace[] = [],
    initialOrControl: readonly LoadedSpace[] | MemorySpaceBackendTestControl = [],
    testControl?: MemorySpaceBackendTestControl,
  ) {
    const explicitMeta = !isLoadedSpaceCollection(metaSpaceIdOrInitial);
    // The control is legal in either trailing position, because the Meta id is
    // optional ahead of it. Reading it only from the third argument silently
    // discards one written in the second, which the types permit — a dropped
    // injection is a test that passes without exercising what it names.
    const secondIsControl = initialOrControl instanceof MemorySpaceBackendTestControl;
    const initial: readonly LoadedSpace[] = isLoadedSpaceCollection(metaSpaceIdOrInitial)
      ? metaSpaceIdOrInitial
      : secondIsControl
        ? []
        : initialOrControl;
    this.#metaSpaceId = explicitMeta
      ? uuidSchema.parse(metaSpaceIdOrInitial)
      : (initial[0]?.snapshot.id ?? uuidSchema.parse('00000000-0000-4000-8000-000000000000'));
    this.#testControl = secondIsControl ? initialOrControl : testControl;
    for (const loaded of initial) this.#spaces.set(loaded.snapshot.id, clone(loaded));
  }

  listSpaces(): Promise<readonly SpaceSummary[]> {
    return Promise.resolve(
      [...this.#spaces.values()].map(({ snapshot }) => ({
        id: snapshot.id,
        title: snapshot.document.title,
      })),
    );
  }

  loadSpace(id: UUID): Promise<LoadedSpace | undefined> {
    const loaded = this.#spaces.get(id);
    return Promise.resolve(loaded === undefined ? undefined : clone(loaded));
  }

  loadAggregate(): ReturnType<SpaceBackend['loadAggregate']> {
    return Promise.resolve({
      kind: 'loaded',
      aggregate: {
        metaSpaceId: this.#metaSpaceId,
        spaces: [...this.#spaces.values()].map(clone),
      },
    });
  }

  async commit(request: SpaceCommit): Promise<CommitResult> {
    if (request.changes.length === 0) return invalidCommit('A commit requires at least one change');

    const named = new Set<UUID>();
    for (const change of request.changes) {
      if (named.has(change.spaceId)) {
        return invalidCommit(`Space ${change.spaceId} is named more than once`);
      }
      named.add(change.spaceId);
      if (change.kind !== 'delete' && change.snapshot.id !== change.spaceId) {
        return invalidCommit(`Change Space id ${change.spaceId} does not match its snapshot`);
      }
    }

    this.#testControl?.record(request);
    await this.#testControl?.waitForCommit();
    const testError = this.#testControl?.nextError();
    if (testError !== undefined) throw testError;
    const injected = this.#testControl?.nextResult();
    if (injected !== undefined) return clone(injected);

    const conflicts = request.changes.flatMap((change) => {
      const current = this.#spaces.get(change.spaceId);
      const conflictsWithCurrent =
        change.kind === 'create'
          ? current !== undefined
          : current?.revision !== change.expectedRevision;
      return conflictsWithCurrent
        ? [{ spaceId: change.spaceId, current: current === undefined ? undefined : clone(current) }]
        : [];
    });
    if (conflicts.length > 0) return { kind: 'conflict', conflicts };

    const baseline = loadSpaceAggregate({
      metaSpaceId: this.#metaSpaceId,
      snapshots: [...this.#spaces.values()].map(({ snapshot }) => snapshot),
    });
    const baselineUnreferenced = new Set(
      baseline.ok
        ? []
        : baseline.errors.flatMap((error) =>
            error.kind === 'ordinary-space-unreferenced' ? [error.spaceId] : [],
          ),
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
        return {
          kind: 'conflict',
          conflicts: [...incompleteDeletionIds].map((spaceId) => ({
            spaceId,
            current: clone(this.#spaces.get(spaceId)),
          })),
        };
      }
      const errors = intake.errors.filter(
        (error) =>
          error.kind !== 'ordinary-space-unreferenced' || !baselineUnreferenced.has(error.spaceId),
      );
      if (errors.length > 0) return { kind: 'aggregate-refused', errors: clone(errors) };
    }

    const revisions = request.changes.flatMap((change) => {
      if (change.kind === 'delete') return [];
      const stored = candidate.get(change.spaceId);
      if (stored === undefined) throw new Error('Candidate commit omitted a changed Space');
      return [{ spaceId: change.spaceId, revision: stored.revision }];
    });
    const deletedSpaceIds = request.changes.flatMap((change) =>
      change.kind === 'delete' ? [change.spaceId] : [],
    );

    this.#spaces.clear();
    for (const [id, loaded] of candidate) this.#spaces.set(id, loaded);
    return { kind: 'committed', revisions, deletedSpaceIds };
  }
}

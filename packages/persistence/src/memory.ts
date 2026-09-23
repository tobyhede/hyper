import type { UUID } from '@project/core';
import type { CommitResult, LoadedSpace, SpaceBackend, SpaceCommit, SpaceSummary } from './backend';
import { decideCommit } from './commit-decision';
import { ascendingById, readInIdOrder as read } from './read-order';
import type { RepositoryCommitResult } from './repository';

const clone = <T>(value: T): T => structuredClone(value);

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

/**
 * A repository's permanent rejection is what the browser's transport calls a
 * permanent failure. Its `message` is the stored seam's, which the HTTP host
 * sends as `problem.detail`; the browser's failure carries the code alone.
 */
const backendResult = (result: RepositoryCommitResult): CommitResult =>
  result.kind === 'rejected' ? { kind: 'permanent-failure', code: result.code } : result;

/** Browser-safe asynchronous adapter used for development and behavioral tests. */
export class MemorySpaceBackend implements SpaceBackend {
  readonly #metaSpaceId: UUID;
  readonly #spaces = new Map<UUID, LoadedSpace>();
  readonly #testControl: MemorySpaceBackendTestControl | undefined;

  /**
   * The Meta id is required, never guessed: ADR 0078 forbids inferring Meta
   * from where a Space sits in its seed, and the same Spaces seeded in another
   * order must behave identically. `asMeta` below is the one deliberate way to
   * derive it, for the one aggregate shape where deriving it is not a guess.
   */
  constructor(
    metaSpaceId: UUID,
    spaces: readonly LoadedSpace[] = [],
    testControl?: MemorySpaceBackendTestControl,
  ) {
    this.#metaSpaceId = metaSpaceId;
    this.#testControl = testControl;
    for (const loaded of spaces) this.#spaces.set(loaded.snapshot.id, clone(loaded));
  }

  /** A one-Space aggregate has exactly one valid Meta: the Space given. */
  static asMeta(loaded: LoadedSpace, control?: MemorySpaceBackendTestControl): MemorySpaceBackend {
    return new MemorySpaceBackend(loaded.snapshot.id, [loaded], control);
  }

  listSpaces(): Promise<readonly SpaceSummary[]> {
    return Promise.resolve(
      [...this.#spaces.values()]
        .map(({ snapshot }) => ({ id: snapshot.id, title: snapshot.document.title }))
        .sort(ascendingById),
    );
  }

  loadSpace(id: UUID): Promise<LoadedSpace | undefined> {
    const loaded = this.#spaces.get(id);
    return Promise.resolve(loaded === undefined ? undefined : read(loaded));
  }

  loadAggregate(): ReturnType<SpaceBackend['loadAggregate']> {
    return Promise.resolve({
      kind: 'loaded',
      aggregate: {
        metaSpaceId: this.#metaSpaceId,
        spaces: [...this.#spaces.values()]
          .map(read)
          .sort((left, right) => ascendingById(left.snapshot, right.snapshot)),
      },
    });
  }

  async commit(request: SpaceCommit): Promise<CommitResult> {
    this.#testControl?.record(request);
    await this.#testControl?.waitForCommit();
    const testError = this.#testControl?.nextError();
    if (testError !== undefined) throw testError;
    const injected = this.#testControl?.nextResult();
    if (injected !== undefined) return clone(injected);

    // Read, not `clone`: a conflict answers `current` the way a load would, in
    // id order, as the SQL adapters do off their own ordered query. The write
    // decision carries those same copies back into `#spaces` below, so the
    // stored order converges on id order too — harmless, every read sorts.
    const decision = decideCommit(request, this.#metaSpaceId, [...this.#spaces.values()].map(read));
    if (decision.kind === 'answer') return backendResult(decision.result);
    this.#spaces.clear();
    for (const space of decision.spaces) this.#spaces.set(space.snapshot.id, clone(space));
    return backendResult(decision.result);
  }
}

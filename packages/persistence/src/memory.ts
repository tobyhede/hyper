import type { SpaceSnapshot, UUID } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import type { CommitResult, LoadedSpace, SpaceBackend, SpaceSummary } from './backend';

const clone = <T>(value: T): T => structuredClone(value);

export interface MemoryCommitAttempt {
  snapshot: SpaceSnapshot;
  expectedRevision: bigint;
}

/** Explicit adapter controls for deterministic behavioral tests. */
export class MemorySpaceBackendTestControl {
  readonly attempts: MemoryCommitAttempt[] = [];
  readonly #results: CommitResult[] = [];
  readonly #gates: Promise<void>[] = [];

  queueResult(result: CommitResult): void {
    this.#results.push(clone(result));
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

  record(snapshot: SpaceSnapshot, expectedRevision: bigint): void {
    this.attempts.push({ snapshot: clone(snapshot), expectedRevision });
  }

  nextResult(): CommitResult | undefined {
    return this.#results.shift();
  }

  async waitForCommit(): Promise<void> {
    await this.#gates.shift();
  }
}

/** Browser-safe asynchronous adapter used for development and behavioral tests. */
export class MemorySpaceBackend implements SpaceBackend {
  readonly #spaces = new Map<UUID, LoadedSpace>();
  readonly #testControl: MemorySpaceBackendTestControl | undefined;

  constructor(initial: readonly LoadedSpace[] = [], testControl?: MemorySpaceBackendTestControl) {
    this.#testControl = testControl;
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

  async commitSpace(snapshot: SpaceSnapshot, expectedRevision: bigint): Promise<CommitResult> {
    this.#testControl?.record(snapshot, expectedRevision);
    await this.#testControl?.waitForCommit();
    const injected = this.#testControl?.nextResult();
    if (injected !== undefined) return clone(injected);

    const intake = loadSpaceSnapshot(snapshot);
    if (!intake.ok) {
      return {
        kind: 'permanent-failure',
        code: 'invalid-snapshot',
        message: intake.errors.map((error) => error.message).join('\n'),
      };
    }

    const current = this.#spaces.get(intake.snapshot.id);
    if (current === undefined) {
      return {
        kind: 'permanent-failure',
        code: 'not-found',
        message: `Space ${intake.snapshot.id} does not exist`,
      };
    }
    if (current.revision !== expectedRevision) {
      return { kind: 'conflict', current: clone(current) };
    }

    const revision = current.revision + 1n;
    this.#spaces.set(intake.snapshot.id, {
      snapshot: clone(intake.snapshot),
      revision,
      exportedRevision: current.exportedRevision,
    });
    return { kind: 'committed', revision };
  }
}

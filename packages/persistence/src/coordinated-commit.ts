/**
 * One coordinated Space Resource commit as an explicit state machine, from the
 * moment its plan is decided to the moment its outcome is installed and, when
 * it did not land, recovered.
 *
 * ```
 * planned ─enlist→ enlisted ─prepare→ prepared ─publish→ published ─settle→ committed
 *                     │                  │                   │     └─settle→ conflicted ─┐
 *                     │                  │                   │     └─settle→ failed ─────┤
 *                     └──────────────────┴─────unwind────────┴──→ unwound ───────────────┤
 *                                                                                        │
 *                  ┌──────────────────────────────────acceptRemote───────────────────────┤
 *                  ↓                                                                     │
 *              recovered ←─handed over─ recovering ←─retry, keepLocal────────────────────┤
 *                                           └──────resumeRecovery (never prepared)───────┘
 * ```
 *
 * `enlist` opens a session for each created Space and records every other
 * participant's baseline; `prepare` makes each participant `coordinating`
 * with the snapshot it commits; `publish` announces that; `settle` installs
 * the backend's answer; `unwind` answers a throw anywhere between `enlist` and
 * `settle`. From `conflicted`, `failed` or `unwound`, the first of a
 * participant's `retry`, `keepLocal` or `acceptRemote` recovers the commit for
 * every participant. Accepting the stored side completes at once. A replay is
 * `recovering` until its own commit has prepared every participant, which
 * hands the participants' recovery over to it; a replay that ends before that
 * — a refused read, a participant another coordination's recovery holds, a
 * throw — returns this commit to the phase it recovered from, so the same
 * recovery can be asked for again. Requests made while `recovering` or once
 * `recovered` are ignored. Any other move is refused.
 */
import type { SpaceSnapshot, UUID } from '@project/core';
import type { CommitResult, LoadedSpace, ProtocolFault, SpaceChange } from './backend';
import type { CoordinatedRecovery, ManagedSpaceSession } from './session';
import {
  changedSpaceId,
  recoveryRefusal,
  type SpaceResourceChanges,
  type SpaceResourceLifecycleChange,
  type SpaceResourcePlanningView,
  type SpaceResourcePlanOutcome,
} from './space-resource-planning';

export type CoordinatedCommitPhase =
  | 'planned'
  | 'enlisted'
  | 'prepared'
  | 'published'
  | 'committed'
  | 'conflicted'
  | 'failed'
  | 'unwound'
  | 'recovering'
  | 'recovered';

const TRANSITIONS = {
  planned: ['enlisted'],
  enlisted: ['prepared', 'unwound'],
  prepared: ['published', 'unwound'],
  published: ['committed', 'conflicted', 'failed', 'unwound'],
  committed: [],
  conflicted: ['recovering', 'recovered'],
  failed: ['recovering', 'recovered'],
  unwound: ['recovering', 'recovered'],
  recovering: ['recovered'],
  recovered: [],
} as const satisfies Record<CoordinatedCommitPhase, readonly CoordinatedCommitPhase[]>;

/**
 * The registry's hold on live Spaces, as far as a coordinated commit reaches
 * into it.
 */
export interface CoordinationSpaces {
  readonly session: (spaceId: UUID) => ManagedSpaceSession | undefined;
  /** Whether a session holds a created Space no commit has acknowledged. */
  readonly isUncommittedCreate: (spaceId: UUID) => boolean;
  /** Open a session for a created Space and mark it uncommitted. */
  readonly openCreated: (snapshot: SpaceSnapshot) => ManagedSpaceSession;
  readonly markUncommittedCreate: (spaceId: UUID) => void;
  /** Record a created Space as provisional until its commit answers. */
  readonly holdProvisional: (snapshot: SpaceSnapshot) => void;
  readonly dropProvisional: (spaceId: UUID) => void;
  /** A created Space whose commit was acknowledged is no longer uncommitted. */
  readonly clearUncommittedCreate: (spaceId: UUID) => void;
  /** Remove a deleted Space's session. */
  readonly evict: (spaceId: UUID) => void;
}

/**
 * What a recovery replays for one participant. `create` and `delete` carry
 * everything the retried commit needs; `update` names only the participant,
 * because its snapshot is whatever that Space's working state is when the
 * replay's own coordination reads it ({@link planReplay}).
 */
export type SpaceResourceReplayItem =
  | { readonly kind: 'create'; readonly snapshot: SpaceSnapshot }
  | { readonly kind: 'update'; readonly spaceId: UUID }
  | { readonly kind: 'delete'; readonly spaceId: UUID };

const replayedSpaceId = (item: SpaceResourceReplayItem): UUID =>
  item.kind === 'create' ? item.snapshot.id : item.spaceId;

/**
 * A replay's plan: each `update` resolved against the Spaces the replay read.
 *
 * `holders` are the participants that still answer to the recovery this
 * replay carries out. Any other participant that needs recovery answers to a
 * different coordination's, which is the only thing allowed to settle it
 * (ADR 0076), so the replay refuses rather than commit over it.
 */
export const planReplay = (
  view: SpaceResourcePlanningView,
  items: readonly [SpaceResourceReplayItem, ...SpaceResourceReplayItem[]],
  holders: ReadonlySet<UUID>,
): SpaceResourcePlanOutcome => {
  for (const item of items) {
    const id = replayedSpaceId(item);
    if (holders.has(id)) continue;
    const refusal = recoveryRefusal(view.recovery, id);
    if (refusal !== undefined) return refusal;
  }
  const [first, ...rest] = items;
  const resolve = (item: SpaceResourceReplayItem): SpaceResourceLifecycleChange => {
    if (item.kind !== 'update') return item;
    const snapshot = view.spaces.get(item.spaceId);
    if (snapshot === undefined) throw new Error(`Space ${item.spaceId} lost its live session`);
    return { kind: 'update', spaceId: item.spaceId, snapshot };
  };
  return {
    kind: 'changes',
    changes: [resolve(first), ...rest.map(resolve)],
    open: [],
    completion: undefined,
  };
};

type Conflicts = ReadonlyMap<UUID, LoadedSpace | undefined>;

/**
 * What recovering one change replays. Without a conflict, or for a Space the
 * conflict did not name, the change is replayed as it was decided. Otherwise
 * the repository's answer decides: a created Space it already holds is
 * replayed as an update, an updated Space it no longer holds is re-created
 * from the participant's working Space, and a deleted Space it no longer
 * holds is complete.
 */
type ReplayDecision =
  | { readonly kind: 'replay'; readonly item: SpaceResourceReplayItem }
  | { readonly kind: 'recreate'; readonly spaceId: UUID }
  | { readonly kind: 'deleted'; readonly spaceId: UUID };

const replayDecision = (
  change: SpaceResourceLifecycleChange,
  conflicts: Conflicts,
): ReplayDecision => {
  const asDecided: ReplayDecision = {
    kind: 'replay',
    item: change.kind === 'update' ? { kind: 'update', spaceId: change.spaceId } : change,
  };
  const id = changedSpaceId(change);
  if (!conflicts.has(id)) return asDecided;
  const current = conflicts.get(id);
  if (change.kind === 'create' && current !== undefined) {
    return { kind: 'replay', item: { kind: 'update', spaceId: id } };
  }
  if (change.kind === 'update' && current === undefined) return { kind: 'recreate', spaceId: id };
  if (change.kind === 'delete' && current === undefined) return { kind: 'deleted', spaceId: id };
  return asDecided;
};

/**
 * What accepting the stored side does to one participant: take the Space the
 * conflict answered, fall back to its baseline, or — when the repository holds
 * none and there is no baseline to return to — let it go.
 */
const acceptedRemote = (
  spaceId: UUID,
  conflicts: Conflicts,
  baseline: Baseline | undefined,
): Baseline | undefined => {
  if (conflicts.has(spaceId) && conflicts.get(spaceId) === undefined) return undefined;
  return conflicts.get(spaceId) ?? baseline;
};

interface Baseline {
  readonly snapshot: SpaceSnapshot;
  readonly revision: bigint;
}

/**
 * Whether a committed answer acknowledges exactly the Spaces the request
 * named, and the ones it omitted when it does not.
 */
const readCommitted = (
  changes: SpaceResourceChanges,
  result: Extract<CommitResult, { kind: 'committed' }>,
):
  | { readonly kind: 'acknowledged'; readonly revisions: ReadonlyMap<UUID, bigint> }
  | { readonly kind: 'malformed'; readonly omittedSpaceIds: readonly UUID[] } => {
  const revisions = new Map(result.revisions.map(({ spaceId, revision }) => [spaceId, revision]));
  const deleted = new Set(result.deletedSpaceIds);
  const expectedRevisions = changes.flatMap((change) =>
    change.kind === 'delete' ? [] : [changedSpaceId(change)],
  );
  const expectedDeleted = changes.flatMap((change) =>
    change.kind === 'delete' ? [change.spaceId] : [],
  );
  const malformed =
    revisions.size !== result.revisions.length ||
    deleted.size !== result.deletedSpaceIds.length ||
    expectedRevisions.length !== result.revisions.length ||
    expectedDeleted.length !== result.deletedSpaceIds.length ||
    expectedRevisions.some((id) => !revisions.has(id)) ||
    expectedDeleted.some((id) => !deleted.has(id));
  return malformed
    ? {
        kind: 'malformed',
        omittedSpaceIds: [
          ...expectedRevisions.filter((id) => !revisions.has(id)),
          ...expectedDeleted.filter((id) => !deleted.has(id)),
        ],
      }
    : { kind: 'acknowledged', revisions };
};

const protocolFailure = (
  fault: ProtocolFault,
): Extract<CommitResult, { kind: 'permanent-failure' }> => ({
  kind: 'permanent-failure',
  code: 'protocol',
  fault,
});

const clone = <T>(value: T): T => structuredClone(value);

/** The phases a recovery may begin from, and a replay that never prepared returns to. */
type RecoverablePhase = 'conflicted' | 'failed' | 'unwound';

const isRecoverable = (phase: CoordinatedCommitPhase): phase is RecoverablePhase =>
  phase === 'conflicted' || phase === 'failed' || phase === 'unwound';

/**
 * Ask the registry to replay `items` as a new coordination on behalf of
 * `predecessor`, whose recovery that coordination takes over once it prepares.
 */
export type SpaceResourceReplay = (
  items: readonly [SpaceResourceReplayItem, ...SpaceResourceReplayItem[]],
  predecessor: CoordinatedCommit,
) => void;

export class CoordinatedCommit {
  /**
   * The exact request this commit sends, built once before any participant
   * is touched. An `update` carries the planned snapshot, which is also what
   * `prepare` installs as the participant's working Space, so the two cannot
   * disagree; a `create` whose Space has no session yet carries the planned
   * snapshot, and one that has a session carries its working Space.
   */
  readonly request: readonly [SpaceChange, ...SpaceChange[]];
  readonly #changes: SpaceResourceChanges;
  readonly #spaces: CoordinationSpaces;
  readonly #replay: SpaceResourceReplay;
  readonly #predecessor: CoordinatedCommit | undefined;
  readonly #participants: Map<UUID, ManagedSpaceSession>;
  readonly #begun: ManagedSpaceSession[] = [];
  readonly #recovery: CoordinatedRecovery = {
    retry: () => {
      this.#recoverByReplay(new Map());
    },
    keepLocal: () => {
      this.#recoverByReplay(this.#conflicts);
    },
    acceptRemote: () => {
      this.#recoverByAcceptingRemote();
    },
  };
  #phase: CoordinatedCommitPhase = 'planned';
  #baselines: ReadonlyMap<UUID, Baseline> = new Map();
  #conflicts: Conflicts = new Map();
  /** The phase a pending replay's recovery began from. */
  #recoveringFrom: RecoverablePhase | undefined;

  /**
   * `predecessor` is the commit whose recovery this one replays, if any; this
   * commit takes that recovery over once it has prepared every participant.
   */
  constructor(
    changes: SpaceResourceChanges,
    spaces: CoordinationSpaces,
    replay: SpaceResourceReplay,
    predecessor?: CoordinatedCommit,
  ) {
    const ids = changes.map(changedSpaceId);
    if (new Set(ids).size !== ids.length) {
      throw new Error('A coordinated commit may name each Space only once');
    }
    this.#changes = changes;
    this.#spaces = spaces;
    this.#replay = replay;
    this.#predecessor = predecessor;
    this.#participants = new Map(
      changes.flatMap((change): [UUID, ManagedSpaceSession][] => {
        const id = changedSpaceId(change);
        const managed = spaces.session(id);
        if (change.kind !== 'create') {
          if (managed === undefined) throw new Error(`Space ${id} has no live session`);
          return [[id, managed]];
        }
        if (managed !== undefined && !spaces.isUncommittedCreate(id)) {
          throw new Error(`Space ${id} already has a live session`);
        }
        return managed === undefined ? [] : [[id, managed]];
      }),
    );
    const [first, ...rest] = changes;
    this.request = [this.#requested(first), ...rest.map((change) => this.#requested(change))];
  }

  get phase(): CoordinatedCommitPhase {
    return this.#phase;
  }

  /** The participants that still answer to this commit's recovery. */
  recoveryHolders(): ReadonlySet<UUID> {
    return new Set(
      [...this.#participants]
        .filter(([, managed]) => managed.holdsCoordinatedRecovery(this.#recovery))
        .map(([id]) => id),
    );
  }

  /**
   * Open a session for each created Space, record every other participant's
   * baseline, and hold each created Space provisional until the commit answers.
   */
  enlist(): void {
    this.#move('enlisted');
    for (const change of this.#changes) {
      if (change.kind !== 'create' || this.#participants.has(change.snapshot.id)) continue;
      this.#participants.set(change.snapshot.id, this.#spaces.openCreated(clone(change.snapshot)));
    }
    this.#baselines = new Map(
      [...this.#participants].flatMap(([id, managed]): [UUID, Baseline][] => {
        if (this.#spaces.isUncommittedCreate(id)) return [];
        const state = managed.session.getState();
        // A participant kept local over a conflict still holds the stored copy
        // it kept local over, and that, not its working Space, is what storage has.
        const stored =
          state.persistence.kind === 'conflicted' ? state.persistence.current : undefined;
        return [
          [
            id,
            stored === undefined
              ? { snapshot: clone(state.working), revision: state.acknowledgedRevision }
              : { snapshot: clone(stored.snapshot), revision: stored.revision },
          ],
        ];
      }),
    );
    for (const change of this.#changes) {
      if (change.kind === 'create') this.#spaces.holdProvisional(clone(change.snapshot));
    }
  }

  /** Make every participant `coordinating` with the Space it commits. */
  prepare(): void {
    this.#require('enlisted');
    for (const change of this.#changes) {
      const managed = this.#participant(changedSpaceId(change));
      managed.prepareCoordinatedCommit(
        change.kind === 'update'
          ? change.snapshot
          : change.kind === 'create'
            ? managed.session.getState().working
            : undefined,
      );
      this.#begun.push(managed);
    }
    if (this.#predecessor !== undefined) this.#predecessor.#handOver();
    this.#move('prepared');
  }

  publish(): void {
    this.#move('published');
    for (const managed of this.#begun) managed.publishCoordinatedCommit();
  }

  /** Install the backend's answer on every participant. */
  settle(result: CommitResult): void {
    if (result.kind === 'committed') {
      const read = readCommitted(this.#changes, result);
      if (read.kind === 'malformed') {
        this.#fail(
          protocolFailure({
            kind: 'coordinated-result-malformed',
            omittedSpaceIds: read.omittedSpaceIds,
          }),
          [...this.#participants.values()],
        );
        return;
      }
      this.#acknowledge(read.revisions);
      return;
    }
    if (result.kind === 'conflict') {
      this.#conflict(new Map(result.conflicts.map(({ spaceId, current }) => [spaceId, current])));
      return;
    }
    this.#fail(result, [...this.#participants.values()]);
  }

  /**
   * Answer a throw between `enlist` and `settle`. A throw carries no
   * `CommitResult`, and every participant already made `coordinating` still
   * needs one, or it could never save again.
   */
  unwind(cause: unknown): void {
    this.#fail(
      protocolFailure({ kind: 'coordinated-commit-threw', cause }),
      this.#begun,
      'unwound',
    );
  }

  /**
   * The replay this commit's recovery asked for has ended. If it never
   * prepared, recovery is usable again from the phase it began in; if it did,
   * the replay owns recovery and this is a no-op.
   */
  resumeRecovery(): void {
    if (this.#phase === 'recovered') return;
    this.#require('recovering');
    const from = this.#recoveringFrom;
    if (from === undefined) throw new Error('A recovering commit lost the phase it began in');
    this.#recoveringFrom = undefined;
    // A return to where recovery began, not a move the table orders.
    this.#phase = from;
  }

  #handOver(): void {
    this.#require('recovering');
    this.#recoveringFrom = undefined;
    this.#move('recovered');
  }

  #move(to: CoordinatedCommitPhase): void {
    if (!TRANSITIONS[this.#phase].some((next) => next === to)) {
      throw new Error(`A coordinated commit cannot move from ${this.#phase} to ${to}`);
    }
    this.#phase = to;
  }

  #require(phase: CoordinatedCommitPhase): void {
    if (this.#phase !== phase) {
      throw new Error(`A coordinated commit is ${this.#phase}, not ${phase}`);
    }
  }

  #participant(spaceId: UUID): ManagedSpaceSession {
    const managed = this.#participants.get(spaceId);
    if (managed === undefined) throw new Error(`Space ${spaceId} lost its live session`);
    return managed;
  }

  #requested(change: SpaceResourceLifecycleChange): SpaceChange {
    if (change.kind === 'create') {
      const managed = this.#participants.get(change.snapshot.id);
      return {
        kind: 'create',
        spaceId: change.snapshot.id,
        snapshot: clone(managed?.session.getState().working ?? change.snapshot),
      };
    }
    const { acknowledgedRevision } = this.#participant(change.spaceId).session.getState();
    return change.kind === 'delete'
      ? { kind: 'delete', spaceId: change.spaceId, expectedRevision: acknowledgedRevision }
      : {
          kind: 'update',
          spaceId: change.spaceId,
          snapshot: clone(change.snapshot),
          expectedRevision: acknowledgedRevision,
        };
  }

  #dropProvisionalCreates(): void {
    for (const change of this.#changes) {
      if (change.kind === 'create') this.#spaces.dropProvisional(change.snapshot.id);
    }
  }

  #acknowledge(revisions: ReadonlyMap<UUID, bigint>): void {
    this.#move('committed');
    for (const change of this.#changes) {
      const id = changedSpaceId(change);
      if (change.kind === 'delete') {
        this.#participants.get(id)?.completeCoordinatedDeletion();
        this.#spaces.evict(id);
        continue;
      }
      const revision = revisions.get(id);
      if (revision === undefined) throw new Error('Validated revision disappeared');
      if (change.kind === 'create') this.#spaces.dropProvisional(id);
      this.#spaces.clearUncommittedCreate(id);
      this.#participants.get(id)?.acknowledgeCoordinatedCommit(revision);
    }
    for (const managed of this.#participants.values()) managed.notifyCoordinatedCommit();
  }

  #conflict(conflicts: Conflicts): void {
    this.#move('conflicted');
    this.#conflicts = conflicts;
    this.#dropProvisionalCreates();
    for (const [id, managed] of this.#participants) {
      managed.setCoordinatedRecovery(this.#recovery);
      // A participant the conflict did not name reverts to its baseline,
      // which is exactly what accepting the stored side does for it.
      managed.conflictCoordinatedCommit({
        current: conflicts.get(id),
        baseline: conflicts.has(id) ? undefined : this.#baselines.get(id)?.snapshot,
      });
    }
    for (const managed of this.#participants.values()) managed.notifyCoordinatedCommit();
  }

  #fail(
    failure: Exclude<CommitResult, { kind: 'committed' } | { kind: 'conflict' }>,
    participants: readonly ManagedSpaceSession[],
    phase: 'failed' | 'unwound' = 'failed',
  ): void {
    this.#move(phase);
    this.#dropProvisionalCreates();
    for (const managed of participants) {
      managed.setCoordinatedRecovery(this.#recovery);
      managed.failCoordinatedCommit(failure);
    }
    for (const managed of participants) managed.notifyCoordinatedCommit();
  }

  #recoverByReplay(conflicts: Conflicts): void {
    const from = this.#phase;
    if (!isRecoverable(from)) return;
    this.#move('recovering');
    this.#recoveringFrom = from;
    const items = this.#changes.flatMap((change): SpaceResourceReplayItem[] => {
      const decision = replayDecision(change, conflicts);
      if (decision.kind === 'replay') {
        // A created Space the repository already holds is replayed as an update.
        if (change.kind === 'create' && decision.item.kind === 'update') {
          this.#spaces.clearUncommittedCreate(change.snapshot.id);
        }
        return [decision.item];
      }
      if (decision.kind === 'deleted') {
        this.#participants.get(decision.spaceId)?.completeCoordinatedDeletion();
        this.#spaces.evict(decision.spaceId);
        return [];
      }
      this.#spaces.markUncommittedCreate(decision.spaceId);
      return [
        {
          kind: 'create',
          snapshot: this.#participant(decision.spaceId).session.getState().working,
        },
      ];
    });
    const [first, ...rest] = items;
    if (first === undefined) {
      this.#recoveringFrom = undefined;
      this.#move('recovered');
      return;
    }
    this.#replay([first, ...rest], this);
  }

  #recoverByAcceptingRemote(): void {
    if (!isRecoverable(this.#phase)) return;
    this.#move('recovered');
    for (const [id, managed] of this.#participants) {
      const accepted = acceptedRemote(id, this.#conflicts, this.#baselines.get(id));
      if (accepted === undefined) {
        managed.completeCoordinatedDeletion();
        this.#spaces.evict(id);
      } else {
        managed.restoreCoordinatedCommit(accepted.snapshot, accepted.revision);
      }
    }
    for (const managed of this.#participants.values()) managed.notifyCoordinatedCommit();
  }
}

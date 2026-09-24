import type { SpaceSnapshot, UUID } from '@project/core';
import { decideCommit } from './commit-decision';
import { createWorkingSpaceLoader } from './working-space';
import type {
  CommitResult,
  LoadedAggregate,
  LoadedSpace,
  ProtocolFault,
  SpaceBackend,
  SpaceChange,
} from './backend';
import {
  openManagedSpaceSession,
  type ManagedSpaceSession,
  type SpaceSession,
  type SpaceSessionOptions,
} from './session';
import {
  changedSpaceId,
  initializeTarget,
  planContextDeletion,
  planCreate,
  planDelete,
  planLink,
  precheckContextDeletion,
  recoveryRefusal,
  refuseBeforeCreating,
  refuseBeforeLinking,
  targetSelectionOf,
  targetUnavailable,
  type CreateSpaceResourceInput,
  type DeleteReferencedGraphInput,
  type DeleteReferencedMapInput,
  type DeleteSpaceResourceInput,
  type InitializedTarget,
  type LinkSpaceResourceInput,
  type SpaceResourceLifecycleChange,
  type SpaceResourcePlanningView,
  type SpaceResourcePlanOutcome,
  type SpaceResourceRecovery,
  type SpaceResourceRefusal,
  type SpaceResourceRefused,
  type TargetSelection,
} from './space-resource-planning';

export type {
  CreateSpaceResourceInput,
  DeleteReferencedGraphInput,
  DeleteReferencedMapInput,
  DeleteSpaceResourceInput,
  LinkSpaceResourceInput,
  SpaceResourceRefusal,
  SpaceResourceTargetUnavailableReason,
} from './space-resource-planning';

/**
 * What `prepare` answers before the coordination's own aggregate read and
 * `plan`. `proceed` carries whatever `prepare` resolved during its waits —
 * target initialization, minted ids and the like — so `plan` receives it
 * directly. An operation with nothing to carry parameterizes this with
 * `undefined`.
 */
type SpaceResourcePreparationOutcome<P> =
  | { readonly kind: 'proceed'; readonly prepared: P }
  | { readonly kind: 'unchanged' }
  | SpaceResourceRefused;

/**
 * A coordinated operation in the `prepare`/`plan` shape: `prepare` is async and
 * holds every wait an operation needs before its decision. The coordination
 * performs its own aggregate read after `prepare` and before `plan`
 * regardless. `plan` is synchronous and pure (`space-resource-planning.ts`),
 * reads the Spaces as `prepare`'s wait left them, and answers `changes`,
 * `unchanged` or a refusal — never a Promise, so nothing can suspend between
 * the decision and the coordination installing it.
 *
 * The only shape a coordinated operation is authored in: create, link, Space
 * Resource deletion, Map/Graph deletion and a coordinated recovery retry's
 * replay all reach the coordination through this.
 */
interface SpaceResourceCoordinatedOperation<P, C> {
  readonly prepare: () => Promise<SpaceResourcePreparationOutcome<P>>;
  readonly plan: (view: SpaceResourcePlanningView, prepared: P) => SpaceResourcePlanOutcome<C>;
}

/** What a coordination answers its operation once the outcome is installed. */
type SpaceResourceCoordinationResult<C> =
  | { readonly kind: 'installed'; readonly completion: C }
  | { readonly kind: 'unchanged' }
  | SpaceResourceRefused;

export interface ProvisionalSpaceSession {
  readonly kind: 'provisional';
  readonly snapshot: SpaceSnapshot;
}

export type SpaceSessionRegistryEntry =
  { readonly kind: 'session'; readonly session: SpaceSession } | ProvisionalSpaceSession;

export interface SpaceSessionRegistry {
  readonly open: (loaded: LoadedSpace) => SpaceSession;
  /**
   * Resolve once this Space holds no work the registry still owes the backend:
   * no commit in flight, no coordination it participates in, and nothing queued
   * behind a paused turn. An owner waits on this before leaving or retiring a
   * Space, because each of those three states hides authored work that
   * `persistence.kind` alone reports as `settled`.
   */
  readonly waitUntilRetirable: (spaceId: UUID) => Promise<void>;
  /**
   * Retire one idle live session after its owner has completed safe closing,
   * answering whether it was retired.
   *
   * The check and the retirement are one synchronous step because they cannot
   * be two: a coordination can take its turn in the microtask between an
   * owner's {@link waitUntilRetirable} resolving and its call to this, and a
   * session that has become a coordination participant must not vanish from
   * under it. `false` says exactly that happened — wait again and retry.
   */
  readonly release: (spaceId: UUID) => boolean;
  readonly session: (spaceId: UUID) => SpaceSession | undefined;
  readonly entry: (spaceId: UUID) => SpaceSessionRegistryEntry | undefined;
  readonly spaceResources: (newId: () => UUID) => SpaceResourceLifecycle;
}

/** The Edit did not land, said the two ways every operation here can say it. */
type SpaceResourceLifecycleUnsettled =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'refused'; readonly refusal: SpaceResourceRefusal };

/**
 * What an operation that authors a Space Resource answers: the Resource it made.
 *
 * Split from {@link SpaceResourceDeletionResult} rather than carrying an
 * optional id on one shared arm: both `create` and `link` mint the Resource's
 * id locally, so the value exists the moment the result is built, and
 * `delete` creates no Resource to name.
 */
export type SpaceResourceCreationResult =
  { readonly kind: 'completed'; readonly resourceId: UUID } | SpaceResourceLifecycleUnsettled;

/** What deletion answers: that it landed, and nothing a caller could continue at. */
export type SpaceResourceDeletionResult =
  { readonly kind: 'completed' } | SpaceResourceLifecycleUnsettled;

/** What context deletion answers so navigation can follow the coordinated choice. */
export type SpaceResourceContextDeletionResult =
  | { readonly kind: 'completed'; readonly mapId: UUID; readonly graphId: UUID }
  | SpaceResourceLifecycleUnsettled;

export interface SpaceResourceLifecycle {
  readonly create: (input: CreateSpaceResourceInput) => Promise<SpaceResourceCreationResult>;
  readonly link: (input: LinkSpaceResourceInput) => Promise<SpaceResourceCreationResult>;
  readonly delete: (input: DeleteSpaceResourceInput) => Promise<SpaceResourceDeletionResult>;
  readonly deleteMap: (
    input: DeleteReferencedMapInput,
  ) => Promise<SpaceResourceContextDeletionResult>;
  readonly deleteGraph: (
    input: DeleteReferencedGraphInput,
  ) => Promise<SpaceResourceContextDeletionResult>;
}

const clone = <T>(value: T): T => structuredClone(value);

/**
 * A creating operation's answer. Both creating plans answer `changes` or a
 * refusal, never `unchanged`, so meeting it is a programming error.
 */
const creationResult = (
  result: SpaceResourceCoordinationResult<UUID>,
): SpaceResourceCreationResult => {
  if (result.kind === 'unchanged') {
    throw new Error('A completed Space Resource Edit named no Resource');
  }
  return result.kind === 'installed'
    ? { kind: 'completed', resourceId: result.completion }
    : result;
};

const protocolFailure = (
  fault: ProtocolFault,
): Extract<CommitResult, { kind: 'permanent-failure' }> => ({
  kind: 'permanent-failure',
  code: 'protocol',
  fault,
});

export function createSpaceSessionRegistry(
  backend: SpaceBackend,
  options: SpaceSessionOptions = {},
): SpaceSessionRegistry {
  const sessions = new Map<UUID, ManagedSpaceSession>();
  const provisional = new Map<UUID, ProvisionalSpaceSession>();
  const uncommittedCreates = new Set<UUID>();
  let lifecycleTail = Promise.resolve();
  let persistenceBarrier = false;
  /**
   * Coordinations that hold a turn, whether or not they have started one.
   *
   * A coordination takes its `lifecycleTail` slot synchronously and raises
   * `persistenceBarrier` only after awaiting the turn ahead of it, so between
   * the two the barrier reports nothing while a coordination is already
   * committed to running. Retiring a session in that window takes a
   * participant out from under it, and it fails deriving its changes rather
   * than refusing. Counting the turn is what closes the window, because the
   * count moves in the same synchronous step that takes the slot.
   */
  let coordinationTurns = 0;

  const open = (loaded: LoadedSpace): SpaceSession => {
    const id = loaded.snapshot.id;
    const existing = sessions.get(id);
    if (existing !== undefined) return existing.session;
    if (provisional.has(id)) throw new Error(`Space ${id} is still provisional`);
    const managed = openManagedSpaceSession(backend, loaded, options);
    if (persistenceBarrier) managed.pausePersistence();
    sessions.set(id, managed);
    return managed.session;
  };

  /** Each live Space whose persistence needs recovery, in session order. */
  const recoveryNeeded = (): ReadonlyMap<UUID, SpaceResourceRecovery> => {
    const needed = new Map<UUID, SpaceResourceRecovery>();
    for (const [id, managed] of sessions) {
      const { kind } = managed.session.getState().persistence;
      if (kind === 'failed') needed.set(id, 'retry');
      else if (kind === 'conflicted') needed.set(id, 'resolve-conflict');
    }
    return needed;
  };

  const working = (id: UUID): SpaceSnapshot => {
    const session = sessions.get(id)?.session;
    if (session === undefined) throw new Error(`Space ${id} has no live session`);
    return session.getState().working;
  };

  /**
   * The aggregate read every coordinated operation needs before its
   * decision. Called once, before `plan` runs, so that call is "the
   * coordination's own aggregate read" the spec names.
   *
   * Answers the aggregate alone, not a candidate merged with live sessions:
   * an `async` function's own return is one microtask away from its awaiter,
   * and a live session's `working` state is read by the awaiter's own
   * synchronous continuation instead, so nothing can land between capturing
   * it and `plan` deciding from it.
   */
  const loadCoordinationAggregate = async (): Promise<
    | { readonly kind: 'loaded'; readonly aggregate: LoadedAggregate }
    | { readonly kind: 'read-failed'; readonly cause: unknown }
  > => {
    try {
      const result = await backend.loadAggregate();
      if (result.kind === 'uninitialized') throw new Error('The repository is uninitialized');
      return { kind: 'loaded', aggregate: result.aggregate };
    } catch (error) {
      return { kind: 'read-failed', cause: error };
    }
  };

  const runSpaceResourceCoordination = async <P, C>(
    operation: SpaceResourceCoordinatedOperation<P, C>,
    installed: (result: SpaceResourceCoordinationResult<C>) => void,
    /**
     * Whether this turn is `recovery.retry`/`keepLocal` resubmitting a change
     * set an earlier turn already decided and pre-checked, rather than a fresh
     * Space Resource lifecycle operation.
     *
     * A retry still reads the aggregate — the barrier still waits, and a read
     * failure still answers `persistence-read-failed` — it skips only
     * `decideCommit`. A retry replays an earlier turn's already-decided change
     * set, so the pre-check has nothing new to catch and, against
     * `MemorySpaceBackend`'s test double, actively costs: a queued
     * `conflict`/failure result installs the acknowledged revision `session.ts`
     * recorded onto the *session*, but never writes it into the backend's own
     * stored copy, so this turn's read would return the original revision and
     * the pre-check would answer a conflict of its own. The real backend
     * already re-validates every commit, retry or not (ADR 0095), so skipping
     * this turn's redundant pre-check loses no safety.
     */
    isRetry = false,
  ): Promise<void> => {
    const previous = lifecycleTail;
    let releaseTurn = (): void => undefined;
    lifecycleTail = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    coordinationTurns += 1;
    await previous;
    persistenceBarrier = true;
    for (const managed of sessions.values()) managed.pausePersistence();
    try {
      // The barrier waits only for whatever is already in flight (ADR
      // 0099): pausing before this wait is what bounds it — a commit that
      // completes with further queued work settles to idle instead of
      // chaining into the next one (session.ts), so local work queued once
      // the barrier is up stays queued for after this turn rather than
      // being drained into it.
      await Promise.all([...sessions.values()].map((managed) => managed.waitForIdle()));

      const prepared = await operation.prepare();
      if (prepared.kind !== 'proceed') {
        installed(prepared);
        return;
      }
      const loaded = await loadCoordinationAggregate();
      if (loaded.kind === 'read-failed') {
        installed({
          kind: 'refused',
          refusal: { code: 'persistence-read-failed', cause: loaded.cause },
        });
        return;
      }
      const aggregate = loaded.aggregate;
      const candidate = new Map(
        aggregate.spaces.map((space) => [space.snapshot.id, clone(space.snapshot)]),
      );
      for (const [id, managed] of sessions) {
        candidate.set(id, clone(managed.session.getState().working));
      }
      // Nothing suspends between this and installing `planned`'s result: the
      // rest of this function, down to `installed(...)` below, runs to
      // completion without an `await` standing between them.
      const planned = operation.plan(
        {
          spaces: candidate,
          aggregate,
          live: new Set(sessions.keys()),
          recovery: recoveryNeeded(),
        },
        prepared.prepared,
      );
      if (planned.kind !== 'changes') {
        installed(planned);
        return;
      }
      for (const space of planned.open) open(space);
      const changes = planned.changes;

      const ids = changes.map(changedSpaceId);
      if (new Set(ids).size !== ids.length) {
        throw new Error('A coordinated commit may name each Space only once');
      }

      const participants = new Map<UUID, ManagedSpaceSession>();
      for (const change of changes) {
        if (change.kind === 'create') {
          const created = change.snapshot.id;
          if (sessions.has(created) && !uncommittedCreates.has(created)) {
            throw new Error(`Space ${created} already has a live session`);
          }
          const existing = sessions.get(created);
          if (existing !== undefined) participants.set(created, existing);
          continue;
        }
        const managed = sessions.get(change.spaceId);
        if (managed === undefined) throw new Error(`Space ${change.spaceId} has no live session`);
        participants.set(change.spaceId, managed);
      }

      const ensureCreateParticipants = (): void => {
        for (const change of changes) {
          if (change.kind !== 'create' || participants.has(change.snapshot.id)) continue;
          const session = open({
            snapshot: clone(change.snapshot),
            revision: 0n,
            exportedRevision: null,
          });
          const managed = sessions.get(change.snapshot.id);
          if (session !== managed?.session) throw new Error('Created session disappeared');
          participants.set(change.snapshot.id, managed);
          uncommittedCreates.add(change.snapshot.id);
        }
      };

      /**
       * The exact request this turn sends — computed once, synchronously,
       * before anything below touches a participant's session, and spent
       * twice: as the pre-check's `request` and, unchanged, as the actual
       * `backend.commit` request. An `update` carries `plan`'s decided
       * snapshot, which is also what `prepareCoordinatedCommit` installs as
       * the participant's working Space, so the two cannot disagree. Building
       * it before {@link ensureCreateParticipants} runs is safe because a
       * `create` participant with no session yet falls back to the planned
       * snapshot either way.
       */
      const backendChange = (change: SpaceResourceLifecycleChange): SpaceChange => {
        if (change.kind === 'create') {
          const managed = participants.get(change.snapshot.id);
          return {
            kind: 'create',
            spaceId: change.snapshot.id,
            snapshot: clone(managed?.session.getState().working ?? change.snapshot),
          };
        }
        const { spaceId } = change;
        const managed = participants.get(spaceId);
        if (managed === undefined) throw new Error(`Space ${spaceId} lost its live session`);
        const state = managed.session.getState();
        return change.kind === 'delete'
          ? { kind: 'delete', spaceId, expectedRevision: state.acknowledgedRevision }
          : {
              kind: 'update',
              spaceId,
              snapshot: clone(change.snapshot),
              expectedRevision: state.acknowledgedRevision,
            };
      };
      const [firstChange, ...remainingChanges] = changes;
      const backendChanges: [SpaceChange, ...SpaceChange[]] = [
        backendChange(firstChange),
        ...remainingChanges.map(backendChange),
      ];

      /*
       * The pre-commit verdict is the same judge the repository runs (ADR
       * 0095, ADR 0097): `stored` is this turn's one aggregate read. Spaces
       * the Edit does not change are therefore judged as stored and
       * participants as what the commit sends — never a non-participant's
       * uncommitted working Space, which the repository will not see.
       *
       * Skipped on a retry — see {@link isRetry}.
       */
      const preCheck = isRetry
        ? undefined
        : decideCommit({ changes: backendChanges }, aggregate.metaSpaceId, aggregate.spaces);
      if (preCheck?.kind === 'answer' && preCheck.result.kind === 'aggregate-refused') {
        installed({
          kind: 'refused',
          refusal: { code: 'aggregate-refused', errors: preCheck.result.errors },
        });
        return;
      }
      if (preCheck?.kind === 'answer' && preCheck.result.kind === 'rejected') {
        // Unreachable through this registry: the duplicate-naming check above
        // and `backendChange`'s own construction already guarantee a
        // self-consistent request, and `aggregate.metaSpaceId` is always
        // defined once `loadAggregate` answers `loaded` — decideCommit's
        // remaining `rejected` reasons (a repeated Space, a mismatched
        // snapshot, or no Meta) cannot fire from a request built this way.
        throw new Error(
          `decideCommit rejected a well-formed coordinated commit: ${preCheck.result.message}`,
        );
      }

      ensureCreateParticipants();

      const baselines = new Map(
        [...participants].flatMap(([id, managed]) => {
          if (uncommittedCreates.has(id)) return [];
          const state = managed.session.getState();
          return [
            [id, { snapshot: clone(state.working), revision: state.acknowledgedRevision }] as const,
          ];
        }),
      );
      /**
       * What a coordinated retry replays for one participant, decided once
       * when recovery starts. `create` and `delete` already carry everything
       * the retried commit needs; `update` names only the participant,
       * because "commit this Space's current working snapshot" only becomes
       * true once the retried coordination's own aggregate read has produced
       * it — so the retry's own `plan` resolves the value.
       */
      type SpaceResourceRetryItem =
        | { readonly kind: 'create'; readonly snapshot: SpaceSnapshot }
        | { readonly kind: 'update'; readonly spaceId: UUID }
        | { readonly kind: 'delete'; readonly spaceId: UUID };
      const toRetryItem = (change: SpaceResourceLifecycleChange): SpaceResourceRetryItem =>
        change.kind === 'update' ? { kind: 'update', spaceId: change.spaceId } : change;
      let conflictCurrents = new Map<UUID, LoadedSpace | undefined>();
      let recoveryStarted = false;
      const startRecovery = (recoverConflict: boolean): void => {
        if (recoveryStarted) return;
        recoveryStarted = true;
        const retryItems = changes.flatMap((change): SpaceResourceRetryItem[] => {
          if (!recoverConflict) return [toRetryItem(change)];
          const id = changedSpaceId(change);
          if (!conflictCurrents.has(id)) return [toRetryItem(change)];
          const current = conflictCurrents.get(id);
          if (change.kind === 'create' && current !== undefined) {
            return [{ kind: 'update', spaceId: id }];
          }
          if (change.kind === 'update' && current === undefined) {
            const snapshot = participants.get(id)?.session.getState().working;
            if (snapshot === undefined) return [];
            uncommittedCreates.add(id);
            return [{ kind: 'create', snapshot }];
          }
          if (change.kind === 'delete' && current === undefined) {
            participants.get(id)?.completeCoordinatedDeletion();
            sessions.delete(id);
            return [];
          }
          return [toRetryItem(change)];
        });
        const [firstItem, ...remainingItems] = retryItems;
        if (firstItem === undefined) return;
        void coordinateSpaceResource<undefined, undefined>(
          {
            // No wait of its own: every retried item was already decided above,
            // synchronously, from the failed attempt's own state. Only `update`
            // has anything left to resolve, and `plan` resolves it against the
            // Spaces the *retried* coordination's own aggregate read produces.
            prepare: () => Promise.resolve({ kind: 'proceed', prepared: undefined } as const),
            plan: ({ spaces }) => {
              const resolve = (item: SpaceResourceRetryItem): SpaceResourceLifecycleChange => {
                if (item.kind !== 'update') return item;
                const snapshot = spaces.get(item.spaceId);
                if (snapshot === undefined)
                  throw new Error(`Space ${item.spaceId} lost its live session`);
                return { kind: 'update', spaceId: item.spaceId, snapshot };
              };
              return {
                kind: 'changes',
                changes: [resolve(firstItem), ...remainingItems.map(resolve)],
                open: [],
                completion: undefined,
              };
            },
          },
          true,
        );
      };
      const recovery = {
        retry: (): void => {
          startRecovery(false);
        },
        keepLocal: (): void => {
          startRecovery(true);
        },
        acceptRemote: (): void => {
          if (recoveryStarted) return;
          recoveryStarted = true;
          for (const [id, managed] of participants) {
            const current = conflictCurrents.get(id);
            const baseline = baselines.get(id);
            if (conflictCurrents.has(id) && current === undefined) {
              managed.completeCoordinatedDeletion();
              sessions.delete(id);
            } else if (current !== undefined)
              managed.restoreCoordinatedCommit(current.snapshot, current.revision);
            else if (baseline !== undefined)
              managed.restoreCoordinatedCommit(baseline.snapshot, baseline.revision);
            else {
              managed.completeCoordinatedDeletion();
              sessions.delete(id);
            }
          }
          for (const managed of participants.values()) managed.notifyCoordinatedCommit();
        },
      };

      const begun: ManagedSpaceSession[] = [];
      const dropProvisionalCreates = (): void => {
        for (const change of changes) {
          if (change.kind === 'create') provisional.delete(change.snapshot.id);
        }
      };
      /* A throw carries no `CommitResult`, and participants still need one. */
      const unwind = (cause: unknown): void => {
        dropProvisionalCreates();
        const failure = protocolFailure({ kind: 'coordinated-commit-threw', cause });
        for (const managed of begun) {
          managed.setCoordinatedRecovery(recovery);
          managed.failCoordinatedCommit(failure);
        }
        for (const managed of begun) managed.notifyCoordinatedCommit();
      };

      for (const change of changes) {
        if (change.kind !== 'create') continue;
        provisional.set(change.snapshot.id, {
          kind: 'provisional',
          snapshot: clone(change.snapshot),
        });
      }

      /*
       * Everything from the first coordinated preparation on runs under this,
       * because from there every participant is `coordinating` and only an
       * answer clears it. A throw is not an answer, and left alone it is
       * permanent: `submit`, `retry` and `resolveConflict` all early-return
       * while `coordinating` holds, so the Space could never save again. Two
       * throws are real. `prepareCoordinatedCommit` rejects a participant that
       * is already committing. And `commit` itself may reject: the shipped
       * backends answer transport failure with a value, but nothing in the
       * seam requires that.
       */
      try {
        for (const change of changes) {
          const managed = participants.get(changedSpaceId(change));
          if (managed === undefined) continue;
          managed.prepareCoordinatedCommit(
            change.kind === 'update'
              ? change.snapshot
              : change.kind === 'create'
                ? managed.session.getState().working
                : undefined,
          );
          begun.push(managed);
        }
        for (const managed of begun) managed.publishCoordinatedCommit();
        installed({ kind: 'installed', completion: planned.completion });
      } catch (error) {
        unwind(error);
        throw error;
      }

      // The pre-check acts only on `aggregate-refused`, above (and the
      // unreachable `rejected` throw, also above); a `conflict` or `write`
      // verdict still reaches the backend as normal, so it is the
      // repository's own answer — not the pre-check's guess at it — that
      // carries the current state a conflict names.
      let result: CommitResult;
      try {
        result = await backend.commit({ changes: backendChanges });
      } catch (error) {
        unwind(error);
        throw error;
      }
      if (result.kind === 'committed') {
        const revisions = new Map(
          result.revisions.map(({ spaceId, revision }) => [spaceId, revision]),
        );
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
        if (malformed) {
          dropProvisionalCreates();
          const failure = protocolFailure({
            kind: 'coordinated-result-malformed',
            omittedSpaceIds: [
              ...expectedRevisions.filter((id) => !revisions.has(id)),
              ...expectedDeleted.filter((id) => !deleted.has(id)),
            ],
          });
          for (const managed of participants.values()) {
            managed.setCoordinatedRecovery(recovery);
            managed.failCoordinatedCommit(failure);
          }
          for (const managed of participants.values()) managed.notifyCoordinatedCommit();
          return;
        }

        for (const change of changes) {
          const id = changedSpaceId(change);
          if (change.kind === 'delete') {
            const managed = participants.get(id);
            managed?.completeCoordinatedDeletion();
            sessions.delete(id);
            continue;
          }
          const revision = revisions.get(id);
          if (revision === undefined) throw new Error('Validated revision disappeared');
          if (change.kind === 'create') provisional.delete(id);
          uncommittedCreates.delete(id);
          participants.get(id)?.acknowledgeCoordinatedCommit(revision);
        }
        for (const managed of participants.values()) managed.notifyCoordinatedCommit();
        return;
      }

      dropProvisionalCreates();

      if (result.kind === 'conflict') {
        const conflicts = new Map(
          result.conflicts.map(({ spaceId, current }) => [spaceId, current]),
        );
        conflictCurrents = conflicts;
        for (const [id, managed] of participants) {
          managed.setCoordinatedRecovery(recovery);
          // A participant the conflict did not name reverts to its baseline,
          // which is exactly the branch `recovery.acceptRemote` takes for it.
          managed.conflictCoordinatedCommit({
            current: conflicts.get(id),
            baseline: conflicts.has(id) ? undefined : baselines.get(id)?.snapshot,
          });
        }
        for (const managed of participants.values()) managed.notifyCoordinatedCommit();
        return;
      }

      for (const managed of participants.values()) {
        managed.setCoordinatedRecovery(recovery);
        managed.failCoordinatedCommit(result);
      }
      for (const managed of participants.values()) managed.notifyCoordinatedCommit();
    } finally {
      persistenceBarrier = false;
      coordinationTurns -= 1;
      for (const managed of sessions.values()) managed.resumePersistence();
      releaseTurn();
    }
  };

  /**
   * Run a coordinated operation (see {@link SpaceResourceCoordinatedOperation})
   * and answer once its outcome is installed — before the commit it sends
   * settles. A throw before installation rejects the answer.
   */
  const coordinateSpaceResource = async <P, C>(
    operation: SpaceResourceCoordinatedOperation<P, C>,
    isRetry = false,
  ): Promise<SpaceResourceCoordinationResult<C>> => {
    const installation = Promise.withResolvers<SpaceResourceCoordinationResult<C>>();
    void runSpaceResourceCoordination(operation, installation.resolve, isRetry).catch(
      installation.reject,
    );
    return installation.promise;
  };

  const spaceResources = (newId: () => UUID): SpaceResourceLifecycle => {
    const loadWorkingSpace = createWorkingSpaceLoader(backend, newId);
    /**
     * Make the target working, then read the selection it opens on.
     *
     * **Inside `prepare`, and after the containing Space's own checks.** A
     * turn is claimed synchronously by the call this sits in, so a Space
     * cannot be released out from under the Edit, and an Edit the containing
     * Space has already refused initializes nothing and mints no id.
     *
     * Initialization is its own durable single-Space commit, issued while the
     * coordination's barrier is raised. The barrier stops a *session*
     * committing over the topology Edit; this commit belongs to a Space with
     * no live session to pause. The target is never a participant of the Edit
     * this prepares (ADR 0097): it supplies a selection to read, not content
     * to write, and the coordination's aggregate read comes after `prepare`
     * returns, so `plan` reads the initialized target.
     *
     * **A failure after this point leaves the target initialized and makes no
     * Resource, and that is accepted rather than repaired.** ADR 0079 already
     * has a Space gain its Map the first time anything works with it, and the
     * initialization is idempotent, so retrying the refused Edit is clean
     * rather than cumulative. The commit is legal because the adapters'
     * shared `baselineUnreferenced` carve-out forgives a Space that was
     * already unreferenced before it.
     *
     * **Read as stored, even for an open target session (ADR 0097).** The
     * target is not a participant, so its selection is never read from a live
     * session's `working`, which can name a Map or Graph that never committed.
     */
    const workingTargetSelection = async (targetSpaceId: UUID): Promise<TargetSelection> => {
      let stored: LoadedSpace | undefined;
      try {
        stored = await loadWorkingSpace(targetSpaceId);
      } catch {
        // Every throw out of the loader lands here: the author has one move
        // for all of them — the target has no selection to give and the next
        // attempt may find one — and `not-initialized` is what says so. The
        // opening path, where these same throws are raised, owns reporting
        // them.
        return { kind: 'unavailable', reason: 'not-initialized' };
      }
      return targetSelectionOf(stored?.snapshot);
    };

    const create = async (
      input: CreateSpaceResourceInput,
    ): Promise<SpaceResourceCreationResult> => {
      type CreatePrepared = InitializedTarget & { readonly resourceId: UUID };
      const result = await coordinateSpaceResource<CreatePrepared, UUID>({
        prepare: (): Promise<SpaceResourcePreparationOutcome<CreatePrepared>> => {
          const refusal = refuseBeforeCreating(recoveryNeeded(), working, input);
          if (refusal !== undefined) return Promise.resolve(refusal);
          const target = initializeTarget(input.title, newId);
          return Promise.resolve({
            kind: 'proceed',
            prepared: { ...target, resourceId: newId() },
          });
        },
        plan: (view, prepared) => planCreate(view, input, prepared),
      });
      return creationResult(result);
    };

    const link = async (input: LinkSpaceResourceInput): Promise<SpaceResourceCreationResult> => {
      const result = await coordinateSpaceResource<UUID, UUID>({
        prepare: async (): Promise<SpaceResourcePreparationOutcome<UUID>> => {
          const refusal = refuseBeforeLinking(recoveryNeeded(), working, input);
          if (refusal !== undefined) return refusal;
          // Last, and deliberately: an Edit the containing Space has already
          // refused must not initialize the Space it was pointed at, and must
          // not mint the two identities doing so would spend.
          const target = await workingTargetSelection(input.targetSpaceId);
          if (target.kind === 'unavailable') {
            return targetUnavailable(input.targetSpaceId, target.reason);
          }
          return { kind: 'proceed', prepared: newId() };
        },
        plan: (view, resourceId) => planLink(view, input, resourceId),
      });
      return creationResult(result);
    };

    const deleteContext = async (
      input: DeleteReferencedMapInput | DeleteReferencedGraphInput,
    ): Promise<SpaceResourceContextDeletionResult> => {
      const result = await coordinateSpaceResource({
        prepare: (): Promise<SpaceResourcePreparationOutcome<undefined>> => {
          const precheck = precheckContextDeletion(recoveryNeeded(), working, input);
          return Promise.resolve(
            precheck.kind === 'proceed' ? { kind: 'proceed', prepared: undefined } : precheck,
          );
        },
        plan: (view) => planContextDeletion(view, input),
      });
      return result.kind === 'installed' ? { kind: 'completed', ...result.completion } : result;
    };

    const deleteSpaceResource = async (
      input: DeleteSpaceResourceInput,
    ): Promise<SpaceResourceDeletionResult> => {
      const result = await coordinateSpaceResource({
        // The coordination's own aggregate read is what `plan` decides
        // against, so the only early exit worth taking here is one that needs
        // no read at all.
        prepare: () =>
          Promise.resolve<SpaceResourcePreparationOutcome<undefined>>(
            recoveryRefusal(recoveryNeeded(), input.containingSpaceId) ?? {
              kind: 'proceed',
              prepared: undefined,
            },
          ),
        plan: (view) => planDelete(view, input),
      });
      // Neither `prepare` nor `planDelete` answers `unchanged`, so meeting it
      // is a programming error, as it is for `creationResult`.
      if (result.kind === 'unchanged') {
        throw new Error('A Space Resource deletion answered unchanged');
      }
      return result.kind === 'refused' ? result : { kind: 'completed' };
    };

    return {
      create,
      link,
      delete: deleteSpaceResource,
      deleteMap: deleteContext,
      deleteGraph: deleteContext,
    };
  };

  const waitUntilRetirable = async (spaceId: UUID): Promise<void> => {
    for (;;) {
      const managed = sessions.get(spaceId);
      if (managed === undefined) return;
      // A coordination holds a turn, so queued work cannot drain and the
      // participant set must not change under it. Wait the turn out: its
      // `finally` lowers the barrier and resumes, which is what lets the
      // queued snapshot become an in-flight commit this loop can then await.
      if (coordinationTurns > 0) {
        await lifecycleTail;
        continue;
      }
      if (managed.isIdle() && !managed.hasQueuedWork()) return;
      await managed.waitForIdle();
    }
  };

  const registry: SpaceSessionRegistry = {
    open,
    waitUntilRetirable,
    release: (spaceId) => {
      const managed = sessions.get(spaceId);
      if (managed === undefined) return true;
      if (coordinationTurns > 0) return false;
      if (!managed.isIdle() || managed.hasQueuedWork()) return false;
      managed.setCoordinatedRecovery(undefined);
      sessions.delete(spaceId);
      uncommittedCreates.delete(spaceId);
      return true;
    },
    session: (spaceId) => sessions.get(spaceId)?.session,
    entry: (spaceId) => {
      const managed = sessions.get(spaceId);
      if (managed !== undefined) return { kind: 'session', session: managed.session };
      return provisional.get(spaceId);
    },
    spaceResources,
  };
  return registry;
}

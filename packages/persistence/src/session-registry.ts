import type { SpaceSnapshot, UUID } from '@project/core';
import type { CommitResult, LoadedSpace, SpaceBackend, SpaceChange } from './backend';
import {
  openManagedSpaceSession,
  type ManagedSpaceSession,
  type SpaceSession,
  type SpaceSessionOptions,
} from './session';

export type SessionRegistryChange =
  | { readonly kind: 'create'; readonly snapshot: SpaceSnapshot }
  /**
   * An update is a rebase, not a snapshot, because `submit` waits for every
   * participant's in-flight commit before it begins. Edits made during that
   * wait commit through the ordinary path first, so a snapshot the caller
   * derived beforehand would be stored over them and silently lose them. The
   * edit is applied to the participant's working snapshot as it stands when the
   * wait ends, and it must be pure — it can run against a Space that moved.
   */
  | {
      readonly kind: 'update';
      readonly spaceId: UUID;
      readonly edit: (current: SpaceSnapshot) => SpaceSnapshot;
    }
  | { readonly kind: 'delete'; readonly spaceId: UUID };

export interface ProvisionalSpaceSession {
  readonly kind: 'provisional';
  readonly snapshot: SpaceSnapshot;
}

export type SpaceSessionRegistryEntry =
  { readonly kind: 'session'; readonly session: SpaceSession } | ProvisionalSpaceSession;

export interface SpaceSessionRegistry {
  readonly open: (loaded: LoadedSpace) => SpaceSession;
  readonly session: (spaceId: UUID) => SpaceSession | undefined;
  readonly entry: (spaceId: UUID) => SpaceSessionRegistryEntry | undefined;
  readonly submit: (
    changes: readonly [SessionRegistryChange, ...SessionRegistryChange[]],
  ) => Promise<CommitResult>;
}

const clone = <T>(value: T): T => structuredClone(value);

const protocolFailure = (
  message: string,
): Extract<CommitResult, { kind: 'permanent-failure' }> => ({
  kind: 'permanent-failure',
  code: 'protocol',
  message,
});

export function createSpaceSessionRegistry(
  backend: SpaceBackend,
  options: SpaceSessionOptions = {},
): SpaceSessionRegistry {
  const sessions = new Map<UUID, ManagedSpaceSession>();
  const provisional = new Map<UUID, ProvisionalSpaceSession>();

  const open = (loaded: LoadedSpace): SpaceSession => {
    const id = loaded.snapshot.id;
    const existing = sessions.get(id);
    if (existing !== undefined) return existing.session;
    if (provisional.has(id)) throw new Error(`Space ${id} is still provisional`);
    const managed = openManagedSpaceSession(backend, loaded, options);
    sessions.set(id, managed);
    return managed.session;
  };

  return {
    open,
    session: (spaceId) => sessions.get(spaceId)?.session,
    entry: (spaceId) => {
      const managed = sessions.get(spaceId);
      if (managed !== undefined) return { kind: 'session', session: managed.session };
      return provisional.get(spaceId);
    },
    submit: async (changes) => {
      const ids = changes.map((change) =>
        change.kind === 'create' ? change.snapshot.id : change.spaceId,
      );
      if (new Set(ids).size !== ids.length) {
        throw new Error('A coordinated commit may name each Space only once');
      }

      const participants = new Map<UUID, ManagedSpaceSession>();
      for (const change of changes) {
        if (change.kind === 'create') {
          const created = change.snapshot.id;
          if (sessions.has(created)) {
            throw new Error(`Space ${created} already has a live session`);
          }
          continue;
        }
        const managed = sessions.get(change.spaceId);
        if (managed === undefined) throw new Error(`Space ${change.spaceId} has no live session`);
        participants.set(change.spaceId, managed);
      }

      const begun: ManagedSpaceSession[] = [];
      const dropProvisionalCreates = (): void => {
        for (const change of changes) {
          if (change.kind === 'create') provisional.delete(change.snapshot.id);
        }
      };
      /* A throw carries no `CommitResult`, and participants still need one. */
      const unwind = (message: string): void => {
        dropProvisionalCreates();
        const failure = protocolFailure(`The coordinated commit threw: ${message}`);
        for (const managed of begun) managed.failCoordinatedCommit(failure);
      };

      for (const change of changes) {
        if (change.kind !== 'create') continue;
        provisional.set(change.snapshot.id, {
          kind: 'provisional',
          snapshot: clone(change.snapshot),
        });
      }

      if ([...participants.values()].some((managed) => !managed.isIdle())) {
        await Promise.all([...participants.values()].map((managed) => managed.waitForIdle()));
      }

      /*
       * Everything from the first `beginCoordinatedCommit` on runs under this,
       * because from there every participant is `coordinating` and only an
       * answer clears it. A throw is not an answer, and left alone it is
       * permanent: `submit`, `retry` and `resolveConflict` all early-return
       * while `coordinating` holds, so the Space could never save again. Two
       * throws are real. `beginCoordinatedCommit` rejects a participant that
       * started an ordinary commit inside the wait above — the awaits between
       * participants are suspension points an edit can land in. And `commit`
       * itself may reject: the shipped backends answer transport failure with a
       * value, but nothing in the seam requires that.
       */
      try {
        for (const change of changes) {
          if (change.kind === 'create') continue;
          const managed = participants.get(change.spaceId);
          if (managed === undefined) continue;
          managed.beginCoordinatedCommit(
            change.kind === 'update' ? change.edit(managed.session.getState().working) : undefined,
          );
          begun.push(managed);
        }
      } catch (error) {
        unwind(error instanceof Error ? error.message : String(error));
        throw error;
      }

      const backendChange = (change: SessionRegistryChange): SpaceChange => {
        if (change.kind === 'create') {
          return { kind: 'create', spaceId: change.snapshot.id, snapshot: clone(change.snapshot) };
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
              snapshot: clone(state.working),
              expectedRevision: state.acknowledgedRevision,
            };
      };
      const [firstChange, ...remainingChanges] = changes;
      const backendChanges: [SpaceChange, ...SpaceChange[]] = [
        backendChange(firstChange),
        ...remainingChanges.map(backendChange),
      ];

      let result: CommitResult;
      try {
        result = await backend.commit({ changes: backendChanges });
      } catch (error) {
        unwind(error instanceof Error ? error.message : String(error));
        throw error;
      }
      if (result.kind === 'committed') {
        const revisions = new Map(
          result.revisions.map(({ spaceId, revision }) => [spaceId, revision]),
        );
        const deleted = new Set(result.deletedSpaceIds);
        const malformed = changes.find((change) =>
          change.kind === 'delete'
            ? !deleted.has(change.spaceId)
            : !revisions.has(change.kind === 'create' ? change.snapshot.id : change.spaceId),
        );
        if (malformed !== undefined) {
          dropProvisionalCreates();
          const failure = protocolFailure('Commit result omitted a coordinated Space result');
          for (const managed of participants.values()) managed.failCoordinatedCommit(failure);
          return failure;
        }

        for (const change of changes) {
          const id = change.kind === 'create' ? change.snapshot.id : change.spaceId;
          if (change.kind === 'delete') {
            const managed = participants.get(id);
            managed?.completeCoordinatedDeletion();
            sessions.delete(id);
            continue;
          }
          const revision = revisions.get(id);
          if (revision === undefined) throw new Error('Validated revision disappeared');
          if (change.kind === 'create') {
            provisional.delete(id);
            open({ snapshot: clone(change.snapshot), revision, exportedRevision: null });
          } else {
            participants.get(id)?.acknowledgeCoordinatedCommit(revision);
          }
        }
        return result;
      }

      dropProvisionalCreates();

      if (result.kind === 'conflict') {
        const conflicts = new Map(
          result.conflicts.map(({ spaceId, current }) => [spaceId, current]),
        );
        for (const [id, managed] of participants) {
          managed.conflictCoordinatedCommit(conflicts.get(id));
        }
        return result;
      }

      for (const managed of participants.values()) managed.failCoordinatedCommit(result);
      return result;
    },
  };
}

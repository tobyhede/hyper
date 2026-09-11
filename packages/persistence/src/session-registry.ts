import {
  SPACE_FILE_VERSION,
  type ThingDocument,
  type DiagramPosition,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import {
  initializeSpace,
  loadSpace,
  loadSpaceAggregate,
  loadSpaceSnapshot,
  type Space,
  type SpaceAggregateError,
} from '@project/graph';
import { createWorkingSpaceLoader } from './working-space';
import type {
  CommitResult,
  LoadedAggregate,
  LoadedSpace,
  SpaceBackend,
  SpaceChange,
} from './backend';
import {
  openManagedSpaceSession,
  type ManagedSpaceSession,
  type SpaceSession,
  type SpaceSessionOptions,
} from './session';

type SpaceThingLifecycleChange =
  | { readonly kind: 'create'; readonly snapshot: SpaceSnapshot }
  /**
   * An update is a rebase, not a snapshot, because lifecycle coordination waits for every
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

type SpaceThingCoordinationResult = CommitResult | { readonly kind: 'persistence-read-failed' };

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
  readonly spaceThings: (newId: () => UUID) => SpaceThingLifecycle;
}

/** What a Space Thing selects in the Space it shows: one Diagram and one of its Graphs. */
interface SpaceThingSelection {
  readonly diagram: UUID;
  readonly graph: UUID;
}

export interface CreateSpaceThingInput {
  readonly containingSpaceId: UUID;
  readonly diagramId: UUID;
  readonly title: string;
  readonly position: DiagramPosition;
}
/**
 * Reference an existing Space. The selection is **not** a parameter (ADR 0079).
 *
 * A Space Thing stores a Diagram and a Graph of its target from the moment it
 * exists, and where those come from is this module's rule rather than a
 * caller's: the target is made working — which durably initializes a stored
 * diagramless Space — and the Diagram it opens on, with that Diagram's Active
 * Graph, is what the Thing records. A caller holding a `SpaceSummary` has
 * neither id to offer, and the pane that chooses a target shows no selector,
 * so an optional override here would be a seam nothing could fill honestly.
 * Choosing differently is an Edit on the Thing afterwards (ADR 0068).
 */
export interface LinkSpaceThingInput extends CreateSpaceThingInput {
  readonly targetSpaceId: UUID;
}
export interface DeleteSpaceThingInput {
  readonly containingSpaceId: UUID;
  readonly thingId: UUID;
}
export type SpaceThingLifecycleResult =
  | { readonly kind: 'completed' }
  | { readonly kind: 'unchanged' }
  | {
      readonly kind: 'refused';
      readonly refusal:
        | { readonly code: 'diagram-not-found'; readonly diagramId: UUID }
        | { readonly code: 'space-thing-not-found'; readonly thingId: UUID }
        | {
            readonly code: 'persistence-recovery-required';
            readonly spaceId: UUID;
            readonly recovery: 'retry' | 'resolve-conflict';
          }
        | { readonly code: 'aggregate-refused'; readonly errors: readonly SpaceAggregateError[] }
        | { readonly code: 'persistence-read-failed' }
        /**
         * The target could not be made working, so it supplies no Diagram and
         * Graph for the Thing to select (ADR 0079).
         *
         * One code for reading it, initializing it and finding it gone between
         * the listing and this Edit, because the author's answer is the same in
         * all three and the Edit did not begin in any of them. It is separate
         * from `persistence-read-failed`, which is about the Spaces this Edit
         * validates against rather than the one it was pointed at.
         */
        | { readonly code: 'space-thing-target-unavailable'; readonly spaceId: UUID };
    };
export interface SpaceThingLifecycle {
  readonly create: (input: CreateSpaceThingInput) => Promise<SpaceThingLifecycleResult>;
  readonly link: (input: LinkSpaceThingInput) => Promise<SpaceThingLifecycleResult>;
  readonly delete: (input: DeleteSpaceThingInput) => Promise<SpaceThingLifecycleResult>;
}

const clone = <T>(value: T): T => structuredClone(value);
const completed = { kind: 'completed' } as const;
const snapshotFromSpace = (space: Space): SpaceSnapshot => {
  const document: SpaceSnapshot['document'] = {
    version: SPACE_FILE_VERSION,
    title: space.title,
  };
  if (space.diagrams.length > 0) document.diagrams = [...space.diagrams];
  if (space.defaultDiagram !== undefined) document.defaultDiagram = space.defaultDiagram;
  return {
    id: space.id,
    document,
    things: space.things.map(({ id, ...thingDocument }) => ({ id, document: thingDocument })),
  };
};
const removeSpaceThing = (snapshot: SpaceSnapshot, thingId: UUID): SpaceSnapshot => ({
  ...snapshot,
  things: snapshot.things.filter(({ id }) => id !== thingId),
  document: {
    ...snapshot.document,
    diagrams: (snapshot.document.diagrams ?? []).map((diagram) => ({
      ...diagram,
      positions: Object.fromEntries(
        Object.entries(diagram.positions).filter(([id]) => id !== thingId),
      ),
      graphs: diagram.graphs.map((graph) => ({
        ...graph,
        edges: graph.edges.filter(({ from, to }) => from !== thingId && to !== thingId),
      })),
    })),
  },
});
const addSpaceThing = (
  snapshot: SpaceSnapshot,
  diagramId: UUID,
  thingId: UUID,
  document: ThingDocument,
  position: DiagramPosition,
): SpaceSnapshot => ({
  ...snapshot,
  things: [...snapshot.things, { id: thingId, document }],
  document: {
    ...snapshot.document,
    diagrams: (snapshot.document.diagrams ?? []).map((diagram) =>
      diagram.id === diagramId
        ? {
            ...diagram,
            positions: { ...diagram.positions, [thingId]: { ...position, open: false } },
          }
        : diagram,
    ),
  },
});

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

  const runSpaceThingCoordination = async (
    derive: () =>
      | readonly [SpaceThingLifecycleChange, ...SpaceThingLifecycleChange[]]
      | undefined
      | Promise<readonly [SpaceThingLifecycleChange, ...SpaceThingLifecycleChange[]] | undefined>,
    installed: (result?: SpaceThingCoordinationResult) => void,
  ): Promise<CommitResult> => {
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
      await Promise.all([...sessions.values()].map((managed) => managed.waitForIdle()));
      const changes = await derive();
      if (changes === undefined) {
        installed();
        return { kind: 'committed', revisions: [], deletedSpaceIds: [] };
      }
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
      let aggregate: LoadedAggregate;
      try {
        const result = await backend.loadAggregate();
        if (result.kind === 'uninitialized') throw new Error('The repository is uninitialized');
        aggregate = result.aggregate;
      } catch (error) {
        installed({ kind: 'persistence-read-failed' });
        return protocolFailure(
          `The coordinated persistence read threw: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const candidate = new Map(
        aggregate.spaces.map((loaded) => [loaded.snapshot.id, clone(loaded.snapshot)]),
      );
      for (const [id, managed] of sessions) {
        candidate.set(id, clone(managed.session.getState().working));
      }
      for (const change of changes) {
        if (change.kind === 'create') {
          const current = participants.get(change.snapshot.id)?.session.getState().working;
          candidate.set(change.snapshot.id, clone(current ?? change.snapshot));
        } else if (change.kind === 'delete') candidate.delete(change.spaceId);
        else {
          const current = participants.get(change.spaceId)?.session.getState().working;
          if (current === undefined)
            throw new Error(`Space ${change.spaceId} lost its live session`);
          candidate.set(change.spaceId, change.edit(current));
        }
      }
      const intake = loadSpaceAggregate({
        metaSpaceId: aggregate.metaSpaceId,
        snapshots: [...candidate.values()],
      });
      if (!intake.ok) {
        const refusal = { kind: 'aggregate-refused', errors: intake.errors } as const;
        installed(refusal);
        return refusal;
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
      const identityChange = (change: SpaceThingLifecycleChange): SpaceThingLifecycleChange =>
        change.kind === 'update' ? { ...change, edit: (current) => current } : change;
      let conflictCurrents = new Map<UUID, LoadedSpace | undefined>();
      let recoveryStarted = false;
      const startRecovery = (recoverConflict: boolean): void => {
        if (recoveryStarted) return;
        recoveryStarted = true;
        const retryChanges = changes.flatMap((change): SpaceThingLifecycleChange[] => {
          if (!recoverConflict) return [identityChange(change)];
          const id = change.kind === 'create' ? change.snapshot.id : change.spaceId;
          if (!conflictCurrents.has(id)) return [identityChange(change)];
          const current = conflictCurrents.get(id);
          if (change.kind === 'create' && current !== undefined) {
            return [{ kind: 'update', spaceId: id, edit: (working) => working }];
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
          return [identityChange(change)];
        });
        const [first, ...remaining] = retryChanges;
        if (first === undefined) return;
        void coordinateSpaceThingLifecycle(() => [first, ...remaining]);
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
      const unwind = (message: string): void => {
        dropProvisionalCreates();
        const failure = protocolFailure(`The coordinated commit threw: ${message}`);
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
       * throws are real. `beginCoordinatedCommit` rejects a participant that
       * started an ordinary commit inside the wait above — the awaits between
       * participants are suspension points an edit can land in. And `commit`
       * itself may reject: the shipped backends answer transport failure with a
       * value, but nothing in the seam requires that.
       */
      try {
        for (const change of changes) {
          const managed = participants.get(
            change.kind === 'create' ? change.snapshot.id : change.spaceId,
          );
          if (managed === undefined) continue;
          managed.prepareCoordinatedCommit(
            change.kind === 'update'
              ? change.edit(managed.session.getState().working)
              : change.kind === 'create'
                ? managed.session.getState().working
                : undefined,
          );
          begun.push(managed);
        }
        for (const managed of begun) managed.publishCoordinatedCommit();
        installed();
      } catch (error) {
        unwind(error instanceof Error ? error.message : String(error));
        throw error;
      }

      const backendChange = (change: SpaceThingLifecycleChange): SpaceChange => {
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
        const expectedRevisions = changes.flatMap((change) =>
          change.kind === 'delete'
            ? []
            : [change.kind === 'create' ? change.snapshot.id : change.spaceId],
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
          const failure = protocolFailure('Commit result omitted a coordinated Space result');
          for (const managed of participants.values()) {
            managed.setCoordinatedRecovery(recovery);
            managed.failCoordinatedCommit(failure);
          }
          for (const managed of participants.values()) managed.notifyCoordinatedCommit();
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
            uncommittedCreates.delete(id);
            participants.get(id)?.acknowledgeCoordinatedCommit(revision);
          } else {
            uncommittedCreates.delete(id);
            participants.get(id)?.acknowledgeCoordinatedCommit(revision);
          }
        }
        for (const managed of participants.values()) managed.notifyCoordinatedCommit();
        return result;
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
        return result;
      }

      for (const managed of participants.values()) {
        managed.setCoordinatedRecovery(recovery);
        managed.failCoordinatedCommit(result);
      }
      for (const managed of participants.values()) managed.notifyCoordinatedCommit();
      return result;
    } finally {
      persistenceBarrier = false;
      coordinationTurns -= 1;
      for (const managed of sessions.values()) managed.resumePersistence();
      releaseTurn();
    }
  };

  const coordinateSpaceThingLifecycle = async (
    derive: () =>
      | readonly [SpaceThingLifecycleChange, ...SpaceThingLifecycleChange[]]
      | undefined
      | Promise<readonly [SpaceThingLifecycleChange, ...SpaceThingLifecycleChange[]] | undefined>,
  ): Promise<SpaceThingCoordinationResult> => {
    const installation = Promise.withResolvers<SpaceThingCoordinationResult>();
    void runSpaceThingCoordination(derive, (result) =>
      installation.resolve(result ?? { kind: 'committed', revisions: [], deletedSpaceIds: [] }),
    ).catch(installation.reject);
    return installation.promise;
  };

  const spaceThings = (newId: () => UUID): SpaceThingLifecycle => {
    const loadWorkingSpace = createWorkingSpaceLoader(backend, newId);
    /**
     * The one rule for what a Space Thing selects in a Space it is shown
     * (ADR 0079, ADR 0026).
     *
     * The Diagram the Space itself opens on, and that Diagram's own Active
     * Graph — the head of its list only where it has authored none, which is
     * what an absent `activeGraph` means. Written here rather than at the two
     * callers because `create` and `link` reach a Space by different routes and
     * must still seed the same selection, and because the on-canvas selector
     * seeds a *changed* Diagram by the same rule
     * (`packages/app/src/canvas-thing-authoring.ts`).
     *
     * `undefined` says the Space supplies no selection. After initialization
     * that is unreachable through a valid Space — `defaultDiagram` is recorded
     * and every Diagram owns at least one Graph — so this is the type-level
     * boundary between a snapshot that passed intake and the ids read out of
     * it, not a state the author can produce.
     */
    const selectionOf = (space: Space): SpaceThingSelection | undefined => {
      if (space.defaultDiagram === undefined) return undefined;
      const resolved = space.lookup.diagram(space.defaultDiagram);
      if (resolved === undefined) return undefined;
      const { diagram } = resolved;
      const graph =
        diagram.graphs.find(({ id }) => id === diagram.activeGraph) ?? diagram.graphs[0];
      if (graph === undefined) return undefined;
      return { diagram: diagram.id, graph: graph.id };
    };
    /**
     * Make the target working, then read what it opens on.
     *
     * **Before the coordination, never inside it.** Initialization is its own
     * durable single-Space commit, and `derive` runs with the persistence
     * barrier raised against revisions the coordination is about to spend — a
     * commit from in there would conflict with the Edit that called it. Running
     * first is also what the ticket asks for in order: the target is durably
     * initialized, and only then is a Thing authored against what it minted. So
     * a failure here produces no Thing at all rather than a half-written pair.
     *
     * An open target is read from its live session instead, because that is the
     * Space the author can see; it is already initialized, opening being the
     * working load that does it.
     *
     * Nothing holds the target still between this and the Edit. It does not
     * need to: the selection is validated against the whole aggregate inside
     * the coordination, so a Diagram deleted in the gap is refused as
     * `space-thing-diagram-missing` rather than stored.
     */
    const targetSelection = async (targetSpaceId: UUID): Promise<SpaceThingSelection | undefined> => {
      const live = sessions.get(targetSpaceId)?.session.getState().working;
      if (live !== undefined) {
        const loaded = loadSpaceSnapshot(live);
        return loaded.ok ? selectionOf(loaded.space) : undefined;
      }
      let stored: LoadedSpace | undefined;
      try {
        stored = await loadWorkingSpace(targetSpaceId);
      } catch {
        // The loader throws when initialization could not commit. That is the
        // same answer to the author as a Space that has gone: this Edit was not
        // attempted. Its own diagnostics belong to the opening path, which is
        // where a reader would go looking for them.
        return undefined;
      }
      if (stored === undefined) return undefined;
      const loaded = loadSpaceSnapshot(stored.snapshot);
      return loaded.ok ? selectionOf(loaded.space) : undefined;
    };
    const working = (id: UUID): SpaceSnapshot => {
      const session = sessions.get(id)?.session;
      if (session === undefined) throw new Error(`Space ${id} has no live session`);
      return session.getState().working;
    };
    const recoveryRefusal = (spaceId: UUID): SpaceThingLifecycleResult | undefined => {
      const persistence = sessions.get(spaceId)?.session.getState().persistence;
      if (persistence?.kind === 'failed') {
        return {
          kind: 'refused',
          refusal: { code: 'persistence-recovery-required', spaceId, recovery: 'retry' },
        };
      }
      if (persistence?.kind === 'conflicted') {
        return {
          kind: 'refused',
          refusal: {
            code: 'persistence-recovery-required',
            spaceId,
            recovery: 'resolve-conflict',
          },
        };
      }
      return undefined;
    };
    const link = async (input: LinkSpaceThingInput): Promise<SpaceThingLifecycleResult> => {
      let refusal: SpaceThingLifecycleResult | undefined;
      const result = await coordinateSpaceThingLifecycle(async () => {
        refusal = recoveryRefusal(input.containingSpaceId);
        if (refusal !== undefined) return undefined;
        const source = working(input.containingSpaceId);
        if (!(source.document.diagrams ?? []).some(({ id }) => id === input.diagramId)) {
          refusal = {
            kind: 'refused',
            refusal: { code: 'diagram-not-found', diagramId: input.diagramId },
          };
          return undefined;
        }
        // Last, and deliberately: an Edit the containing Space has already
        // refused must not initialize the Space it was pointed at, and must not
        // mint the two identities doing so would spend.
        const selection = await targetSelection(input.targetSpaceId);
        if (selection === undefined) {
          refusal = {
            kind: 'refused',
            refusal: {
              code: 'space-thing-target-unavailable',
              spaceId: input.targetSpaceId,
            },
          };
          return undefined;
        }
        const document: ThingDocument = {
          title: input.title,
          kind: 'space',
          spaceId: input.targetSpaceId,
          diagram: selection.diagram,
          graph: selection.graph,
        };
        const thingId = newId();
        return [
          {
            kind: 'update',
            spaceId: input.containingSpaceId,
            edit: (current) =>
              addSpaceThing(current, input.diagramId, thingId, document, input.position),
          },
        ];
      });
      if (result.kind === 'persistence-read-failed') {
        return { kind: 'refused', refusal: { code: 'persistence-read-failed' } };
      }
      if (result.kind === 'aggregate-refused') {
        return { kind: 'refused', refusal: { code: 'aggregate-refused', errors: result.errors } };
      }
      return refusal ?? completed;
    };
    return {
      create: async (input) => {
        let refusal: SpaceThingLifecycleResult | undefined;
        const result = await coordinateSpaceThingLifecycle(() => {
          refusal = recoveryRefusal(input.containingSpaceId);
          if (refusal !== undefined) return undefined;
          const source = working(input.containingSpaceId);
          if (!(source.document.diagrams ?? []).some(({ id }) => id === input.diagramId)) {
            refusal = {
              kind: 'refused',
              refusal: { code: 'diagram-not-found', diagramId: input.diagramId },
            };
            return undefined;
          }
          const initialized = initializeSpace({ title: input.title, newId });
          const loaded = loadSpace(initialized.file, initialized.thingFiles);
          if (!loaded.ok) throw new Error(loaded.errors.map(({ message }) => message).join('\n'));
          const target = snapshotFromSpace(loaded.space);
          // The Diagram and Graph the initializer just minted, read back through
          // the same rule a stored target answers rather than off the file it
          // wrote (ADR 0079). A new Space is complete, so the boundary below is
          // type-level: `initializeSpace` authors a `defaultDiagram` owning one
          // Graph, and the intake above has already accepted it.
          const selection = selectionOf(loaded.space);
          if (selection === undefined)
            throw new Error('An initialized Space supplied no Diagram to select');
          const thingId = newId();
          return [
            {
              kind: 'update',
              spaceId: input.containingSpaceId,
              edit: (current) =>
                addSpaceThing(
                  current,
                  input.diagramId,
                  thingId,
                  {
                    title: input.title,
                    kind: 'space',
                    spaceId: target.id,
                    diagram: selection.diagram,
                    graph: selection.graph,
                  },
                  input.position,
                ),
            },
            { kind: 'create', snapshot: target },
          ];
        });
        if (result.kind === 'persistence-read-failed') {
          return { kind: 'refused', refusal: { code: 'persistence-read-failed' } };
        }
        if (result.kind === 'aggregate-refused') {
          return {
            kind: 'refused',
            refusal: { code: 'aggregate-refused', errors: result.errors },
          };
        }
        return refusal ?? completed;
      },
      link,
      delete: async (input) => {
        let refusal: SpaceThingLifecycleResult | undefined;
        const result = await coordinateSpaceThingLifecycle(async () => {
          refusal = recoveryRefusal(input.containingSpaceId);
          if (refusal !== undefined) return undefined;
          let aggregate: LoadedAggregate;
          try {
            const result = await backend.loadAggregate();
            if (result.kind === 'uninitialized') throw new Error('The repository is uninitialized');
            aggregate = result.aggregate;
          } catch {
            refusal = { kind: 'refused', refusal: { code: 'persistence-read-failed' } };
            return undefined;
          }
          const source = working(input.containingSpaceId);
          const thing = source.things.find(({ id }) => id === input.thingId);
          if (thing?.document.kind !== 'space') {
            refusal = {
              kind: 'refused',
              refusal: { code: 'space-thing-not-found', thingId: input.thingId },
            };
            return undefined;
          }
          const snapshots = new Map(
            aggregate.spaces.map((loaded) => [loaded.snapshot.id, loaded.snapshot]),
          );
          for (const [id, managed] of sessions) {
            snapshots.set(id, managed.session.getState().working);
          }
          snapshots.set(input.containingSpaceId, removeSpaceThing(source, input.thingId));
          const inbound = new Map<UUID, number>();
          for (const snapshot of snapshots.values()) inbound.set(snapshot.id, 0);
          for (const snapshot of snapshots.values())
            for (const candidate of snapshot.things) {
              if (candidate.document.kind === 'space')
                inbound.set(
                  candidate.document.spaceId,
                  (inbound.get(candidate.document.spaceId) ?? 0) + 1,
                );
            }
          const deleted: UUID[] = [];
          const pending: UUID[] =
            thing.document.spaceId === aggregate.metaSpaceId ||
            (inbound.get(thing.document.spaceId) ?? 0) !== 0
              ? []
              : [thing.document.spaceId];
          for (const id of pending) {
            if (deleted.includes(id)) continue;
            const snapshot = snapshots.get(id);
            if (snapshot === undefined) continue;
            deleted.push(id);
            for (const child of snapshot.things)
              if (child.document.kind === 'space') {
                const count = (inbound.get(child.document.spaceId) ?? 0) - 1;
                inbound.set(child.document.spaceId, count);
                if (child.document.spaceId !== aggregate.metaSpaceId && count === 0)
                  pending.push(child.document.spaceId);
              }
          }
          for (const id of deleted) {
            refusal = recoveryRefusal(id);
            if (refusal !== undefined) return undefined;
          }
          for (const id of deleted) {
            const loaded = aggregate.spaces.find(({ snapshot }) => snapshot.id === id);
            if (loaded !== undefined && !sessions.has(id)) open(loaded);
          }
          return [
            {
              kind: 'update',
              spaceId: input.containingSpaceId,
              edit: (current) => removeSpaceThing(current, input.thingId),
            },
            ...deleted.map((spaceId) => ({ kind: 'delete' as const, spaceId })),
          ];
        });
        if (result.kind === 'persistence-read-failed') {
          return { kind: 'refused', refusal: { code: 'persistence-read-failed' } };
        }
        if (result.kind === 'aggregate-refused') {
          return {
            kind: 'refused',
            refusal: { code: 'aggregate-refused', errors: result.errors },
          };
        }
        return refusal ?? completed;
      },
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
    spaceThings,
  };
  return registry;
}

import type { UUID } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import {
  createObservableState,
  createSpaceSessionRegistry,
  createWorkingSpaceLoader,
  type LoadedSpace,
  type ObserverErrorReporter,
  type SpaceBackend,
  type SpaceCardLifecycle,
  type SpaceSession,
} from '@project/persistence';
import { composeApp, type ComposedApp } from './compose-app';
import type { CanvasRendererId } from './renderer';

export interface OpenSpace {
  readonly id: UUID;
  readonly session: SpaceSession;
  readonly app: ComposedApp;
  /** Set when this Space's first working load authored its opening Layout. */
  readonly initialization?: 'created-layout';
}

export interface OpenSpacesState {
  readonly activeSpaceId: UUID | null;
  readonly entries: readonly OpenSpace[];
}

export type CloseSpaceResult =
  | { readonly kind: 'closed' }
  | { readonly kind: 'warning'; readonly warning: 'persistence-rejected' }
  | {
      readonly kind: 'refused';
      readonly refusal:
        | { readonly code: 'meta-space-permanent' }
        | {
            readonly code: 'persistence-recovery-required';
            readonly recovery: 'retry' | 'resolve-conflict';
          };
    };

export interface RejectedCloseConfirmation {
  readonly warning: 'persistence-rejected';
}

export interface OpenSpaces {
  readonly getState: () => OpenSpacesState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly entry: (spaceId: UUID) => OpenSpace | undefined;
  readonly open: (target: UUID | LoadedSpace, selection?: CanvasRendererId) => Promise<OpenSpace>;
  readonly enter: (spaceId: UUID, selection?: CanvasRendererId) => Promise<OpenSpace>;
  readonly switchTo: (spaceId: UUID) => Promise<OpenSpace>;
  readonly close: (
    spaceId: UUID,
    confirmation?: RejectedCloseConfirmation,
  ) => Promise<CloseSpaceResult>;
  readonly spaceCards: SpaceCardLifecycle;
}

export interface OpenSpacesOptions {
  readonly backend: SpaceBackend;
  readonly metaSpaceId: UUID;
  readonly newId: () => UUID;
  readonly reportObserverError?: ObserverErrorReporter;
}

const waitUntilNotPending = (session: SpaceSession): Promise<void> => {
  if (session.getState().persistence.kind !== 'pending') return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = session.subscribe(() => {
      if (session.getState().persistence.kind === 'pending') return;
      unsubscribe();
      resolve();
    });
    if (session.getState().persistence.kind !== 'pending') {
      unsubscribe();
      resolve();
    }
  });
};

/** Own every live Space composition and the one registry they all share. */
export function createOpenSpaces({
  backend,
  metaSpaceId,
  newId,
  reportObserverError,
}: OpenSpacesOptions): OpenSpaces {
  const report =
    reportObserverError ??
    ((error: unknown) => console.error('Open Spaces observer failed', error));
  const registry = createSpaceSessionRegistry(backend, { reportObserverError: report });
  // Opening a Space is a working load, so it initializes a stored layoutless
  // Space before anything composes against it (ADR 0079).
  const loadWorkingSpace = createWorkingSpaceLoader(backend, newId);
  const observable = createObservableState<OpenSpacesState>(
    { activeSpaceId: null, entries: [] },
    report,
  );
  const compositions = new Map<UUID, Promise<OpenSpace>>();

  const activate = (entry: OpenSpace): void => {
    const state = observable.getState();
    const entries = state.entries.some(({ id }) => id === entry.id)
      ? state.entries
      : [...state.entries, entry];
    observable.publish({ activeSpaceId: entry.id, entries });
  };

  const compose = (
    target: UUID | LoadedSpace,
    selection?: CanvasRendererId,
  ): Promise<OpenSpace> => {
    const spaceId = typeof target === 'string' ? target : target.snapshot.id;
    const existing = compositions.get(spaceId);
    if (existing !== undefined) return existing;
    const opening = (async (): Promise<OpenSpace> => {
      const loaded = typeof target === 'string' ? await loadWorkingSpace(spaceId) : target;
      if (loaded === undefined) throw new Error(`The backend could not load space ${spaceId}`);
      const runtime = loadSpaceSnapshot(loaded.snapshot);
      if (!runtime.ok) {
        throw new Error(
          `The backend returned an invalid space:\n${runtime.errors.map((error) => `  - ${error.message}`).join('\n')}`,
        );
      }
      const session = registry.open(loaded);
      const opened = {
        id: spaceId,
        session,
        app: composeApp({ spaceSession: session, selection }),
      };
      if (loaded.initialization !== 'created-layout') return opened;
      return { ...opened, initialization: 'created-layout' };
    })();
    compositions.set(spaceId, opening);
    void opening.catch(() => compositions.delete(spaceId));
    return opening;
  };

  const activateAfterLeavingSettles = async (target: OpenSpace): Promise<OpenSpace> => {
    const active = observable.getState().activeSpaceId;
    if (active !== null && active !== target.id) {
      const leaving = observable.getState().entries.find(({ id }) => id === active);
      if (leaving !== undefined) await waitUntilNotPending(leaving.session);
    }
    activate(target);
    return target;
  };

  const open = async (
    target: UUID | LoadedSpace,
    selection?: CanvasRendererId,
  ): Promise<OpenSpace> => {
    return activateAfterLeavingSettles(await compose(target, selection));
  };

  const switchTo = async (spaceId: UUID): Promise<OpenSpace> => {
    const target = observable.getState().entries.find(({ id }) => id === spaceId);
    if (target === undefined) throw new Error(`Space ${spaceId} is not open`);
    return activateAfterLeavingSettles(target);
  };

  const close = async (
    spaceId: UUID,
    confirmation?: RejectedCloseConfirmation,
  ): Promise<CloseSpaceResult> => {
    if (spaceId === metaSpaceId) {
      return { kind: 'refused', refusal: { code: 'meta-space-permanent' } };
    }
    const target = observable.getState().entries.find(({ id }) => id === spaceId);
    if (target === undefined) throw new Error(`Space ${spaceId} is not open`);
    await waitUntilNotPending(target.session);
    const persistence = target.session.getState().persistence;
    if (persistence.kind === 'failed') {
      return {
        kind: 'refused',
        refusal: { code: 'persistence-recovery-required', recovery: 'retry' },
      };
    }
    if (persistence.kind === 'conflicted') {
      return {
        kind: 'refused',
        refusal: { code: 'persistence-recovery-required', recovery: 'resolve-conflict' },
      };
    }
    if (persistence.kind === 'rejected' && confirmation?.warning !== 'persistence-rejected') {
      return { kind: 'warning', warning: 'persistence-rejected' };
    }
    const state = observable.getState();
    const entries = state.entries.filter(({ id }) => id !== spaceId);
    const activeSpaceId =
      state.activeSpaceId === spaceId ? (entries[0]?.id ?? null) : state.activeSpaceId;
    observable.publish({ activeSpaceId, entries });
    compositions.delete(spaceId);
    registry.release(spaceId);
    return { kind: 'closed' };
  };

  return {
    getState: observable.getState,
    subscribe: observable.subscribe,
    entry: (spaceId) => observable.getState().entries.find(({ id }) => id === spaceId),
    open,
    enter: open,
    switchTo,
    close,
    spaceCards: registry.spaceCards(newId),
  };
}

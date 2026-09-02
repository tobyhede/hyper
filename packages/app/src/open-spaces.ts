import type { UUID } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { resolveProductDestination } from '@project/http';
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
import { destinationOpening, type DestinationOpening } from './destination-opening';
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
  readonly open: (spaceId: UUID, selection?: CanvasRendererId) => Promise<OpenSpace>;
  readonly openPath: (pathname: string) => Promise<{
    readonly opened: OpenSpace;
    readonly opening?: DestinationOpening;
  }>;
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
  const report: ObserverErrorReporter =
    reportObserverError ?? console.error.bind(console, 'Open Spaces observer failed');
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

  const buildLoaded = (loaded: LoadedSpace, selection?: CanvasRendererId): OpenSpace => {
    const spaceId = loaded.snapshot.id;
    const runtime = loadSpaceSnapshot(loaded.snapshot);
    if (!runtime.ok) {
      throw new Error(
        `The backend returned an invalid space:\n${runtime.errors.map((error) => `  - ${error.message}`).join('\n')}`,
      );
    }
    const session = registry.open(loaded);
    const opened = { id: spaceId, session, app: composeApp({ spaceSession: session, selection }) };
    if (loaded.initialization !== 'created-layout') return opened;
    return { ...opened, initialization: 'created-layout' };
  };

  const composeLoaded = (loaded: LoadedSpace, selection?: CanvasRendererId): Promise<OpenSpace> => {
    const spaceId = loaded.snapshot.id;
    const existing = compositions.get(spaceId);
    if (existing !== undefined) return existing;
    const opening = Promise.resolve().then(() => buildLoaded(loaded, selection));
    compositions.set(spaceId, opening);
    void opening.catch(() => compositions.delete(spaceId));
    return opening;
  };

  const compose = (spaceId: UUID, selection?: CanvasRendererId): Promise<OpenSpace> => {
    const existing = compositions.get(spaceId);
    if (existing !== undefined) return existing;
    const opening = loadWorkingSpace(spaceId).then((loaded) => {
      if (loaded === undefined) throw new Error(`The backend could not load space ${spaceId}`);
      return buildLoaded(loaded, selection);
    });
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

  const open = async (spaceId: UUID, selection?: CanvasRendererId): Promise<OpenSpace> => {
    return activateAfterLeavingSettles(await compose(spaceId, selection));
  };

  const openPath: OpenSpaces['openPath'] = async (pathname) => {
    // Resolving an address is a working load, so it initializes a stored
    // layoutless Space before the destination is read off it (ADR 0079).
    const resolution = await resolveProductDestination({ loadSpace: loadWorkingSpace }, pathname);
    if (resolution.kind === 'outside') throw new Error('The URL is outside product addressing.');
    if (resolution.kind === 'malformed') throw new Error('The product URL is malformed.');
    if (resolution.kind === 'unresolved') throw new Error('The product URL does not resolve.');
    if (resolution.kind === 'collision') throw new Error('The product URL names two Space Views.');
    const runtime = loadSpaceSnapshot(resolution.loaded.snapshot);
    if (!runtime.ok) {
      throw new Error(
        `The backend returned an invalid space:\n${runtime.errors.map((error) => `  - ${error.message}`).join('\n')}`,
      );
    }
    const opening = destinationOpening(runtime.space, resolution.destination);
    const opened = await activateAfterLeavingSettles(
      await composeLoaded(resolution.loaded, opening.selection),
    );
    return { opened, opening };
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
    registry.release(spaceId);
    compositions.delete(spaceId);
    observable.publish({ activeSpaceId, entries });
    return { kind: 'closed' };
  };

  return {
    getState: observable.getState,
    subscribe: observable.subscribe,
    entry: (spaceId) => observable.getState().entries.find(({ id }) => id === spaceId),
    open,
    openPath,
    enter: open,
    switchTo,
    close,
    spaceCards: registry.spaceCards(newId),
  };
}

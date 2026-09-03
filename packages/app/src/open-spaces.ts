import type { UUID } from '@project/core';
import { loadSpaceSnapshot, type Space } from '@project/graph';
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

interface ValidatedLoadedSpace {
  readonly loaded: LoadedSpace;
  readonly space: Space;
}

const validateLoadedSpace = (loaded: LoadedSpace): ValidatedLoadedSpace => {
  const runtime = loadSpaceSnapshot(loaded.snapshot);
  if (!runtime.ok) {
    throw new Error(
      `The backend returned an invalid space:\n${runtime.errors.map((error) => `  - ${error.message}`).join('\n')}`,
    );
  }
  return { loaded, space: runtime.space };
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

  /**
   * Every activation request in the order it was made.
   *
   * Waiting for the Space being left to settle takes arbitrarily long, and the
   * author keeps choosing while it does. A request that returns to find a later
   * one recorded has been superseded: the Space it opened stays open, but
   * reinstating it on the canvas would undo the newer choice.
   */
  let activationRequest = 0;

  /**
   * The entries `close` has retired.
   *
   * An activation captures its target and then waits arbitrarily long for the
   * Space being left. A close completing inside that wait retires the session
   * and disposes the composition, so reinstating the target on the canvas would
   * hand the author a Space nothing can commit for. Identity is the test, not
   * the Space Id: the same Space reopened is a different entry and reinstating
   * *it* would be correct.
   */
  const retired = new WeakSet<OpenSpace>();

  /**
   * Number one activation intent.
   *
   * A call that throws before it activates has to give its number back. A
   * consumed number no activation will ever claim reads as a newer choice to
   * everything already waiting, so a legitimately pending activation declines
   * the canvas for a choice nobody made. Giving it back is only right while
   * nothing newer has been numbered — if something has, that is the real
   * supersession and the number stands.
   */
  const beginActivation = () => {
    const request = ++activationRequest;
    return {
      request,
      abandon: () => {
        if (activationRequest === request) activationRequest = request - 1;
      },
    };
  };

  const include = (entry: OpenSpace, activeSpaceId: UUID): void => {
    const state = observable.getState();
    if (state.entries.some(({ id }) => id === entry.id)) {
      if (state.activeSpaceId === activeSpaceId) return;
      observable.publish({ activeSpaceId, entries: state.entries });
      return;
    }
    observable.publish({ activeSpaceId, entries: [...state.entries, entry] });
  };

  const buildLoaded = (
    { loaded }: ValidatedLoadedSpace,
    selection?: CanvasRendererId,
  ): OpenSpace => {
    const spaceId = loaded.snapshot.id;
    // A session the registry already holds keeps the snapshot it was opened on
    // and discards this one, so anything read off `loaded` afterwards describes
    // a read that was thrown away.
    const reused = registry.session(spaceId) !== undefined;
    const session = registry.open(loaded);
    // Every identity and every observer failure in a composed Space comes from
    // the seams Open Spaces was given (ADR 0016). Leaving either off here lets
    // `composeApp` fall back to the ambient generator and to `console.error`,
    // which is the second, invisible source the one owner exists to prevent.
    const opened = {
      id: spaceId,
      session,
      app: composeApp({ spaceSession: session, selection, newId, reportObserverError: report }),
    };
    if (reused || loaded.initialization !== 'created-layout') return opened;
    return { ...opened, initialization: 'created-layout' };
  };

  const composeValidated = (
    validated: ValidatedLoadedSpace,
    selection?: CanvasRendererId,
  ): Promise<OpenSpace> => {
    const { loaded } = validated;
    const spaceId = loaded.snapshot.id;
    const existing = compositions.get(spaceId);
    if (existing !== undefined) return existing;
    const opening = Promise.resolve().then(() => buildLoaded(validated, selection));
    compositions.set(spaceId, opening);
    void opening.catch(() => compositions.delete(spaceId));
    return opening;
  };

  const compose = (spaceId: UUID, selection?: CanvasRendererId): Promise<OpenSpace> => {
    const existing = compositions.get(spaceId);
    if (existing !== undefined) return existing;
    const opening = loadWorkingSpace(spaceId).then((loaded) => {
      if (loaded === undefined) throw new Error(`The backend could not load space ${spaceId}`);
      return buildLoaded(validateLoadedSpace(loaded), selection);
    });
    compositions.set(spaceId, opening);
    void opening.catch(() => compositions.delete(spaceId));
    return opening;
  };

  const activateAfterLeavingSettles = async (
    target: OpenSpace,
    request: number,
  ): Promise<OpenSpace> => {
    const active = observable.getState().activeSpaceId;
    if (active !== null && active !== target.id) {
      await registry.waitUntilRetirable(active);
    }
    if (retired.has(target)) return target;
    if (request !== activationRequest) {
      include(target, observable.getState().activeSpaceId ?? target.id);
      return target;
    }
    include(target, target.id);
    return target;
  };

  const open = async (spaceId: UUID, selection?: CanvasRendererId): Promise<OpenSpace> => {
    // Numbered before the Space is loaded, not after: composition is itself a
    // wait, and a request made first must not be superseded by one made second
    // merely because the second Space was already in hand.
    const { request, abandon } = beginActivation();
    try {
      return await activateAfterLeavingSettles(await compose(spaceId, selection), request);
    } catch (error) {
      abandon();
      throw error;
    }
  };

  const openPath: OpenSpaces['openPath'] = async (pathname) => {
    const { request, abandon } = beginActivation();
    try {
      return await openResolvedPath(pathname, request);
    } catch (error) {
      abandon();
      throw error;
    }
  };

  const openResolvedPath = async (
    pathname: string,
    request: number,
  ): ReturnType<OpenSpaces['openPath']> => {
    // Resolving an address is a working load, so it initializes a stored
    // layoutless Space before the destination is read off it (ADR 0079).
    const resolution = await resolveProductDestination({ loadSpace: loadWorkingSpace }, pathname);
    if (resolution.kind === 'outside') throw new Error('The URL is outside product addressing.');
    if (resolution.kind === 'malformed') throw new Error('The product URL is malformed.');
    if (resolution.kind === 'unresolved') throw new Error('The product URL does not resolve.');
    if (resolution.kind === 'collision') throw new Error('The product URL names two Space Views.');
    const validated = validateLoadedSpace(resolution.loaded);
    const destination = destinationOpening(validated.space, resolution.destination);
    const opened = await activateAfterLeavingSettles(
      await composeValidated(validated, destination.selection),
      request,
    );
    // A Space already open keeps the selection it is being worked in, so the
    // URL's is only a proposal. Report the one that holds: a caller opening the
    // named Graph does so against the selected Space View, and the two
    // disagreeing is how a Graph lands on a Space View nobody named.
    const selection = opened.app.navigation.getState().selectedRenderer;
    const opening: DestinationOpening =
      selection === destination.selection ? destination : { ...destination, selection };
    return { opened, opening };
  };

  const switchTo = async (spaceId: UUID): Promise<OpenSpace> => {
    const target = observable.getState().entries.find(({ id }) => id === spaceId);
    if (target === undefined) throw new Error(`Space ${spaceId} is not open`);
    const { request, abandon } = beginActivation();
    try {
      return await activateAfterLeavingSettles(target, request);
    } catch (error) {
      abandon();
      throw error;
    }
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
    // Waiting and retiring cannot be one step: a coordination can raise the
    // barrier in the microtask between them, which makes this Space one of its
    // participants again. So the wait, the reading it justifies and the
    // retirement are one attempt, repeated until the retirement holds.
    for (;;) {
      await registry.waitUntilRetirable(spaceId);
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
      // The registry stops owning this session here, so anything still driving
      // it would be a writer outside the one owner.
      if (registry.release(spaceId)) break;
    }
    const state = observable.getState();
    const entries = state.entries.filter(({ id }) => id !== spaceId);
    const activeSpaceId =
      state.activeSpaceId === spaceId ? (entries[0]?.id ?? null) : state.activeSpaceId;
    // The composition goes with the session the registry has just stopped owning.
    target.app.edgeAuthoring.dispose();
    target.app.authoring.dispose();
    retired.add(target);
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

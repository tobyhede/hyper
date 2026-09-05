import type { LayoutId, UUID } from '@project/core';
import { loadSpaceSnapshot, type Space } from '@project/graph';
import { resolveProductDestination } from '@project/http';
import {
  createObservableState,
  createSpaceSessionRegistry,
  createWorkingSpaceLoader,
  type LoadedSpace,
  type ObserverErrorReporter,
  type SpaceBackend,
  type SpaceSession,
} from '@project/persistence';
import { createBrowserLocation, type BrowserLocation, type HistoryApi } from './browser-location';
import { composeApp, type ComposedApp } from './compose-app';
import { destinationOpening, type DestinationOpening } from './destination-opening';
import { createSpaceCardLifecycle, type SpaceCardAuthoring } from './space-card-lifecycle';

export interface OpenSpace {
  readonly id: UUID;
  readonly session: SpaceSession;
  readonly app: ComposedApp;
  /**
   * Authoring the Space Cards this Space holds (ADR 0074, ADR 0076).
   *
   * Carried on the entry rather than composed inside the app because it is
   * written over the *registry*, not over one session: creating, referencing
   * and deleting a Space Card are Edits across several Spaces, and the registry
   * is what holds the others. Every entry names the same one — which is why it
   * is required rather than optional, and why an app is never composed half
   * able to author a Space Card.
   */
  readonly spaceCards: SpaceCardAuthoring;
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
  readonly metaSpaceId: UUID;
  readonly getState: () => OpenSpacesState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly entry: (spaceId: UUID) => OpenSpace | undefined;
  readonly open: (spaceId: UUID, selection?: LayoutId) => Promise<OpenSpace>;
  /** Keep the containing canvas active while opening a target for embedded editing. */
  readonly embed: (spaceId: UUID) => Promise<OpenSpace>;
  readonly openPath: (pathname: string) => Promise<{
    readonly opened: OpenSpace;
    readonly opening?: DestinationOpening;
  }>;
  readonly enter: (spaceId: UUID, selection?: LayoutId) => Promise<OpenSpace>;
  readonly switchTo: (spaceId: UUID) => Promise<OpenSpace>;
  readonly close: (
    spaceId: UUID,
    confirmation?: RejectedCloseConfirmation,
  ) => Promise<CloseSpaceResult>;
  readonly spaceCards: SpaceCardAuthoring;
  /**
   * The browser's location, following whichever Space is on the canvas.
   *
   * One module for the session rather than one per Space: there is one history
   * stack, and N compositions each holding the position they last synced to
   * would be N modules disagreeing about it. `openPath` is the
   * pathname-to-opening direction and this is its inverse, so both live with
   * the one thing that knows how many Spaces there are.
   */
  readonly browserLocation: BrowserLocation;
}

export interface OpenSpacesOptions {
  readonly backend: SpaceBackend;
  readonly metaSpaceId: UUID;
  readonly newId: () => UUID;
  /**
   * What the browser is asked for, required with no default (ADR 0016).
   *
   * `createSpaceStartup` supplies the one adapter over `window`; a test supplies
   * a recording one. A default here would put the ambient browser back behind
   * the one owner that is supposed to name it.
   */
  readonly history: HistoryApi;
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
  history,
  reportObserverError,
}: OpenSpacesOptions): OpenSpaces {
  const report: ObserverErrorReporter =
    reportObserverError ?? console.error.bind(console, 'Open Spaces observer failed');
  const registry = createSpaceSessionRegistry(backend, { reportObserverError: report });
  // Opening a Space is a working load, so it initializes a stored layoutless
  // Space before anything composes against it (ADR 0079).
  const loadWorkingSpace = createWorkingSpaceLoader(backend, newId);
  const spaceCards = createSpaceCardLifecycle({ backend, registry, newId });
  const observable = createObservableState<OpenSpacesState>(
    { activeSpaceId: null, entries: [] },
    report,
  );
  const compositions = new Map<UUID, Promise<OpenSpace>>();
  const browserLocation = createBrowserLocation(history, report, async (pathname) => {
    await openPath(pathname);
  });

  /**
   * Hand the browser's location whichever composition is now on the canvas.
   *
   * Called after every publication that can change the active Space, and
   * comparing the composition rather than the Space Id: the same Space reopened
   * is a different entry, and the location has to follow the one that can
   * commit.
   */
  let followed: ComposedApp | null = null;
  const followActiveSpace = (): void => {
    const { activeSpaceId, entries } = observable.getState();
    const active = entries.find(({ id }) => id === activeSpaceId);
    // Closing the last Space leaves nothing on the canvas, and holding the
    // composition it disposed would keep the whole graph behind that entry
    // alive and claim a Space is followed that is not.
    if (active === undefined) {
      followed = null;
      return;
    }
    if (active.app === followed) return;
    const switching = followed !== null;
    followed = active.app;
    if (switching) browserLocation.activate(active.app);
    else browserLocation.follow(active.app);
  };

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
   * The numbers whose calls threw before activating.
   *
   * Recorded rather than simply subtracted, because two calls can give their
   * numbers back in either order. The earlier one cannot subtract while the
   * later is still outstanding — that later number is a real choice, and the
   * supersession stands. So when the later one is given back too, the number it
   * uncovers may itself be abandoned, and stepping back only one leaves the
   * count resting on a choice nobody made.
   */
  const abandoned = new Set<number>();

  /**
   * The closes that have begun and not yet settled, by Space.
   *
   * A close waits arbitrarily long for its Space to become retirable, and both
   * caches still advertise the entry it is going to retire while it does. An
   * activation reading one of them inside that window would hand the author a
   * composition the close is about to dispose and a session the registry is
   * about to release. So an activation that finds a close underway waits it out
   * and takes the Space the close leaves behind — the reloaded one, or this
   * same entry if the close was refused.
   */
  const closing = new Map<UUID, Promise<unknown>>();

  /**
   * Number one activation intent.
   *
   * A call that throws before it activates has to give its number back. A
   * consumed number no activation will ever claim reads as a newer choice to
   * everything already waiting, so a legitimately pending activation declines
   * the canvas for a choice nobody made. Giving it back is only right while
   * nothing newer has been numbered — if something has, that is the real
   * supersession and the number stands, until that newer one is given back in
   * its turn and the two collapse together.
   */
  const beginActivation = () => {
    const request = ++activationRequest;
    return {
      request,
      abandon: () => {
        abandoned.add(request);
        while (abandoned.has(activationRequest)) {
          abandoned.delete(activationRequest);
          activationRequest -= 1;
        }
      },
    };
  };

  const include = (entry: OpenSpace, activeSpaceId: UUID): void => {
    const state = observable.getState();
    if (state.entries.some(({ id }) => id === entry.id)) {
      if (state.activeSpaceId === activeSpaceId) return;
      observable.publish({ activeSpaceId, entries: state.entries });
      followActiveSpace();
      return;
    }
    observable.publish({ activeSpaceId, entries: [...state.entries, entry] });
    followActiveSpace();
  };

  const buildLoaded = ({ loaded }: ValidatedLoadedSpace, selection?: LayoutId): OpenSpace => {
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
      spaceCards,
    };
    session.subscribe(() => {
      const state = observable.getState();
      if (!state.entries.some((entry) => entry.session === session)) return;
      observable.publish({ ...state, entries: [...state.entries] });
    });
    if (reused || loaded.initialization !== 'created-layout') return opened;
    return { ...opened, initialization: 'created-layout' };
  };

  const composeValidated = async (
    validated: ValidatedLoadedSpace,
    selection?: LayoutId,
  ): Promise<OpenSpace> => {
    const { loaded } = validated;
    const spaceId = loaded.snapshot.id;
    await closing.get(spaceId);
    const existing = compositions.get(spaceId);
    if (existing !== undefined) return existing;
    const opening = Promise.resolve().then(() => buildLoaded(validated, selection));
    compositions.set(spaceId, opening);
    void opening.catch(() => compositions.delete(spaceId));
    return opening;
  };

  const compose = async (spaceId: UUID, selection?: LayoutId): Promise<OpenSpace> => {
    await closing.get(spaceId);
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
    if (retired.has(target)) {
      // The close is the newer choice and has already taken this Space off the
      // canvas, so there is nothing to reinstate — and nothing to answer with
      // either, since the composition it names can no longer commit.
      throw new Error(`Space ${target.id} was closed while it was being activated`);
    }
    if (request !== activationRequest) {
      include(target, observable.getState().activeSpaceId ?? target.id);
      return target;
    }
    include(target, target.id);
    return target;
  };

  const open = async (spaceId: UUID, selection?: LayoutId): Promise<OpenSpace> => {
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

  const embed = async (spaceId: UUID): Promise<OpenSpace> => {
    const target = await compose(spaceId);
    include(target, observable.getState().activeSpaceId ?? target.id);
    return target;
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
    const validated = validateLoadedSpace(resolution.loaded);
    const destination = destinationOpening(validated.space, resolution.destination);
    const opened = await activateAfterLeavingSettles(
      await composeValidated(validated, destination.selection),
      request,
    );
    // A Space already open keeps the selection it is being worked in, so the
    // URL's is only a proposal. Report the one that holds: a caller opening the
    // named Graph does so against the selected Layout, and the two disagreeing
    // is how a Graph lands on a Layout nobody named.
    const selection = opened.app.navigation.getState().selectedLayoutId;
    const opening: DestinationOpening =
      selection === destination.selection ? destination : { ...destination, selection };
    return { opened, opening };
  };

  const switchTo = async (spaceId: UUID): Promise<OpenSpace> => {
    const target = observable.getState().entries.find(({ id }) => id === spaceId);
    if (target === undefined) throw new Error(`Space ${spaceId} is not open`);
    const { request, abandon } = beginActivation();
    try {
      // `entries` still advertises a Space a close is waiting to retire, so
      // this entry is only the target while nothing is closing it. `compose`
      // waits that close out and answers whatever it leaves behind.
      const entry = closing.has(spaceId) ? await compose(spaceId) : target;
      return await activateAfterLeavingSettles(entry, request);
    } catch (error) {
      abandon();
      throw error;
    }
  };

  const retireOpenSpace = async (
    spaceId: UUID,
    target: OpenSpace,
    confirmation?: RejectedCloseConfirmation,
  ): Promise<CloseSpaceResult> => {
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
    // The composition goes with the session the registry has just stopped
    // owning. Each collaborator is released by name rather than relying on
    // `authoring.dispose` clearing the subscriber set the others registered in:
    // that is true today and is an ordering nothing here states or tests.
    target.app.edgeAuthoring.dispose();
    target.app.continuation.dispose();
    target.app.authoring.dispose();
    retired.add(target);
    compositions.delete(spaceId);
    observable.publish({ activeSpaceId, entries });
    followActiveSpace();
    return { kind: 'closed' };
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
    const closed = retireOpenSpace(spaceId, target, confirmation);
    // Recorded before the first wait, because the window an activation has to
    // see is the whole of it — and recorded as a settlement rather than an
    // outcome, since a close that threw has still stopped standing in the way.
    const settled = closed.catch(() => undefined);
    closing.set(spaceId, settled);
    try {
      return await closed;
    } finally {
      if (closing.get(spaceId) === settled) closing.delete(spaceId);
    }
  };

  return {
    metaSpaceId,
    getState: observable.getState,
    subscribe: observable.subscribe,
    entry: (spaceId) => observable.getState().entries.find(({ id }) => id === spaceId),
    open,
    embed,
    openPath,
    enter: open,
    switchTo,
    close,
    spaceCards,
    browserLocation,
  };
}

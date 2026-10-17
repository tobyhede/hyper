import type { GraphId, MapId, ResourceId, UUID } from '@project/core';
import { createObservableState, type ObserverErrorReporter } from '@project/persistence';
import { canRetreat, type Navigation } from './navigation';

/**
 * The presenting window and the Notes windows following it, joined over one
 * channel per Space (ADR 0129).
 *
 * The presenting window keeps sole ownership of Navigation. It publishes where
 * it is and applies the commands it receives through Navigation's own
 * operations, so a command from a Notes window is exactly a key press on the
 * Stage. A Notes window holds no Navigation: it renders what it is sent and
 * sends commands back.
 *
 * Messages carry identities, never content. A Notes window resolves content
 * from its own copy of the Space.
 */

/** One move from the presented Resource, by identity. */
export interface PresentedMove {
  readonly resourceId: ResourceId;
  readonly selected: boolean;
}

/** Where one presentation is, as the presenting window publishes it. */
export interface PresentationSnapshot {
  readonly presentationId: UUID;
  /**
   * When this presentation started, in milliseconds since the Unix epoch.
   *
   * Every window reads the same clock, so a Notes window can compare two
   * presentations' starts and time one against its own clock.
   */
  readonly startedAt: number;
  readonly spaceId: UUID;
  readonly mapId: MapId;
  readonly graphId: GraphId;
  readonly resourceId: ResourceId;
  readonly moves: readonly PresentedMove[];
  readonly canRetreat: boolean;
}

/** What a Notes window may ask of a presentation: what a key on the Stage does. */
export type PresentationCommand =
  | { readonly kind: 'advance' }
  | { readonly kind: 'retreat' }
  | { readonly kind: 'select-branch'; readonly delta: number };

/**
 * Everything the link sends. Versioned so a window running an older build
 * ignores what it cannot read rather than misreading it.
 */
export type PresentationMessage =
  | { readonly version: 1; readonly kind: 'presenting'; readonly snapshot: PresentationSnapshot }
  | { readonly version: 1; readonly kind: 'ended'; readonly presentationId: UUID }
  | { readonly version: 1; readonly kind: 'announce' }
  | {
      readonly version: 1;
      readonly kind: 'command';
      readonly presentationId: UUID;
      readonly command: PresentationCommand;
    };

/**
 * One window's end of a Space's presentation channel.
 *
 * A window never hears its own messages, which is how `BroadcastChannel`
 * behaves; the in-memory channel tests use behaves the same way.
 */
export interface PresentationChannel {
  readonly post: (message: PresentationMessage) => void;
  readonly subscribe: (listener: (message: PresentationMessage) => void) => () => void;
  /** Leave the channel. Nothing is heard and nothing can be posted after. */
  readonly close: () => void;
}

/**
 * What the link needs of the browser, injected from `main.tsx` with no default,
 * as `Fullscreen` is (ADR 0109).
 */
export interface PresentationLinks {
  /** Open this window's end of one Space's channel. */
  readonly open: (spaceId: UUID) => PresentationChannel;
  /** The time now, in milliseconds since the Unix epoch, as `Date.now` answers. */
  readonly now: () => number;
  /**
   * Call `listener` when this window is going away, before it goes. A window
   * closing runs no teardown of its own, so this is the presenting window's
   * last chance to say its presentation ended.
   */
  readonly leaving: (listener: () => void) => () => void;
  readonly presence: PresentationPresence;
}

/**
 * Whether a presentation's presenting window is still there, as the browser
 * knows it rather than as the window says.
 *
 * A presenting window that closes says its presentation ended, but one that
 * crashes says nothing. The browser lets go of what a window held however it
 * went, so the presenting window holds its presentation's presence and a Notes
 * window watches it.
 */
export interface PresentationPresence {
  /** Hold the presentation's presence until the returned function is called. */
  readonly hold: (presentationId: UUID) => () => void;
  /**
   * Call `gone` once no window holds the presentation's presence, until the
   * returned function is called.
   */
  readonly watch: (presentationId: UUID, gone: () => void) => () => void;
}

export interface PresentingLinkDependencies {
  readonly navigation: Navigation;
  readonly spaceId: () => UUID;
  readonly links: PresentationLinks;
  /** Mints each presentation's identity when presenting starts (ADR 0109). */
  readonly newId: () => UUID;
}

export interface PresentingLink {
  /** Publish and answer until the returned function is called. */
  readonly connect: () => () => void;
}

interface Presentation {
  readonly id: UUID;
  readonly startedAt: number;
  /** Lets go of the presentation's presence. */
  readonly release: () => void;
}

/**
 * The presenting window's side of the link.
 *
 * Presenting starting mints a presentation; every Navigation change while it
 * lasts publishes a snapshot; leaving presenting publishes that it ended. A
 * Notes window announcing itself is answered with the current snapshot, and a
 * command naming this window's presentation is applied through Navigation.
 * Anything else is ignored: a command for another window's presentation, or
 * one arriving while this window is not presenting.
 */
export function presentingLink({
  navigation,
  spaceId,
  links,
  newId,
}: PresentingLinkDependencies): PresentingLink {
  let current: Presentation | null = null;
  let channel: PresentationChannel | null = null;

  const snapshot = (presentation: Presentation): PresentationSnapshot | null => {
    const state = navigation.getState();
    const resourceId = navigation.activeResourceId();
    if (state.activeGraphId === null || resourceId === null) return null;
    return {
      presentationId: presentation.id,
      startedAt: presentation.startedAt,
      spaceId: spaceId(),
      mapId: state.selectedMapId,
      graphId: state.activeGraphId,
      resourceId,
      moves: navigation
        .moves()
        .map(({ resourceId: to, selected }) => ({ resourceId: to, selected })),
      canRetreat: canRetreat(state),
    };
  };

  const publish = (presentation: Presentation): void => {
    const published = snapshot(presentation);
    if (published !== null) channel?.post({ version: 1, kind: 'presenting', snapshot: published });
  };

  const end = (): void => {
    if (current === null) return;
    // Forgotten before it is announced: a Notes window hearing the end asks
    // again at once, and this window must not answer for a presentation it
    // has just ended.
    const ended = current.id;
    current.release();
    current = null;
    channel?.post({ version: 1, kind: 'ended', presentationId: ended });
  };

  const onNavigation = (): void => {
    if (navigation.getState().mode !== 'presenting') {
      end();
      return;
    }
    if (current === null) {
      // Held before the first snapshot is posted, so a Notes window that
      // hears it always finds the presence held.
      const id = newId();
      current = { id, startedAt: links.now(), release: links.presence.hold(id) };
    }
    publish(current);
  };

  const apply = (command: PresentationCommand): void => {
    switch (command.kind) {
      case 'advance':
        navigation.advance();
        return;
      case 'retreat':
        navigation.retreat();
        return;
      case 'select-branch':
        navigation.selectBranch(command.delta);
        return;
    }
  };

  const onMessage = (message: PresentationMessage): void => {
    if (current === null) return;
    if (message.kind === 'announce') publish(current);
    else if (message.kind === 'command' && message.presentationId === current.id)
      apply(message.command);
  };

  return {
    connect: () => {
      const opened = links.open(spaceId());
      channel = opened;
      const stopNavigation = navigation.subscribe(onNavigation);
      const stopChannel = opened.subscribe(onMessage);
      const stopLeaving = links.leaving(end);
      // A presentation opened from its product URL is presenting before the
      // link connects, and is published at once.
      onNavigation();
      return () => {
        stopNavigation();
        stopChannel();
        stopLeaving();
        end();
        opened.close();
        channel = null;
      };
    },
  };
}

/** What a Notes window is following. */
export type FollowedPresentation =
  | { readonly kind: 'not-presenting' }
  | { readonly kind: 'presenting'; readonly snapshot: PresentationSnapshot };

export interface PresentationFollower {
  readonly getState: () => FollowedPresentation;
  readonly subscribe: (listener: () => void) => () => void;
  readonly advance: () => void;
  readonly retreat: () => void;
  readonly selectBranch: (delta: number) => void;
  /** Announce this window and follow until the returned function is called. */
  readonly connect: () => () => void;
}

const NOT_PRESENTING: FollowedPresentation = { kind: 'not-presenting' };

/**
 * A Notes window's side of the link.
 *
 * It follows one presentation: the latest-started of those it hears. Snapshots
 * of any other are ignored, and its commands name the one it follows, so with
 * two windows presenting the same Space it drives only one. When that one
 * ends, by saying so or by its window going without a word, it announces
 * itself again, and binds to whichever presentation answers.
 */
export function followPresentation(
  channel: PresentationChannel,
  presence: PresentationPresence,
  reportObserverError: ObserverErrorReporter,
): PresentationFollower {
  const observable = createObservableState(NOT_PRESENTING, reportObserverError);
  let watched: { readonly presentationId: UUID; readonly stop: () => void } | null = null;

  const unwatch = (): void => {
    watched?.stop();
    watched = null;
  };

  const ended = (presentationId: UUID): void => {
    const state = observable.getState();
    if (state.kind !== 'presenting' || state.snapshot.presentationId !== presentationId) return;
    unwatch();
    observable.publish(NOT_PRESENTING);
    channel.post({ version: 1, kind: 'announce' });
  };

  const follow = (snapshot: PresentationSnapshot): void => {
    observable.publish({ kind: 'presenting', snapshot });
    if (watched?.presentationId === snapshot.presentationId) return;
    unwatch();
    const { presentationId } = snapshot;
    const stop = presence.watch(presentationId, () => ended(presentationId));
    // A presence already gone ended the presentation, and unwatched, inside `watch`.
    if (observable.getState().kind === 'presenting') watched = { presentationId, stop };
  };

  const command = (sent: PresentationCommand): void => {
    const state = observable.getState();
    if (state.kind !== 'presenting') return;
    channel.post({
      version: 1,
      kind: 'command',
      presentationId: state.snapshot.presentationId,
      command: sent,
    });
  };

  const onMessage = (message: PresentationMessage): void => {
    const state = observable.getState();
    if (message.kind === 'presenting') {
      const { snapshot } = message;
      const follows =
        state.kind === 'not-presenting' ||
        snapshot.presentationId === state.snapshot.presentationId ||
        snapshot.startedAt > state.snapshot.startedAt;
      if (follows) follow(snapshot);
      return;
    }
    if (message.kind === 'ended') ended(message.presentationId);
  };

  return {
    getState: observable.getState,
    subscribe: observable.subscribe,
    advance: () => command({ kind: 'advance' }),
    retreat: () => command({ kind: 'retreat' }),
    selectBranch: (delta) => command({ kind: 'select-branch', delta }),
    // What a window heard before it last disconnected may have ended since, so
    // connecting starts from "not presenting" and asks afresh.
    connect: () => {
      unwatch();
      if (observable.getState().kind !== 'not-presenting') observable.publish(NOT_PRESENTING);
      const stop = channel.subscribe(onMessage);
      channel.post({ version: 1, kind: 'announce' });
      return () => {
        stop();
        unwatch();
      };
    },
  };
}

import { uuidSchema, type UUID } from '@project/core';
import type {
  PresentationChannel,
  PresentationLinks,
  PresentationPresence,
  PresentationCommand,
  PresentationMessage,
  PresentationSnapshot,
  PresentedMove,
} from './presentation-link';

/** The part of `BroadcastChannel` the adapter uses. `BroadcastChannel` satisfies it. */
export interface NativeBroadcastChannel {
  postMessage(message: PresentationMessage): void;
  addEventListener(type: 'message', listener: (event: Pick<MessageEvent, 'data'>) => void): void;
  removeEventListener(type: 'message', listener: (event: Pick<MessageEvent, 'data'>) => void): void;
  close(): void;
}

/** The part of `window` the links read. `window` satisfies it. */
export interface NativePresentationWindow {
  addEventListener(type: 'pagehide', listener: () => void): void;
  removeEventListener(type: 'pagehide', listener: () => void): void;
}

/** What `main.tsx` hands the links: the browser's channel constructor, window and clock. */
export interface NativePresentationBrowser {
  readonly openChannel: (name: string) => NativeBroadcastChannel;
  readonly window: NativePresentationWindow;
  readonly now: () => number;
  /** `navigator.locks`, which a browser without Web Locks lacks. */
  readonly locks: NativeLocks | undefined;
}

const isId = (value: unknown): value is UUID => uuidSchema.safeParse(value).success;

const isDelta = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isFlag = (value: unknown): value is boolean => typeof value === 'boolean';

const isCommand = (value: unknown): value is PresentationCommand =>
  typeof value === 'object' &&
  value !== null &&
  'kind' in value &&
  (value.kind === 'advance' ||
    value.kind === 'retreat' ||
    (value.kind === 'select-branch' && 'delta' in value && isDelta(value.delta)));

const isMove = (value: unknown): value is PresentedMove =>
  typeof value === 'object' &&
  value !== null &&
  'resourceId' in value &&
  isId(value.resourceId) &&
  'selected' in value &&
  isFlag(value.selected);

const isSnapshot = (value: unknown): value is PresentationSnapshot =>
  typeof value === 'object' &&
  value !== null &&
  'presentationId' in value &&
  isId(value.presentationId) &&
  'startedAt' in value &&
  isTime(value.startedAt) &&
  'spaceId' in value &&
  isId(value.spaceId) &&
  'mapId' in value &&
  isId(value.mapId) &&
  'graphId' in value &&
  isId(value.graphId) &&
  'resourceId' in value &&
  isId(value.resourceId) &&
  'moves' in value &&
  Array.isArray(value.moves) &&
  value.moves.every(isMove) &&
  'canRetreat' in value &&
  isFlag(value.canRetreat);

/**
 * A message heard on the channel is external input: another window, perhaps
 * running another build, wrote it. A message this build cannot read is
 * dropped rather than misread.
 */
const isPresentationMessage = (value: unknown): value is PresentationMessage => {
  if (typeof value !== 'object' || value === null) return false;
  if (!('version' in value) || value.version !== 1 || !('kind' in value)) return false;
  switch (value.kind) {
    case 'presenting':
      return 'snapshot' in value && isSnapshot(value.snapshot);
    case 'ended':
      return 'presentationId' in value && isId(value.presentationId);
    case 'announce':
      return true;
    case 'command':
      return (
        'presentationId' in value &&
        isId(value.presentationId) &&
        'command' in value &&
        isCommand(value.command)
      );
    default:
      return false;
  }
};

/** The name of the channel every window on one Space's presentation shares. */
export const presentationChannelName = (spaceId: UUID): string => `hyper-presentation:${spaceId}`;

/**
 * The one adapter over the browser's `BroadcastChannel` for the presentation
 * link (ADR 0129).
 *
 * `BroadcastChannel` never delivers a window's own messages back to it, which
 * is the behaviour {@link PresentationChannel} promises.
 */
export function createBrowserPresentationChannel(
  native: NativeBroadcastChannel,
): PresentationChannel {
  return {
    post: (message) => native.postMessage(message),
    subscribe: (listener) => {
      const heard = (event: Pick<MessageEvent, 'data'>): void => {
        const message: unknown = event.data;
        if (isPresentationMessage(message)) listener(message);
      };
      native.addEventListener('message', heard);
      return () => native.removeEventListener('message', heard);
    },
    close: () => native.close(),
  };
}

/**
 * The presentation link's browser, as `main.tsx` names it: one
 * `BroadcastChannel` per Space, `pagehide` for a window going away, the wall
 * clock every window shares, and Web Locks for a window that goes without a
 * word.
 */
export function createBrowserPresentationLinks({
  openChannel,
  window,
  now,
  locks,
}: NativePresentationBrowser): PresentationLinks {
  return {
    open: (spaceId) =>
      createBrowserPresentationChannel(openChannel(presentationChannelName(spaceId))),
    now,
    leaving: (listener) => {
      window.addEventListener('pagehide', listener);
      return () => window.removeEventListener('pagehide', listener);
    },
    presence: createBrowserPresentationPresence(locks),
  };
}

/** The part of the Web Locks API the adapter uses. `navigator.locks` satisfies it. */
export interface NativeLocks {
  request(
    name: string,
    options: { readonly signal?: AbortSignal },
    callback: () => Promise<undefined> | undefined,
  ): Promise<void>;
}

/** The name of the lock a presenting window holds for one presentation. */
export const presentationPresenceName = (presentationId: UUID): string =>
  `hyper-presenting:${presentationId}`;

/** Presence where the browser offers none to watch: never gone. */
const steadyPresence: PresentationPresence = {
  hold: () => () => undefined,
  watch: () => () => undefined,
};

/**
 * The one adapter over the browser's Web Locks for presentation presence (ADR
 * 0129).
 *
 * The presenting window holds an exclusive lock named for its presentation
 * until the presentation ends. A Notes window asks for the same lock: the
 * browser grants it only once no window holds it, which is the moment the
 * presentation is gone, and the Notes window lets go at once. The browser
 * releases a window's locks however the window goes, so a crashed presenting
 * window is noticed as surely as a closed one. Where the browser has no Web
 * Locks, nothing is ever gone and a closed window's `ended` is all there is.
 */
export function createBrowserPresentationPresence(
  locks: NativeLocks | undefined,
): PresentationPresence {
  if (locks === undefined) return steadyPresence;
  return {
    hold: (presentationId) => {
      const held = Promise.withResolvers<undefined>();
      void locks.request(presentationPresenceName(presentationId), {}, () => held.promise);
      return () => held.resolve(undefined);
    },
    watch: (presentationId, gone) => {
      const stopped = new AbortController();
      locks
        .request(presentationPresenceName(presentationId), { signal: stopped.signal }, () => {
          if (!stopped.signal.aborted) gone();
          return undefined;
        })
        // Stopping before the lock is granted rejects the request; nothing is gone.
        .catch(() => undefined);
      return () => stopped.abort();
    },
  };
}

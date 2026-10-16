import { uuidSchema, type UUID } from '@project/core';
import type {
  PresentationChannel,
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
  };
}

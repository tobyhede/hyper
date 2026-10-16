import { describe, expect, it } from 'vitest';
import { uuidSchema, type UUID } from '@project/core';
import {
  createBrowserPresentationChannel,
  presentationChannelName,
  type NativeBroadcastChannel,
} from '../src/browser-presentation-channel';
import type { PresentationMessage } from '../src/presentation-link';

const uuid = (n: number): UUID =>
  uuidSchema.parse(`00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`);

/** Whatever another window might put on the channel. */
type Sent =
  | null
  | boolean
  | number
  | string
  | readonly Sent[]
  | { readonly [key: string]: Sent | undefined }
  | PresentationMessage;

/** A native channel whose deliveries the test makes, with any `data` another window might send. */
function nativeChannel() {
  const listeners = new Set<(event: Pick<MessageEvent, 'data'>) => void>();
  const posted: PresentationMessage[] = [];
  const native: NativeBroadcastChannel = {
    postMessage: (message) => posted.push(message),
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  const deliver = (data: Sent): void => {
    for (const listener of listeners) listener({ data });
  };
  return { native, posted, deliver };
}

const presenting: PresentationMessage = {
  version: 1,
  kind: 'presenting',
  snapshot: {
    presentationId: uuid(1),
    startedAt: 1_000,
    spaceId: uuid(2),
    mapId: uuid(3),
    graphId: uuid(4),
    resourceId: uuid(5),
    moves: [{ resourceId: uuid(6), selected: true }],
    canRetreat: false,
  },
};

describe('the browser presentation channel', () => {
  it('posts what the link sends', () => {
    const { native, posted } = nativeChannel();
    createBrowserPresentationChannel(native).post({ version: 1, kind: 'announce' });
    expect(posted).toEqual([{ version: 1, kind: 'announce' }]);
  });

  it.each<PresentationMessage>([
    presenting,
    { version: 1, kind: 'ended', presentationId: uuid(1) },
    { version: 1, kind: 'announce' },
    { version: 1, kind: 'command', presentationId: uuid(1), command: { kind: 'advance' } },
    { version: 1, kind: 'command', presentationId: uuid(1), command: { kind: 'retreat' } },
    {
      version: 1,
      kind: 'command',
      presentationId: uuid(1),
      command: { kind: 'select-branch', delta: -1 },
    },
  ])('hears a message this build can read: $kind', (message) => {
    const { native, deliver } = nativeChannel();
    const heard: PresentationMessage[] = [];
    createBrowserPresentationChannel(native).subscribe((received) => heard.push(received));

    deliver(structuredClone(message));

    expect(heard).toEqual([message]);
  });

  it.each<[string, Sent]>([
    ['nothing', null],
    ['a string', 'announce'],
    ['another version', { version: 2, kind: 'announce' }],
    ['an unknown kind', { version: 1, kind: 'reload' }],
    ['an ended with no presentation', { version: 1, kind: 'ended' }],
    ['an id that is no UUID', { version: 1, kind: 'ended', presentationId: 'one' }],
    [
      'an unknown command',
      { version: 1, kind: 'command', presentationId: uuid(1), command: { kind: 'jump' } },
    ],
    [
      'a branch step that is no whole number',
      {
        version: 1,
        kind: 'command',
        presentationId: uuid(1),
        command: { kind: 'select-branch', delta: 0.5 },
      },
    ],
    [
      'a snapshot missing its moves',
      { ...presenting, snapshot: { ...presenting.snapshot, moves: undefined } },
    ],
    [
      'a snapshot with a malformed move',
      { ...presenting, snapshot: { ...presenting.snapshot, moves: [{ resourceId: uuid(6) }] } },
    ],
  ])('drops %s', (_name, data) => {
    const { native, deliver } = nativeChannel();
    const heard: PresentationMessage[] = [];
    createBrowserPresentationChannel(native).subscribe((received) => heard.push(received));

    deliver(data);

    expect(heard).toEqual([]);
  });

  it('stops hearing once unsubscribed', () => {
    const { native, deliver } = nativeChannel();
    const heard: PresentationMessage[] = [];
    const stop = createBrowserPresentationChannel(native).subscribe((received) =>
      heard.push(received),
    );

    stop();
    deliver({ version: 1, kind: 'announce' });

    expect(heard).toEqual([]);
  });

  it('names one channel per Space', () => {
    expect(presentationChannelName(uuid(2))).not.toBe(presentationChannelName(uuid(3)));
  });
});

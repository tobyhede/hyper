import { describe, expect, it } from 'vitest';
import { uuidSchema, type UUID } from '@project/core';
import {
  createBrowserPresentationChannel,
  createBrowserPresentationPresence,
  presentationChannelName,
  type NativeBroadcastChannel,
  type NativeLocks,
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
    close: () => listeners.clear(),
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

/**
 * Exclusive locks granted as the Web Locks API grants them: in request order,
 * one holder at a time, held until the holder's callback settles, and a
 * request aborted before it is granted rejected and never granted.
 */
function nativeLocks() {
  const queues = new Map<string, { run: () => void; signal: AbortSignal | undefined }[]>();
  const busy = new Set<string>();
  const next = (name: string): void => {
    const queue = queues.get(name) ?? [];
    const waiting = queue.shift();
    if (waiting === undefined) {
      busy.delete(name);
      return;
    }
    busy.add(name);
    waiting.run();
  };
  const locks: NativeLocks = {
    request: (name, { signal }, callback) =>
      new Promise((resolve, reject) => {
        const run = (): void => {
          void Promise.resolve(callback()).then(() => {
            resolve(undefined);
            next(name);
          });
        };
        const queue = queues.get(name) ?? [];
        queues.set(name, queue);
        const entry = { run, signal };
        signal?.addEventListener('abort', () => {
          const at = queue.indexOf(entry);
          if (at === -1) return;
          queue.splice(at, 1);
          reject(new DOMException('Aborted', 'AbortError'));
        });
        queue.push(entry);
        if (!busy.has(name)) next(name);
      }),
  };
  return locks;
}

/** Let granted locks run and released ones pass on. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the browser presentation presence', () => {
  it('finds a presentation gone once its presenting window lets go', async () => {
    const locks = nativeLocks();
    const presenting = createBrowserPresentationPresence(locks);
    const notes = createBrowserPresentationPresence(locks);
    const release = presenting.hold(uuid(1));
    let gone = false;
    notes.watch(uuid(1), () => (gone = true));
    await settled();
    expect(gone).toBe(false);

    release();
    await settled();

    expect(gone).toBe(true);
  });

  it('finds nothing gone once the Notes window stops watching', async () => {
    const locks = nativeLocks();
    const release = createBrowserPresentationPresence(locks).hold(uuid(1));
    let gone = false;
    const stop = createBrowserPresentationPresence(locks).watch(uuid(1), () => (gone = true));
    await settled();

    stop();
    release();
    await settled();

    expect(gone).toBe(false);
  });

  it('watches each presentation apart', async () => {
    const locks = nativeLocks();
    const presenting = createBrowserPresentationPresence(locks);
    const release = presenting.hold(uuid(1));
    presenting.hold(uuid(2));
    const gone: UUID[] = [];
    const notes = createBrowserPresentationPresence(locks);
    notes.watch(uuid(1), () => gone.push(uuid(1)));
    notes.watch(uuid(2), () => gone.push(uuid(2)));

    release();
    await settled();

    expect(gone).toEqual([uuid(1)]);
  });

  it('never finds a presentation gone where the browser has no Web Locks', async () => {
    const presence = createBrowserPresentationPresence(undefined);
    presence.hold(uuid(1))();
    let gone = false;
    presence.watch(uuid(1), () => (gone = true));
    await settled();
    expect(gone).toBe(false);
  });
});

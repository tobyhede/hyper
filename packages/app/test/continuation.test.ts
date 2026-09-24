import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { composeApp } from '../src/compose-app';
import { chromeControlStaysOwed, staysOwed, type PendingContinuation } from '../src/continuation';

/**
 * Where an Edit continues, as transitions rather than as a tree.
 *
 * Every rule this module holds is asserted here, in the node environment: what
 * a second request does to an unspent one, what `take` leaves behind, the two
 * facts that discard a continuation, and which unresolvable targets stay owed.
 * The two React adapters own one claim each — that they call `.focus()` on the
 * element their kind resolves to — and nothing else.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const RESOURCE_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');

const EDGE = { from: RESOURCE_A, to: RESOURCE_B } as const;

const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    maps: [
      {
        id: MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [RESOURCE_A]: { x: 10, y: 20, open: false },
          [RESOURCE_B]: { x: 300, y: 40, open: false },
        },
        graphs: [{ id: GRAPH_ID, title: 'Main', edges: [EDGE] }],
      },
    ],
    defaultMap: MAP_ID,
  },
  resources: [
    { id: RESOURCE_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: RESOURCE_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
  ],
};

function open(stored: SpaceSnapshot = snapshot, revision = 0n) {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const backend = MemorySpaceBackend.asMeta({ snapshot: stored, revision, exportedRevision: null });
  const session = openSpaceSession(backend, loaded);
  const { authoring, navigation, continuation } = composeApp({
    spaceSession: session,
    selection: MAP_ID,
  });
  return { session, authoring, navigation, continuation };
}

const NAME_A: PendingContinuation = {
  target: { kind: 'resource', resourceId: RESOURCE_A },
  select: true,
  then: 'rename',
};
const RENAME_MAP: PendingContinuation = {
  target: { kind: 'control', name: 'map-name' },
  select: false,
  then: 'rename',
};

describe('the one pending continuation', () => {
  it('holds what was requested, and nothing before a request', () => {
    const { continuation } = open();

    expect(continuation.getState().pending).toBeNull();

    continuation.request(NAME_A);

    expect(continuation.getState().pending).toEqual(NAME_A);
  });

  /**
   * A continuation says where the author should be *now*, so an unspent one is
   * stale the moment a second gesture finishes. Replaced silently: the module
   * publishes its pending state, so a test sees the supersession without a
   * report, and nothing here is a failure the author needs told about.
   */
  it('replaces an unspent continuation rather than queueing behind it', () => {
    const { continuation } = open();
    continuation.request(NAME_A);

    continuation.request(RENAME_MAP);

    expect(continuation.getState().pending).toEqual(RENAME_MAP);
  });

  it('yields a continuation once and leaves none behind', () => {
    const { continuation } = open();
    continuation.request(NAME_A);

    continuation.take();

    expect(continuation.getState().pending).toBeNull();
    // The second adapter on the same render finds nothing to spend, which is
    // the whole of what stops a continuation firing twice.
    continuation.take();
    expect(continuation.getState().pending).toBeNull();
  });

  it('publishes each change to its subscribers', () => {
    const { continuation } = open();
    const seen: (PendingContinuation | null)[] = [];
    continuation.subscribe(() => seen.push(continuation.getState().pending));

    continuation.request(NAME_A);
    continuation.take();

    expect(seen).toEqual([NAME_A, null]);
  });
});

/**
 * Two facts discard a continuation, and only two. Over-invalidating is how a
 * legitimate continuation is silently lost — a target in a Map no longer
 * drawn simply fails to resolve, which the wait policy answers on its own.
 */
describe('invalidation', () => {
  it('discards a pending continuation when a replacement takes the local work', async () => {
    const stored: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Stored' },
    };
    const { authoring, session, continuation } = open(stored, 1n);
    // Force the conflict the accept resolves.
    authoring.complete({ kind: 'deleted-edge', graphId: GRAPH_ID, edge: EDGE });
    await vi.waitFor(() => expect(session.getState().persistence.kind).toBe('conflicted'));
    continuation.request(NAME_A);

    expect(authoring.acceptStoredSpace()).toBeNull();

    expect(continuation.getState().pending).toBeNull();
  });

  it('discards a pending continuation when presenting begins', () => {
    const { navigation, continuation } = open();
    continuation.request(RENAME_MAP);

    navigation.present();

    expect(continuation.getState().pending).toBeNull();
  });

  it('keeps one across an ordinary Edit, a Map choice and an activated Graph', () => {
    const { authoring, navigation, continuation } = open();
    continuation.request(NAME_A);

    authoring.complete({ kind: 'renamed-map', mapId: MAP_ID, title: 'Renamed' });
    navigation.selectMap(MAP_ID);
    navigation.activateGraph(GRAPH_ID);

    expect(continuation.getState().pending).toEqual(NAME_A);
  });

  it('stops answering its collaborator once disposed', () => {
    const { navigation, continuation } = open();
    continuation.request(RENAME_MAP);

    continuation.dispose();
    navigation.present();

    expect(continuation.getState().pending).toEqual(RENAME_MAP);
  });
});

/**
 * What an adapter does when its target resolves to nothing.
 *
 * A canvas subject arrives with the projection carrying the Edit that produced
 * it, a strategy after the request; chrome is drawn already, so unresolvable
 * means gone and a fallback beats a wait with no end.
 */
describe('the wait policy', () => {
  it.each([
    ['a created or added Resource', { kind: 'resource', resourceId: RESOURCE_A } as const],
    ['a new Edge', { kind: 'edge', graphId: GRAPH_ID, edge: EDGE } as const],
  ])('keeps %s owed until it is drawn', (_name, target) => {
    expect(staysOwed({ target, select: false, then: 'focus' })).toBe(true);
  });

  it.each([['the canvas', { kind: 'canvas' } as const]])('falls through on %s', (_name, target) => {
    expect(staysOwed({ target, select: false, then: 'focus' })).toBe(false);
  });

  it.each([
    ['rename', 'rename' as const],
    ['focus', 'focus' as const],
  ])('keeps a chrome control owed while %s is waiting to land', (_name, then) => {
    expect(
      chromeControlStaysOwed({
        target: { kind: 'control', name: 'map-name' },
        select: false,
        then,
      }),
    ).toBe(true);
  });

  it('falls through on a chrome control whose action needs no press', () => {
    expect(
      chromeControlStaysOwed({
        target: { kind: 'control', name: 'map-name' },
        select: false,
        then: 'nothing',
      }),
    ).toBe(false);
  });

  /** A Resource waits whatever it was going to do there — Add to Map is a `focus`. */
  it.each(['nothing', 'focus', 'reveal', 'rename'] as const)(
    'keeps a Resource owed whose continuation is %s',
    (then) => {
      expect(
        staysOwed({ target: { kind: 'resource', resourceId: RESOURCE_A }, select: false, then }),
      ).toBe(true);
    },
  );
});

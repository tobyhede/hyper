import { describe, expect, it } from 'vitest';
import { uuidSchema, type ResourceId, type SpaceSnapshot, type UUID } from '@project/core';
import {
  MemorySpaceBackend,
  openSpaceSession,
  type ObserverErrorReporter,
} from '@project/persistence';
import { composeCore } from '../src/compose-app';
import { createPresentingWindow } from '../src/presenting-window';
import { refusingFullscreen } from './fullscreen';
import {
  followPresentation,
  type PresentationChannel,
  type PresentationFollower,
  type PresentationPresence,
} from '../src/presentation-link';
import { channelHub } from './presentation-channels';
import { mintingIds } from './minting';

const uuid = (n: number): UUID =>
  uuidSchema.parse(`00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`);

const SPACE_ID = uuid(1);
const MAP_ID = uuid(2);
const TALK = uuid(3);
const ENCORE = uuid(4);
const OPENING = uuid(10);
const LEFT = uuid(11);
const RIGHT = uuid(12);
const CLOSING = uuid(13);
const FIRST_PRESENTATION = uuid(100);
const SECOND_PRESENTATION = uuid(101);
const THIRD_PRESENTATION = uuid(102);

/** A talk that forks after its opening and rejoins at its close. */
const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    maps: [
      {
        id: MAP_ID,
        title: 'Map',
        kind: 'positioned',
        positions: {
          [OPENING]: { x: 0, y: 0, open: false },
          [LEFT]: { x: 300, y: -100, open: false },
          [RIGHT]: { x: 300, y: 100, open: false },
          [CLOSING]: { x: 600, y: 0, open: false },
        },
        graphs: [
          {
            id: TALK,
            title: 'Talk',
            edges: [
              { from: OPENING, to: LEFT },
              { from: OPENING, to: RIGHT },
              { from: LEFT, to: CLOSING },
              { from: RIGHT, to: CLOSING },
            ],
          },
          { id: ENCORE, title: 'Encore', edges: [{ from: CLOSING, to: OPENING }] },
        ],
      },
    ],
    defaultMap: MAP_ID,
  },
  resources: [OPENING, LEFT, RIGHT, CLOSING].map((id, index) => ({
    id,
    document: { title: `Slide ${index}`, kind: 'markdown', content: { source: '' } },
  })),
};

/**
 * Presence held and watched as Web Locks hold and watch it: a presentation is
 * gone once no window holds it, and a window that vanishes, as a crashed tab
 * does, lets go of everything it held without running any of its own code.
 */
function presenceHub() {
  const held = new Map<UUID, Set<number>>();
  const watching = new Map<UUID, Set<() => void>>();
  let windows = 0;
  const letGo = (presentationId: UUID, owner: number): void => {
    const holders = held.get(presentationId);
    holders?.delete(owner);
    if (holders !== undefined && holders.size > 0) return;
    held.delete(presentationId);
    const gone = [...(watching.get(presentationId) ?? [])];
    watching.delete(presentationId);
    for (const notify of gone) notify();
  };
  return {
    join: (): PresentationPresence & { readonly vanish: () => void } => {
      const owner = windows++;
      return {
        hold: (presentationId) => {
          held.set(presentationId, (held.get(presentationId) ?? new Set()).add(owner));
          return () => letGo(presentationId, owner);
        },
        watch: (presentationId, gone) => {
          if (!held.has(presentationId)) {
            gone();
            return () => undefined;
          }
          const watchers = watching.get(presentationId) ?? new Set();
          watching.set(presentationId, watchers.add(gone));
          return () => watchers.delete(gone);
        },
        vanish: () => {
          for (const [presentationId, holders] of [...held])
            if (holders.has(owner)) letGo(presentationId, owner);
        },
      };
    },
  };
}

/** Presence for a test whose windows never go without saying so: never gone. */
const steadyPresence = (): PresentationPresence => ({
  hold: () => () => undefined,
  watch: () => () => undefined,
});

const throwObserverError: ObserverErrorReporter = (error) => {
  throw error;
};

/** A window presenting the Space, with its own composition and Navigation. */
function presentingWindow(
  channel: PresentationChannel,
  newId: () => UUID,
  now: () => number = () => 0,
  presence: PresentationPresence = steadyPresence(),
) {
  const leaving = new Set<() => void>();
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const { navigation, currentSpace } = composeCore({
    spaceSession: openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded),
  });
  const presenting = createPresentingWindow({
    navigation,
    newId,
    now,
    fullscreen: refusingFullscreen,
    openNotes: () => undefined,
    link: {
      spaceId: () => currentSpace().id,
      links: {
        open: () => channel,
        now,
        leaving: (listener) => {
          leaving.add(listener);
          return () => leaving.delete(listener);
        },
        presence,
      },
    },
    reportObserverError: throwObserverError,
  });
  const disconnect = presenting.connect();
  /** The page going away, which runs no teardown of its own. */
  const leave = (): void => {
    for (const listener of [...leaving]) listener();
  };
  return { navigation, disconnect, leave };
}

function notesWindow(
  channel: PresentationChannel,
  presence: PresentationPresence = steadyPresence(),
) {
  const follower = followPresentation(channel, presence, throwObserverError);
  const disconnect = follower.connect();
  return { follower, disconnect };
}

/** The Resource a Notes window shows as presented, or null when it shows "not presenting". */
const shown = (follower: PresentationFollower): ResourceId | null => {
  const state = follower.getState();
  return state.kind === 'presenting' ? state.snapshot.resourceId : null;
};

describe('the presentation link', () => {
  it('shows a move made on the Stage in the Notes window', () => {
    const join = channelHub();
    const stage = presentingWindow(join(), mintingIds(FIRST_PRESENTATION));
    const { follower } = notesWindow(join());

    stage.navigation.present();
    expect(shown(follower)).toBe(OPENING);

    stage.navigation.advance();
    expect(shown(follower)).toBe(LEFT);
  });

  it('moves the Stage from the Notes window exactly as its keys would', () => {
    const join = channelHub();
    const stage = presentingWindow(join(), mintingIds(FIRST_PRESENTATION));
    const { follower } = notesWindow(join());
    stage.navigation.present();

    follower.selectBranch(1);
    follower.advance();
    expect(stage.navigation.activeResourceId()).toBe(RIGHT);
    expect(shown(follower)).toBe(RIGHT);

    follower.retreat();
    expect(stage.navigation.activeResourceId()).toBe(OPENING);
    expect(shown(follower)).toBe(OPENING);
  });

  it('shows the moves from the presented Resource, and whether there is one to go back to', () => {
    const join = channelHub();
    const stage = presentingWindow(join(), mintingIds(FIRST_PRESENTATION));
    const { follower } = notesWindow(join());
    stage.navigation.present();
    follower.selectBranch(1);

    const state = follower.getState();
    expect(state.kind === 'presenting' && state.snapshot.moves).toEqual([
      { resourceId: LEFT, selected: false },
      { resourceId: RIGHT, selected: true },
    ]);
    expect(state.kind === 'presenting' && state.snapshot.canRetreat).toBe(false);
  });

  it('brings a Notes window opened mid-presentation to the current position', () => {
    const join = channelHub();
    const stage = presentingWindow(join(), mintingIds(FIRST_PRESENTATION));
    stage.navigation.present();
    stage.navigation.advance();

    const { follower } = notesWindow(join());

    expect(shown(follower)).toBe(LEFT);
  });

  it('carries when the presentation started, for the Notes window’s timer', () => {
    const join = channelHub();
    const stage = presentingWindow(join(), mintingIds(FIRST_PRESENTATION), () => 5_000);
    const { follower } = notesWindow(join());

    stage.navigation.present();

    const state = follower.getState();
    expect(state.kind === 'presenting' && state.snapshot.startedAt).toBe(5_000);
  });

  it('keeps one presentation across a reopening of the same Map and Graph', () => {
    const join = channelHub();
    let time = 1_000;
    const stage = presentingWindow(join(), mintingIds(FIRST_PRESENTATION), () => time);
    const { follower } = notesWindow(join());
    stage.navigation.present();
    stage.navigation.advance();

    time = 2_000;
    stage.navigation.openPresentation(MAP_ID, TALK, OPENING);

    const state = follower.getState();
    expect(state.kind === 'presenting' && state.snapshot.resourceId).toBe(OPENING);
    expect(state.kind === 'presenting' && state.snapshot.presentationId).toBe(FIRST_PRESENTATION);
    expect(state.kind === 'presenting' && state.snapshot.startedAt).toBe(1_000);
  });

  it('starts a new presentation when a reopening changes Graph', () => {
    const join = channelHub();
    let time = 1_000;
    const stage = presentingWindow(
      join(),
      mintingIds(FIRST_PRESENTATION, SECOND_PRESENTATION),
      () => time,
    );
    const { follower } = notesWindow(join());
    stage.navigation.present();

    time = 2_000;
    stage.navigation.openPresentation(MAP_ID, ENCORE, CLOSING);

    const state = follower.getState();
    expect(state.kind === 'presenting' && state.snapshot.graphId).toBe(ENCORE);
    expect(state.kind === 'presenting' && state.snapshot.presentationId).toBe(SECOND_PRESENTATION);
    expect(state.kind === 'presenting' && state.snapshot.startedAt).toBe(2_000);
  });

  it('starts a new presentation after leaving presenting and presenting again', () => {
    const join = channelHub();
    let time = 1_000;
    const stage = presentingWindow(
      join(),
      mintingIds(FIRST_PRESENTATION, SECOND_PRESENTATION),
      () => time,
    );
    const { follower } = notesWindow(join());
    stage.navigation.present();
    stage.navigation.exitPresenting();

    time = 2_000;
    stage.navigation.present();

    const state = follower.getState();
    expect(state.kind === 'presenting' && state.snapshot.presentationId).toBe(SECOND_PRESENTATION);
    expect(state.kind === 'presenting' && state.snapshot.startedAt).toBe(2_000);
  });

  it('follows one of two presenting windows and drives only that one', () => {
    const join = channelHub();
    const first = presentingWindow(join(), mintingIds(FIRST_PRESENTATION), () => 1_000);
    const second = presentingWindow(join(), mintingIds(SECOND_PRESENTATION), () => 2_000);
    first.navigation.present();
    second.navigation.present();
    const { follower } = notesWindow(join());

    follower.advance();

    expect(second.navigation.activeResourceId()).toBe(LEFT);
    expect(first.navigation.activeResourceId()).toBe(OPENING);
    expect(shown(follower)).toBe(LEFT);

    first.navigation.advance();
    expect(shown(follower)).toBe(LEFT);
    expect(second.navigation.activeResourceId()).toBe(LEFT);
  });

  it('shows "not presenting" when presenting ends, and reattaches when it starts again', () => {
    const join = channelHub();
    const stage = presentingWindow(join(), mintingIds(FIRST_PRESENTATION, SECOND_PRESENTATION));
    const { follower } = notesWindow(join());
    stage.navigation.present();
    stage.navigation.advance();

    stage.navigation.exitPresenting();
    expect(shown(follower)).toBeNull();

    stage.navigation.present();
    expect(shown(follower)).toBe(OPENING);
  });

  it('moves on to the other presenting window when the one it follows ends', () => {
    const join = channelHub();
    const first = presentingWindow(join(), mintingIds(FIRST_PRESENTATION), () => 1_000);
    const second = presentingWindow(join(), mintingIds(SECOND_PRESENTATION), () => 2_000);
    first.navigation.present();
    first.navigation.advance();
    second.navigation.present();
    const { follower } = notesWindow(join());

    second.navigation.exitPresenting();

    expect(shown(follower)).toBe(LEFT);
    follower.advance();
    expect(first.navigation.activeResourceId()).toBe(CLOSING);
  });

  it('shows "not presenting" when the presenting window closes', () => {
    const join = channelHub();
    const stage = presentingWindow(join(), mintingIds(FIRST_PRESENTATION));
    const { follower } = notesWindow(join());
    stage.navigation.present();

    stage.disconnect();

    expect(shown(follower)).toBeNull();
  });

  it('shows "not presenting" when the presenting window vanishes without a word', () => {
    const join = channelHub();
    const presence = presenceHub();
    const stagePresence = presence.join();
    // A crashed window neither speaks nor answers.
    const stageChannel = join();
    let crashed = false;
    const stage = presentingWindow(
      {
        post: (message) => {
          if (!crashed) stageChannel.post(message);
        },
        subscribe: stageChannel.subscribe,
        close: stageChannel.close,
      },
      mintingIds(FIRST_PRESENTATION),
      () => 0,
      stagePresence,
    );
    const { follower } = notesWindow(join(), presence.join());
    stage.navigation.present();
    expect(shown(follower)).toBe(OPENING);

    crashed = true;
    stagePresence.vanish();

    expect(shown(follower)).toBeNull();
  });

  it('forgets a presentation that ended while the Notes window was disconnected', () => {
    const join = channelHub();
    const stage = presentingWindow(join(), mintingIds(FIRST_PRESENTATION));
    const notes = join();
    const follower = followPresentation(notes, steadyPresence(), throwObserverError);
    const disconnect = follower.connect();
    stage.navigation.present();

    disconnect();
    stage.navigation.exitPresenting();
    follower.connect();

    expect(shown(follower)).toBeNull();
  });

  it('shows "not presenting" when the presenting page goes away without leaving presenting', () => {
    const join = channelHub();
    const stage = presentingWindow(join(), mintingIds(FIRST_PRESENTATION));
    const { follower } = notesWindow(join());
    stage.navigation.present();

    stage.leave();

    expect(shown(follower)).toBeNull();
  });

  it('changes nothing for a command that arrives while not presenting', () => {
    const join = channelHub();
    const stage = presentingWindow(join(), mintingIds(FIRST_PRESENTATION, SECOND_PRESENTATION));
    const { follower } = notesWindow(join());
    stage.navigation.present();
    stage.navigation.exitPresenting();
    const before = stage.navigation.getState();

    follower.advance();

    expect(stage.navigation.getState()).toBe(before);
  });

  it('ignores a command naming a presentation that has ended', () => {
    const join = channelHub();
    const stage = presentingWindow(
      join(),
      mintingIds(FIRST_PRESENTATION, SECOND_PRESENTATION, THIRD_PRESENTATION),
    );
    const notes = join();
    const { follower } = notesWindow(notes);
    stage.navigation.present();
    const ended = follower.getState();
    stage.navigation.exitPresenting();
    stage.navigation.present();

    notes.post({
      version: 1,
      kind: 'command',
      presentationId: ended.kind === 'presenting' ? ended.snapshot.presentationId : uuid(0),
      command: { kind: 'advance' },
    });

    expect(stage.navigation.activeResourceId()).toBe(OPENING);
  });
});

import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import {
  MemorySpaceBackend,
  openSpaceSession,
  type ObserverErrorReporter,
} from '@project/persistence';
import { composeCore } from '../src/compose-app';
import { followPresentation, type PresentationLinks } from '../src/presentation-link';
import type { Fullscreen } from '../src/presenting-fullscreen';
import {
  createPresentingWindow,
  type PresentingWindowDependencies,
} from '../src/presenting-window';
import { channelHub } from './presentation-channels';
import { mintingIds } from './minting';

const uuid = (n: number): UUID =>
  uuidSchema.parse(`00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`);

const SPACE_ID = uuid(1);
const MAP_ID = uuid(2);
const TALK = uuid(3);
const ENCORE = uuid(4);
const OPENING = uuid(10);
const MIDDLE = uuid(11);
const CLOSING = uuid(12);
const FIRST_PRESENTATION = uuid(100);
const SECOND_PRESENTATION = uuid(101);

/** A talk of three Resources, and an encore Graph over the same Map. */
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
          [MIDDLE]: { x: 300, y: 0, open: false },
          [CLOSING]: { x: 600, y: 0, open: false },
        },
        graphs: [
          {
            id: TALK,
            title: 'Talk',
            edges: [
              { from: OPENING, to: MIDDLE },
              { from: MIDDLE, to: CLOSING },
            ],
          },
          { id: ENCORE, title: 'Encore', edges: [{ from: CLOSING, to: OPENING }] },
        ],
      },
    ],
    defaultMap: MAP_ID,
  },
  resources: [OPENING, MIDDLE, CLOSING].map((id, index) => ({
    id,
    document: { title: `Slide ${index}`, kind: 'markdown', content: { source: '' } },
  })),
};

const throwObserverError: ObserverErrorReporter = (error) => {
  throw error;
};

/** A fullscreen the test sees requested, which the browser never grants. */
function requestedFullscreen() {
  let requests = 0;
  const fullscreen: Fullscreen = {
    enter: () => {
      requests += 1;
      return Promise.resolve(false);
    },
    exit: () => undefined,
    active: () => false,
    subscribe: () => () => undefined,
  };
  return { fullscreen, requests: () => requests };
}

/** A presenting window over a real Navigation, with a clock the test moves. */
function presentingWindow(
  newId: () => UUID,
  overrides: Partial<PresentingWindowDependencies> = {},
) {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const { navigation } = composeCore({
    spaceSession: openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded),
  });
  let time = 1_000;
  const browser = requestedFullscreen();
  let notesOpened = 0;
  const window = createPresentingWindow({
    navigation,
    newId,
    now: () => time,
    fullscreen: browser.fullscreen,
    openNotes: () => {
      notesOpened += 1;
    },
    reportObserverError: throwObserverError,
    ...overrides,
  });
  return {
    navigation,
    window,
    requests: browser.requests,
    notesOpened: () => notesOpened,
    at: (next: number) => {
      time = next;
    },
  };
}

describe('the presenting window', () => {
  it('has no presentation, and no rehearsal notes, while not presenting', () => {
    const { window } = presentingWindow(mintingIds(FIRST_PRESENTATION));

    window.commands.toggleNotes();

    expect(window.getState()).toEqual({ presentation: null, rehearsalNotesShown: false });
  });

  it('starts a presentation, with its identity and start time, when presenting begins', () => {
    const { window, requests } = presentingWindow(mintingIds(FIRST_PRESENTATION));

    window.present();

    expect(window.getState()).toEqual({
      presentation: { id: FIRST_PRESENTATION, startedAt: 1_000 },
      rehearsalNotesShown: false,
    });
    expect(requests()).toBe(1);
  });

  it('keeps the presentation and its rehearsal notes across a reopening of the same Map and Graph', () => {
    const { navigation, window, at } = presentingWindow(mintingIds(FIRST_PRESENTATION));
    window.present();
    window.commands.toggleNotes();
    window.commands.advance();

    at(2_000);
    navigation.openPresentation(MAP_ID, TALK, OPENING);

    expect(window.getState()).toEqual({
      presentation: { id: FIRST_PRESENTATION, startedAt: 1_000 },
      rehearsalNotesShown: true,
    });
  });

  it('starts afresh, with the rehearsal notes hidden, after leaving presenting and presenting again', () => {
    const { window, at } = presentingWindow(mintingIds(FIRST_PRESENTATION, SECOND_PRESENTATION));
    window.present();
    window.commands.toggleNotes();
    window.commands.exitPresenting();
    expect(window.getState()).toEqual({ presentation: null, rehearsalNotesShown: false });

    at(2_000);
    window.present();

    expect(window.getState()).toEqual({
      presentation: { id: SECOND_PRESENTATION, startedAt: 2_000 },
      rehearsalNotesShown: false,
    });
  });

  it('starts afresh, with the rehearsal notes hidden, when Present restarts the talk', () => {
    const { navigation, window, at } = presentingWindow(
      mintingIds(FIRST_PRESENTATION, SECOND_PRESENTATION),
    );
    window.present();
    window.commands.advance();
    window.commands.toggleNotes();

    at(2_000);
    window.present();

    expect(navigation.activeResourceId()).toBe(OPENING);
    expect(window.getState()).toEqual({
      presentation: { id: SECOND_PRESENTATION, startedAt: 2_000 },
      rehearsalNotesShown: false,
    });
  });

  it('starts afresh, with the rehearsal notes hidden, when a reopening changes Graph', () => {
    const { navigation, window, at } = presentingWindow(
      mintingIds(FIRST_PRESENTATION, SECOND_PRESENTATION),
    );
    window.present();
    window.commands.toggleNotes();

    at(2_000);
    navigation.openPresentation(MAP_ID, ENCORE, CLOSING);

    expect(window.getState()).toEqual({
      presentation: { id: SECOND_PRESENTATION, startedAt: 2_000 },
      rehearsalNotesShown: false,
    });
  });

  it('starts afresh when an Edit adopts another Graph that holds the presented Resource', () => {
    const { navigation, window, at } = presentingWindow(
      mintingIds(FIRST_PRESENTATION, SECOND_PRESENTATION),
    );
    window.present();
    window.commands.advance();
    window.commands.advance();
    expect(navigation.activeResourceId()).toBe(CLOSING);
    window.commands.toggleNotes();

    at(2_000);
    navigation.continueInMap(MAP_ID, ENCORE);

    expect(navigation.getState().mode).toBe('presenting');
    expect(window.getState()).toEqual({
      presentation: { id: SECOND_PRESENTATION, startedAt: 2_000 },
      rehearsalNotesShown: false,
    });
  });

  it('keeps the presentation when an Edit adopts the same Map and Graph', () => {
    const { navigation, window } = presentingWindow(mintingIds(FIRST_PRESENTATION));
    window.present();
    window.commands.toggleNotes();

    navigation.continueInMap(MAP_ID, TALK);

    expect(window.getState()).toEqual({
      presentation: { id: FIRST_PRESENTATION, startedAt: 1_000 },
      rehearsalNotesShown: true,
    });
  });

  it('stops following Navigation once disposed', () => {
    const { window } = presentingWindow(mintingIds(FIRST_PRESENTATION));
    window.dispose();

    window.present();

    expect(window.getState()).toEqual({ presentation: null, rehearsalNotesShown: false });
  });

  it('stops linking Notes windows once disposed, and links none after', () => {
    const join = channelHub();
    const presence = { hold: () => () => undefined, watch: () => () => undefined };
    const links: PresentationLinks = {
      open: () => join(),
      now: () => 0,
      leaving: () => () => undefined,
      presence,
    };
    const { navigation, window } = presentingWindow(mintingIds(FIRST_PRESENTATION), {
      link: { spaceId: () => SPACE_ID, links },
    });
    const follower = followPresentation(join(), presence, throwObserverError);
    follower.connect();
    window.connect();

    window.dispose();
    window.connect();
    navigation.present();

    expect(follower.getState().kind).not.toBe('presenting');
  });

  it('hides the rehearsal notes again on a second toggle', () => {
    const { window } = presentingWindow(mintingIds(FIRST_PRESENTATION));
    window.present();

    window.commands.toggleNotes();
    expect(window.getState().rehearsalNotesShown).toBe(true);
    window.commands.toggleNotes();
    expect(window.getState().rehearsalNotesShown).toBe(false);
  });

  it('answers the same state until something changes, and says when it does', () => {
    const { window } = presentingWindow(mintingIds(FIRST_PRESENTATION));
    const before = window.getState();
    expect(window.getState()).toBe(before);
    let heard = 0;
    window.subscribe(() => {
      heard += 1;
    });

    window.present();
    expect(heard).toBe(1);
    const presenting = window.getState();
    window.commands.advance();
    expect(heard).toBe(1);
    expect(window.getState()).toBe(presenting);
    window.commands.toggleNotes();
    expect(heard).toBe(2);
  });

  it('opens a Notes window', () => {
    const { window, notesOpened } = presentingWindow(mintingIds(FIRST_PRESENTATION));

    window.commands.openNotes();

    expect(notesOpened()).toBe(1);
  });

  it('moves the traversal with Navigation’s own operations', () => {
    const { navigation, window } = presentingWindow(mintingIds(FIRST_PRESENTATION));
    window.present();

    window.commands.advance();
    expect(navigation.activeResourceId()).toBe(MIDDLE);
    window.commands.retreat();
    expect(navigation.activeResourceId()).toBe(OPENING);
  });

  it('goes back on Home to where this presentation began, still the same presentation', () => {
    const { navigation, window, at } = presentingWindow(
      mintingIds(FIRST_PRESENTATION, SECOND_PRESENTATION),
    );
    window.presentFrom(MIDDLE);
    window.commands.advance();
    window.commands.toggleNotes();

    at(2_000);
    window.commands.returnToStart();

    expect(navigation.activeResourceId()).toBe(MIDDLE);
    expect(window.getState()).toEqual({
      presentation: { id: FIRST_PRESENTATION, startedAt: 1_000 },
      rehearsalNotesShown: true,
    });
  });

  it('publishes its own presentation to a Notes window', () => {
    const join = channelHub();
    const links: PresentationLinks = {
      open: () => join(),
      now: () => {
        throw new Error('The link must take the start time from the presenting window.');
      },
      leaving: () => () => undefined,
      presence: { hold: () => () => undefined, watch: () => () => undefined },
    };
    const { window, at } = presentingWindow(mintingIds(FIRST_PRESENTATION), {
      link: { spaceId: () => SPACE_ID, links },
    });
    const follower = followPresentation(
      join(),
      { hold: () => () => undefined, watch: () => () => undefined },
      throwObserverError,
    );
    follower.connect();
    window.connect();

    at(5_000);
    window.present();

    const state = follower.getState();
    expect(state.kind === 'presenting' && state.snapshot.presentationId).toBe(FIRST_PRESENTATION);
    expect(state.kind === 'presenting' && state.snapshot.startedAt).toBe(5_000);
  });
});

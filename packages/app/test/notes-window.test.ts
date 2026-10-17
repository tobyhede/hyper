import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { loadSpaceSnapshot, type Space } from '@project/graph';
import {
  MemorySpaceBackend,
  openSpaceSession,
  type ObserverErrorReporter,
} from '@project/persistence';
import { composeCore } from '../src/compose-app';
import { createNotesWindow, elapsedLabel, type NotesWindow } from '../src/notes-window';
import type { PresentationChannel, PresentationLinks } from '../src/presentation-link';
import { createPresentingWindow } from '../src/presenting-window';
import { refusingFullscreen } from './fullscreen';
import { mintingIds } from './minting';
import { channelHub } from './presentation-channels';

const uuid = (n: number): UUID =>
  uuidSchema.parse(`00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`);

const SPACE_ID = uuid(1);
const MAP_ID = uuid(2);
const TALK = uuid(3);
const NOTES = uuid(4);
const OPENING = uuid(10);
const LEFT = uuid(11);
const RIGHT = uuid(12);
const LOWER_NOTE = uuid(20);
const UPPER_NOTE = uuid(21);
const LEFT_NOTE = uuid(22);

const markdown = (id: UUID, title: string, source: string) => ({
  id,
  document: { title, kind: 'markdown' as const, content: { source } },
});

/** A talk that forks after its opening, with a notes Graph from two of its Resources. */
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
          [LOWER_NOTE]: { x: 0, y: 400, open: false },
          [UPPER_NOTE]: { x: 0, y: 200, open: false },
          [LEFT_NOTE]: { x: 300, y: 400, open: false },
        },
        graphs: [
          {
            id: TALK,
            title: 'Talk',
            edges: [
              { from: OPENING, to: LEFT },
              { from: OPENING, to: RIGHT },
            ],
          },
          {
            id: NOTES,
            title: 'Talk Notes',
            edges: [
              { from: OPENING, to: LOWER_NOTE },
              { from: OPENING, to: UPPER_NOTE },
              { from: LEFT, to: LEFT_NOTE },
            ],
          },
        ],
      },
    ],
    defaultMap: MAP_ID,
  },
  resources: [
    markdown(OPENING, 'Opening', 'Welcome'),
    markdown(LEFT, 'Left', 'The left way'),
    markdown(RIGHT, 'Right', 'The right way'),
    markdown(LOWER_NOTE, 'Then', 'Mention the fork'),
    markdown(UPPER_NOTE, 'First', 'Thank the hosts'),
    markdown(LEFT_NOTE, 'Left notes', 'Slow down here'),
  ],
};

const spaceOf = (opened: SpaceSnapshot): Space => {
  const loaded = loadSpaceSnapshot(opened);
  if (!loaded.ok) throw new Error('The fixture is not a valid Space.');
  return loaded.space;
};

const throwObserverError: ObserverErrorReporter = (error) => {
  throw error;
};

const linksOver = (
  channel: PresentationChannel,
  now: () => number = () => 0,
): PresentationLinks => ({
  open: () => channel,
  now,
  leaving: () => () => undefined,
  presence: { hold: () => () => undefined, watch: () => () => undefined },
});

function presentingWindow(channel: PresentationChannel, newId: () => UUID) {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const { navigation, currentSpace } = composeCore({
    spaceSession: openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded),
  });
  const links = linksOver(channel, () => 7_000);
  createPresentingWindow({
    navigation,
    newId,
    now: links.now,
    fullscreen: refusingFullscreen,
    openNotes: () => undefined,
    link: { spaceId: () => currentSpace().id, links },
    reportObserverError: (error) => {
      throw error;
    },
  }).connect();
  return navigation;
}

function notesWindowOver(
  channel: PresentationChannel,
  stored: () => SpaceSnapshot = () => snapshot,
  space: Space = spaceOf(snapshot),
): NotesWindow {
  const notes = createNotesWindow({
    spaceId: SPACE_ID,
    space,
    reload: () => Promise.resolve(spaceOf(stored())),
    links: linksOver(channel),
    reportObserverError: throwObserverError,
  });
  notes.connect();
  return notes;
}

/** Let a reload of the Space the Notes window asked for settle. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

const titles = (notes: NotesWindow, read: 'notes' | 'moves') => {
  const state = notes.getState();
  return state.kind === 'presenting' ? state.view[read].map(({ title }) => title) : null;
};

describe('the Notes window', () => {
  it('draws the presented Resource’s notes, top to bottom as they sit on the Map', async () => {
    const join = channelHub();
    const navigation = presentingWindow(join(), mintingIds(uuid(100)));
    const notes = notesWindowOver(join());

    navigation.present();
    await settled();

    const state = notes.getState();
    expect(state.kind === 'presenting' && state.view.presented.title).toBe('Opening');
    expect(state.kind === 'presenting' && state.view.notesGraph).toBe('Talk Notes');
    expect(titles(notes, 'notes')).toEqual(['First', 'Then']);
  });

  it('draws each Resource’s own notes as the presentation moves', async () => {
    const join = channelHub();
    const navigation = presentingWindow(join(), mintingIds(uuid(100)));
    const notes = notesWindowOver(join());
    navigation.present();
    await settled();

    navigation.advance();

    expect(titles(notes, 'notes')).toEqual(['Left notes']);
  });

  it('draws every move from a fork, with the selected one marked, and moves the Stage', async () => {
    const join = channelHub();
    const navigation = presentingWindow(join(), mintingIds(uuid(100)));
    const notes = notesWindowOver(join());
    navigation.present();
    await settled();

    notes.selectBranch(1);
    const state = notes.getState();
    expect(
      state.kind === 'presenting' &&
        state.view.moves.map(({ title, selected }) => [title, selected]),
    ).toEqual([
      ['Left', false],
      ['Right', true],
    ]);

    notes.advance();
    expect(navigation.activeResourceId()).toBe(RIGHT);
    expect(titles(notes, 'notes')).toEqual([]);
  });

  it('says the talk has no notes Graph when none reads as one', async () => {
    const join = channelHub();
    const navigation = presentingWindow(join(), mintingIds(uuid(100)));
    const unnoted: SpaceSnapshot = {
      ...snapshot,
      document: {
        ...snapshot.document,
        maps: snapshot.document.maps?.map((m) => ({
          ...m,
          graphs: m.graphs.map((graph) =>
            graph.id === NOTES ? { ...graph, title: 'Backup' } : graph,
          ),
        })),
      },
    };
    const notes = notesWindowOver(join(), () => unnoted, spaceOf(unnoted));
    navigation.present();
    await settled();

    const state = notes.getState();
    expect(state.kind === 'presenting' && state.view.notesGraph).toBeNull();
    expect(titles(notes, 'notes')).toEqual([]);
  });

  it('reloads the Space when a presentation starts, so an Edit since the last one is drawn', async () => {
    const join = channelHub();
    const navigation = presentingWindow(join(), mintingIds(uuid(100), uuid(101)));
    let stored = snapshot;
    const notes = notesWindowOver(join(), () => stored);
    navigation.present();
    await settled();
    navigation.exitPresenting();

    stored = {
      ...snapshot,
      resources: snapshot.resources.map((resource) =>
        resource.id === UPPER_NOTE
          ? markdown(UPPER_NOTE, 'Thank everyone', 'Hosts and crew')
          : resource,
      ),
    };
    navigation.present();
    await settled();

    expect(titles(notes, 'notes')).toEqual(['Thank everyone', 'Then']);
  });

  it('reloads again for a presentation that starts while an earlier reload is pending', async () => {
    const join = channelHub();
    const navigation = presentingWindow(join(), mintingIds(uuid(100), uuid(101)));
    let stored = snapshot;
    // Each reload reads the store when it is asked, and answers when released.
    const pending: (() => void)[] = [];
    const notes = createNotesWindow({
      spaceId: SPACE_ID,
      space: spaceOf(snapshot),
      reload: () => {
        const read = spaceOf(stored);
        return new Promise((resolve) => pending.push(() => resolve(read)));
      },
      links: linksOver(join()),
      reportObserverError: throwObserverError,
    });
    notes.connect();
    const releaseAll = async () => {
      while (pending.length > 0) {
        pending.shift()?.();
        await settled();
      }
    };

    navigation.present();
    navigation.exitPresenting();
    stored = {
      ...snapshot,
      resources: snapshot.resources.map((resource) =>
        resource.id === UPPER_NOTE
          ? markdown(UPPER_NOTE, 'Thank everyone', 'Hosts and crew')
          : resource,
      ),
    };
    navigation.present();
    await releaseAll();

    expect(titles(notes, 'notes')).toEqual(['Thank everyone', 'Then']);
  });

  it('reloads again for a Resource it does not hold that is named while a reload is pending', async () => {
    const join = channelHub();
    const navigation = presentingWindow(join(), mintingIds(uuid(100)));
    // The Notes window loaded before Right was added, and its first reload
    // reads the store before the Edit lands too.
    const withoutRight: SpaceSnapshot = {
      ...snapshot,
      document: {
        ...snapshot.document,
        maps: snapshot.document.maps?.map((m) => ({
          ...m,
          positions: Object.fromEntries(Object.entries(m.positions).filter(([id]) => id !== RIGHT)),
          graphs: m.graphs.map((graph) => ({
            ...graph,
            edges: graph.edges.filter(({ to }) => to !== RIGHT),
          })),
        })),
      },
      resources: snapshot.resources.filter((resource) => resource.id !== RIGHT),
    };
    let stored = withoutRight;
    const pending: (() => void)[] = [];
    const notes = createNotesWindow({
      spaceId: SPACE_ID,
      space: spaceOf(withoutRight),
      reload: () => {
        const read = spaceOf(stored);
        return new Promise((resolve) => pending.push(() => resolve(read)));
      },
      links: linksOver(join()),
      reportObserverError: throwObserverError,
    });
    notes.connect();

    navigation.present();
    stored = snapshot;
    notes.selectBranch(1);
    while (pending.length > 0) {
      pending.shift()?.();
      await settled();
    }

    expect(titles(notes, 'moves')).toEqual(['Left', 'Right']);
  });

  it('carries when the presentation started', async () => {
    const join = channelHub();
    const navigation = presentingWindow(join(), mintingIds(uuid(100)));
    const notes = notesWindowOver(join());
    navigation.present();
    await settled();

    const state = notes.getState();
    expect(state.kind === 'presenting' && state.view.startedAt).toBe(7_000);
  });

  it('shows "not presenting" when presenting ends', async () => {
    const join = channelHub();
    const navigation = presentingWindow(join(), mintingIds(uuid(100)));
    const notes = notesWindowOver(join());
    navigation.present();
    await settled();

    navigation.exitPresenting();

    expect(notes.getState().kind).toBe('not-presenting');
  });
});

describe('elapsed time', () => {
  it.each([
    [0, '00:00'],
    [999, '00:00'],
    [61_000, '01:01'],
    [3_599_000, '59:59'],
    [3_600_000, '1:00:00'],
    [-5_000, '00:00'],
  ])('reads %i ms as %s', (milliseconds, label) => {
    expect(elapsedLabel(milliseconds)).toBe(label);
  });
});

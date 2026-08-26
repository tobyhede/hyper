import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { Placement } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { composeApp, composeCore } from '../src/compose-app';
import { createConnectionCompletion } from '../src/connection-completion';
import { mintingGraphIds, mintingIds } from './minting';

/**
 * What an opened Space is composed of, asserted at the composition rather than
 * at the twenty call sites that used to write it out.
 *
 * The property under test is the one every hand-written `currentSpace` closure
 * got wrong: production reads the working snapshot through **one**
 * `createWorkingSpaceReader`, so two reads with nothing committed between them
 * answer the same `Space` — which is what the render memos hang on. A closure
 * that re-parses answers a fresh object every time, and a test written over one
 * runs an identity regime the app does not have.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const MINTED_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000031');
const MINTED_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000041');

const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    layouts: [
      {
        id: LAYOUT_ID,
        title: 'Layout 1',
        kind: 'positioned',
        positions: {
          [CARD_A]: { x: 10, y: 20, state: 'closed' },
          [CARD_B]: { x: 300, y: 40, state: 'closed' },
        },
        graphs: [{ id: GRAPH_ID, title: 'Main', edges: [{ from: CARD_A, to: CARD_B }] }],
      },
    ],
    defaultRenderer: LAYOUT_ID,
  },
  cards: [
    { id: CARD_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: CARD_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
  ],
};

const openSession = (opened: SpaceSnapshot = snapshot) => {
  const loaded = { snapshot: opened, revision: 0n, exportedRevision: null };
  return openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
};

describe('the composed working Space', () => {
  it('answers one Space identity while nothing is committed', () => {
    const { currentSpace } = composeCore({ spaceSession: openSession() });

    expect(currentSpace()).toBe(currentSpace());
  });

  /**
   * The other half of the memo, and what makes it sound: a session publishes a
   * fresh `working` clone on a new state object rather than mutating one, so a
   * snapshot-keyed reader cannot leave a stale Space answering as the current
   * one.
   */
  it('answers a new Space once an Edit has been taken', () => {
    const spaceSession = openSession();
    const { currentSpace, authoring } = composeApp({ spaceSession });
    const before = currentSpace();

    expect(
      authoring.complete({
        kind: 'edited-card',
        cardId: CARD_A,
        document: { title: 'Renamed', kind: 'markdown', body: 'A' },
      }),
    ).toMatchObject({ kind: 'completed' });

    expect(currentSpace()).not.toBe(before);
    expect(currentSpace().lookup.card(CARD_A)?.title).toBe('Renamed');
  });

  /** The reader is returned as well as closed over, so the render path shares it. */
  it('reads a rendered snapshot through the same reader `currentSpace` uses', () => {
    const spaceSession = openSession();
    const { readWorkingSpace, currentSpace } = composeCore({ spaceSession });

    expect(readWorkingSpace(spaceSession.getState().working)).toBe(currentSpace());
  });
});

describe('what the composition opens on', () => {
  it('opens in the Space default when no selection is named', () => {
    const { navigation } = composeCore({ spaceSession: openSession() });

    expect(navigation.getState().selectedRenderer).toEqual({ kind: 'layout', layoutId: LAYOUT_ID });
  });

  it('opens a selected Layout on the placement that Layout already authored', () => {
    const { authoring } = composeApp({ spaceSession: openSession() });

    expect(authoring.authoredPlacement()).toEqual(
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20, state: 'closed' }],
        [CARD_B, { x: 300, y: 40, state: 'closed' }],
      ]),
    );
  });

  it('opens an Algorithmic View on no placement at all', () => {
    const { authoring } = composeApp({
      spaceSession: openSession(),
      selection: { kind: 'view', view: 'flow' },
    });

    expect(authoring.authoredPlacement()).toBeNull();
  });
});

describe('the connection completion Edge Authoring is given', () => {
  /**
   * A `ConnectionCompletion` is written in terms of an adapter and an Authoring,
   * and the composition creates both — so a caller cannot hand in a finished one
   * without binding Edge Authoring to a foreign pair. It supplies the *making*
   * of one instead, and is handed the collaborators this composition built.
   */
  it('builds a supplied completion over the collaborators this composition made', () => {
    const seen: { adapter: unknown; authoring: unknown }[] = [];
    const composed = composeApp({
      spaceSession: openSession(),
      connections: (collaborators) => {
        seen.push(collaborators);
        return createConnectionCompletion(collaborators);
      },
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.adapter).toBe(composed.adapter);
    expect(seen[0]?.authoring).toBe(composed.authoring);
  });
});

/**
 * Both minters are passed explicitly, so neither collaborator falls back to
 * `newUuid` on its own and a test that drives the real composition can name the
 * identities it is about to assert on (ADR 0016).
 */
describe('where a composition mints identities', () => {
  it('mints an Edit’s Layout and a converted Graph from the functions it was given', () => {
    const viewOnly: SpaceSnapshot = {
      id: SPACE_ID,
      document: { version: 1, title: 'New space' },
      cards: [{ id: CARD_A, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
    };
    const spaceSession = openSession(viewOnly);
    const rendered = Placement.fromEntries([[CARD_A, { x: 10, y: 20, state: 'closed' }]]);
    const { authoring, navigation } = composeApp({
      spaceSession,
      selection: { kind: 'view', view: 'flow' },
      newId: mintingIds(MINTED_LAYOUT_ID),
      newGraphId: mintingGraphIds(MINTED_GRAPH_ID),
      initialPlacement: rendered,
    });

    expect(
      authoring.complete({ kind: 'connected-cards', from: CARD_A, to: CARD_A, rendered }),
    ).toEqual({ kind: 'completed' });

    const layouts = spaceSession.getState().working.document.layouts ?? [];
    expect(layouts.map((layout) => layout.id)).toEqual([MINTED_LAYOUT_ID]);
    expect(layouts[0]?.graphs.map((graph) => graph.id)).toEqual([MINTED_GRAPH_ID]);
    expect(navigation.getState().activeGraphId).toBe(MINTED_GRAPH_ID);
  });
});

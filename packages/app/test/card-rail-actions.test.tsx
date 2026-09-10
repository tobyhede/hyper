import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  type RenderResult,
} from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { productDestinationPath } from '@project/http';
import { MemorySpaceBackend, type SpaceSession } from '@project/persistence';
import type { HistoryApi } from '../src/browser-location';
import { composeApp } from '../src/compose-app';
import type { DestinationOpening } from '../src/destination-opening';
import { recordingHistory } from './browser-history';
import { openTestSpace } from './opened-space';
import { mountSpace } from './space-mounting';

/**
 * A Card's own commands belong to the Card (ADR 0073, ADR 0082).
 *
 * The addresses and the deletion were reachable only through the Space's
 * command surface, which named the *selected* Card in its footer. Both are now
 * on the Card's own rail, and these tests are what keeps them there once that
 * surface is replaced: the menu is asserted through the canvas rather than
 * through any chrome, and the deletion is asserted to be the very Edit the
 * footer ran rather than a second one that resembles it.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');

/**
 * Two placed Cards and no Edges.
 *
 * Two, because the deletion below has to leave a Space behind that is still
 * worth looking at: a Diagram that has lost its only Card says nothing about
 * whether the Edit removed the right one.
 */
const snapshot: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    diagrams: [
      {
        id: DIAGRAM_ID,
        title: 'Diagram',
        kind: 'positioned',
        positions: {
          [CARD_ID]: { x: 0, y: 0, open: false },
          [OTHER_CARD_ID]: { x: 400, y: 0, open: false },
        },
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
      },
    ],
    defaultDiagram: DIAGRAM_ID,
  },
  cards: [
    { id: CARD_ID, document: { title: 'A', kind: 'markdown', body: 'A source' } },
    { id: OTHER_CARD_ID, document: { title: 'B', kind: 'markdown', body: 'B source' } },
  ],
});

const runtime = (value: SpaceSnapshot) => {
  const loaded = loadSpaceSnapshot(value);
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join('\n'));
  return loaded.space;
};

function mount(opening?: DestinationOpening, history?: HistoryApi): SpaceSession {
  const stored = { snapshot, revision: 0n, exportedRevision: null };
  const { spaceSession: session, spaceCards } = openTestSpace(
    new MemorySpaceBackend([stored]),
    stored,
  );
  let view: RenderResult | undefined;
  mountSpace(
    {
      id: runtime(snapshot).id,
      session,
      app: composeApp({ spaceSession: session }),
      spaceCards,
    },
    (app) => {
      if (view === undefined) view = render(app);
      else view.rerender(app);
    },
    opening,
    history,
  );
  return session;
}

/**
 * Persistence is asynchronous and so is the strategy that places Cards, so a
 * test that ends the moment it has asserted leaves both to land against an
 * unmounted tree.
 */
const settled = (session: SpaceSession): Promise<void> =>
  waitFor(() => expect(session.getState().persistence.kind).toBe('settled'));

const cardIds = (session: SpaceSession): readonly string[] =>
  session.getState().working.cards.map((card) => card.id);

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
});

afterAll(() => vi.unstubAllGlobals());

describe('a Card’s commands on the canvas rail', () => {
  /**
   * Reached without selecting anything first. The Space's command surface drew
   * these for the selected Card alone, which is the shape ADR 0073 rejects: the
   * commands are the Card's, so they are on the Card whether or not the
   * renderer has it selected.
   */
  it('offers both of a placed Card’s addresses and its deletion', async () => {
    const session = mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Card A' }));

    expect(await screen.findByRole('menuitem', { name: /^Copy link/ })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: /^Copy permanent link/ })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Delete Card' })).toBeVisible();
    await settled(session);
  });

  /** Each Card's menu names its own Card, which is what makes them the Card's. */
  it('names every Card on the canvas, not the one the renderer has selected', async () => {
    const session = mount();

    expect(await screen.findByRole('button', { name: 'Actions for Card A' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Actions for Card B' })).toBeVisible();
    await settled(session);
  });

  /**
   * **Deleting asks first, and the question names what it destroys.**
   *
   * The rail's Delete runs on the press otherwise, and a Card's deletion cannot
   * be taken back: V1 has no undo, and a Space Card owns its target's lifetime
   * together with every other reference to it, so the same press can reach work
   * in Spaces that are not on screen (ADR 0074). The Sidebar's footer carried
   * this `AlertDialog` and the Sidebar has gone; the dialog moved to the App
   * root rather than into the menu, because the menu closes on the press and
   * would take the question with it.
   *
   * The claim this replaced compared two surfaces running one Edit. There is one
   * surface now — a Card's commands are the Card's (ADR 0073) — so what is left
   * to pin is that the one route asks, and that answering it runs the deletion.
   */
  it('asks before deleting, and deletes when the question is answered', async () => {
    const session = mount(
      { selection: DIAGRAM_ID, cardId: CARD_ID, graphId: null, presentationCardId: null },
      // The location the Card is addressed from: the opening and the pathname
      // the browser location then follows are one position in production, so
      // they are one here.
      recordingHistory(
        productDestinationPath({
          kind: 'diagram-card',
          spaceId: SPACE_ID,
          diagramId: DIAGRAM_ID,
          cardId: CARD_ID,
        }),
      ),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Card A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete Card' }));

    // The press asked rather than deleted, and the question says what goes.
    const question = await screen.findByRole('alertdialog', { name: 'Delete Card A?' });
    expect(question).toHaveTextContent('every Diagram that contains it');
    expect(cardIds(session)).toEqual([CARD_ID, OTHER_CARD_ID]);

    fireEvent.click(within(question).getByRole('button', { name: 'Delete Card' }));

    await waitFor(() => expect(cardIds(session)).toEqual([OTHER_CARD_ID]));
    await settled(session);
  });

  /**
   * **The press asked, so the press does not say it deleted.**
   *
   * `EntityActionsMenu` holds a reporting item's menu open and swaps its label
   * to the word the outcome names — machinery built for a command that *runs*
   * on the press. This one only raises a question, so `done` on the press said
   * "Card deleted" beside a dialog still asking whether to, and announced it to
   * a reader who then pressed Cancel. The deletion's own outcome is the canvas's
   * to report, and its refusal the confirmation's.
   */
  it('does not report a deletion while the question is still asking', async () => {
    const session = mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Card A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete Card' }));
    await screen.findByRole('alertdialog', { name: 'Delete Card A?' });

    expect(screen.queryByText('Card deleted')).not.toBeInTheDocument();
    await settled(session);
  });

  /**
   * The question names the Card by its **name** (ADR 0083).
   *
   * A Card's Title is one or more Title Lines and the front draws the ladder;
   * a dialog title is a sentence, and a line break arriving in one draws as a
   * broken-looking label rather than as an error. This is the claim the
   * retired Sidebar's own footer used to hold.
   */
  it('names the Card in the question by its name and not by its whole Title', async () => {
    const session = mount();
    const laddered = 'A\nAnd read this next';
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Title A' }));
    const input = screen.getByRole('textbox', { name: 'Card title' });
    fireEvent.change(input, { target: { value: laddered } });
    fireEvent.keyDown(input, { key: 'Enter' });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Card A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete Card' }));

    const question = await screen.findByRole('alertdialog', { name: 'Delete Card A?' });
    expect(question).not.toHaveTextContent('And read this next');
    fireEvent.click(within(question).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await settled(session);
  });

  /** The other answer, which is the one that makes the question a question. */
  it('leaves the Card alone when the question is cancelled', async () => {
    const session = mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Card A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete Card' }));
    const question = await screen.findByRole('alertdialog', { name: 'Delete Card A?' });
    fireEvent.click(within(question).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(cardIds(session)).toEqual([CARD_ID, OTHER_CARD_ID]);
    await settled(session);
  });
});

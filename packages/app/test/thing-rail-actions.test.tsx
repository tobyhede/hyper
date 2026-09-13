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
import { THING_HEIGHT, THING_WIDTH } from '../src/thing';

/**
 * A Thing's own commands belong to the Thing (ADR 0073, ADR 0082).
 *
 * The addresses and the deletion were reachable only through the Space's
 * command surface, which named the *selected* Thing in its footer. Both are now
 * on the Thing's own rail, and these tests are what keeps them there once that
 * surface is replaced: the menu is asserted through the canvas rather than
 * through any chrome, and the deletion is asserted to be the very Edit the
 * footer ran rather than a second one that resembles it.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const SPACE_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const TARGET_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const TARGET_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');

/**
 * Two placed Things and no Edges.
 *
 * Two, because the deletion below has to leave a Space behind that is still
 * worth looking at: a Diagram that has lost its only Thing says nothing about
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
          [THING_ID]: { x: 0, y: 0, open: false },
          [OTHER_THING_ID]: { x: 400, y: 0, open: false },
        },
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
      },
    ],
    defaultDiagram: DIAGRAM_ID,
  },
  things: [
    { id: THING_ID, document: { title: 'A', kind: 'markdown', body: 'A source' } },
    { id: OTHER_THING_ID, document: { title: 'B', kind: 'markdown', body: 'B source' } },
  ],
});

/** The same Space with an Alias of `A` already in it, for the terminal-row case. */
const withAlias: SpaceSnapshot = spaceSnapshotSchema.parse({
  ...snapshot,
  document: {
    ...snapshot.document,
    diagrams: [
      {
        ...snapshot.document.diagrams?.[0],
        positions: {
          ...snapshot.document.diagrams?.[0]?.positions,
          [ALIAS_ID]: { x: 0, y: 400, open: false },
        },
      },
    ],
  },
  things: [
    ...snapshot.things,
    { id: ALIAS_ID, document: { title: 'A alias', kind: 'alias', target: THING_ID } },
  ],
});

/**
 * The same Space with a Space Thing in it, for the other terminal row.
 *
 * The Target of an Alias must own its Markdown content (ADR 0009), which is one
 * rule with two terminal kinds — `aliasTargetRefusal` refuses `space` exactly as
 * it refuses `alias`. This fixture is what stops the row being drawn live on the
 * second of them again; `spaceId` names a Space this snapshot does not hold,
 * which is the ordinary shape of a Space Thing read on its own.
 */
const withSpaceThing: SpaceSnapshot = spaceSnapshotSchema.parse({
  ...snapshot,
  document: {
    ...snapshot.document,
    diagrams: [
      {
        ...snapshot.document.diagrams?.[0],
        positions: {
          ...snapshot.document.diagrams?.[0]?.positions,
          [SPACE_THING_ID]: { x: 0, y: 400, open: false },
        },
      },
    ],
  },
  things: [
    ...snapshot.things,
    {
      id: SPACE_THING_ID,
      document: {
        title: 'A space',
        kind: 'space',
        spaceId: TARGET_SPACE_ID,
        diagram: TARGET_DIAGRAM_ID,
        graph: TARGET_GRAPH_ID,
      },
    },
  ],
});

const runtime = (value: SpaceSnapshot) => {
  const loaded = loadSpaceSnapshot(value);
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join('\n'));
  return loaded.space;
};

function mount(
  opening?: DestinationOpening,
  history?: HistoryApi,
  /** The Space to mount, for the one case that needs an Alias already in it. */
  mounted: SpaceSnapshot = snapshot,
): SpaceSession {
  const stored = { snapshot: mounted, revision: 0n, exportedRevision: null };
  const { spaceSession: session, spaceThings } = openTestSpace(
    new MemorySpaceBackend([stored]),
    stored,
  );
  let view: RenderResult | undefined;
  mountSpace(
    {
      id: runtime(mounted).id,
      session,
      app: composeApp({ spaceSession: session }),
      spaceThings,
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
 * Persistence is asynchronous and so is the strategy that places Things, so a
 * test that ends the moment it has asserted leaves both to land against an
 * unmounted tree.
 */
const settled = (session: SpaceSession): Promise<void> =>
  waitFor(() => expect(session.getState().persistence.kind).toBe('settled'));

const thingIds = (session: SpaceSession): readonly string[] =>
  session.getState().working.things.map((thing) => thing.id);

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

describe('a Thing’s commands on the canvas rail', () => {
  /**
   * Reached without selecting anything first. The Space's command surface drew
   * these for the selected Thing alone, which is the shape ADR 0073 rejects: the
   * commands are the Thing's, so they are on the Thing whether or not the
   * renderer has it selected.
   */
  it('offers both of a placed Thing’s addresses and its deletion', async () => {
    const session = mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A' }));

    expect(await screen.findByRole('menuitem', { name: /^Copy link/ })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: /^Copy permanent link/ })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: /^Copy Space link/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^Open in new tab/ })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete Thing' })).toBeVisible();
    await settled(session);
  });

  /** Each Thing's menu names its own Thing, which is what makes them the Thing's. */
  it('names every Thing on the canvas, not the one the renderer has selected', async () => {
    const session = mount();

    expect(await screen.findByRole('button', { name: 'Actions for Thing A' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Actions for Thing B' })).toBeVisible();
    await settled(session);
  });

  /**
   * **Create Alias is a command about the Thing, so it lives on the Thing.**
   *
   * An Alias is always created *from* its Target (ADR 0089), which is what
   * removes the Target-selection interaction entirely — the gesture is on the
   * Thing, so the Target is the Thing it was invoked on. It inherits this
   * menu's keyboard route rather than needing one invented, which is why it is
   * a row here and not a rail glyph or a bare shortcut.
   */
  it('creates an Alias of the Thing whose menu ran the command', async () => {
    const session = mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Create Alias' }));

    await waitFor(() => expect(thingIds(session)).toHaveLength(3));
    const created = session.getState().working.things[2];
    expect(created?.document).toEqual({ title: 'A', kind: 'alias', target: THING_ID });
    await settled(session);
  });

  /**
   * The Title is the Target's, copied once and independent thereafter, and the
   * caret is in it.
   *
   * ADR 0083 keeps the Target's name off the Thing front, so without the copy
   * the author has no on-canvas indication of what the Alias points at beyond
   * the dotted border. Copying it *once* is what keeps the two ordinary
   * independent Titles afterwards.
   */
  it('continues in the new Alias’s own Title editor, seeded from its Target', async () => {
    const session = mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Create Alias' }));

    const editor = await screen.findByRole('textbox', { name: 'Thing title' });
    expect(editor).toHaveValue('A');
    expect(editor).toHaveFocus();
    await settled(session);
  });

  /**
   * Placed at a fixed offset from the source, so the Alias lands where the
   * author is looking.
   *
   * A free-position search was rejected: that is a placement algorithm, and ADR
   * 0086 put automatic arrangement behind an Edit and out of the render path
   * deliberately. The overlap is authored and the author drags it off.
   */
  it('places the Alias at a fixed offset from the Thing it was made from', async () => {
    const session = mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Create Alias' }));

    await waitFor(() => expect(thingIds(session)).toHaveLength(3));
    const alias = session.getState().working.things[2]!.id;
    const positions = session.getState().working.document.diagrams?.[0]?.positions;
    // Three quarters of a Thing on each axis, not half: at half the new Alias's
    // centre lands exactly on the Target's bottom-right corner and the Target
    // takes every pointer event aimed at it (`ALIAS_OFFSET_RATIO` in `App.tsx`).
    expect(positions?.[alias]).toMatchObject({
      x: Math.round(THING_WIDTH * 0.75),
      y: Math.round(THING_HEIGHT * 0.75),
    });
    await settled(session);
  });

  it.each([4, 6])(
    'keeps an Alias separated after closing its %s-times-sized Target',
    async (scale) => {
      const opened = spaceSnapshotSchema.parse({
        ...snapshot,
        document: {
          ...snapshot.document,
          diagrams: [
            {
              ...snapshot.document.diagrams?.[0],
              positions: {
                ...snapshot.document.diagrams?.[0]?.positions,
                [THING_ID]: {
                  x: 0,
                  y: 0,
                  open: true,
                  openSize: { width: THING_WIDTH * scale, height: THING_HEIGHT * scale },
                },
              },
            },
          ],
        },
      });
      const session = mount(undefined, undefined, opened);
      fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Create Alias' }));
      const editor = await screen.findByRole('textbox', { name: 'Thing title' });
      fireEvent.keyDown(editor, { key: 'Escape' });
      const alias = session.getState().working.things[2]!.id;
      fireEvent.click(await screen.findByRole('button', { name: 'Close Thing A' }));
      await waitFor(() => {
        const positions = session.getState().working.document.diagrams?.[0]?.positions;
        expect(positions?.[THING_ID]?.open).toBe(false);
        // Same authored offset the closed-Target creation asserts: Close reclaims
        // the growth that `createAliasFrom` added ahead of the collapsed step, so
        // the Alias lands back on the rounded 0.75 of each collapsed axis.
        expect(positions?.[alias]?.x).toBe(Math.round(THING_WIDTH * 0.75));
        expect(positions?.[alias]?.y).toBe(Math.round(THING_HEIGHT * 0.75));
      });
      await settled(session);
    },
  );

  /**
   * **Present and unavailable on an Alias, not absent.**
   *
   * ADR 0070 forbids an Alias of an Alias, and a row that can never apply would
   * ordinarily not be one of that kind's commands. It is drawn and greyed
   * anyway, because an Alias is otherwise a regular Thing: this row is where the
   * product says that aliasing terminates.
   */
  it('offers Create Alias unavailable on an Alias, because aliasing terminates', async () => {
    const session = mount(undefined, undefined, withAlias);

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A alias' }));

    const row = await screen.findByRole('menuitem', { name: /^Create Alias/ });
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(thingIds(session)).toHaveLength(3);
    await settled(session);
  });

  /**
   * **The single hop has two terminal kinds, and the row knows both.**
   *
   * `aliasTargetRefusal` refuses every non-`markdown` Target with
   * `alias-target-must-own-content` (ADR 0009), so a Space Thing is as terminal
   * as an Alias. Read as "not an Alias", the row was drawn live on a Space Thing
   * and the press could only ever refuse — a command offered where it can never
   * succeed, whose failure said "Alias not created" and gave no reason.
   *
   * The two kinds say different things, because "aliasing stops here" and "this
   * never had content to alias" are different facts, so the reason is asserted
   * and not only the unavailability.
   */
  /**
   * Independently opening the Space a Space Thing shows is a link to that
   * Space's own address (ADR 0068, ADR 0069). Copy link still names the Thing;
   * these two commands are the target, and they carry no containing Diagram.
   */
  it('offers a Space Thing the target Space’s address and opens it independently', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(window);
    const session = mount(undefined, undefined, withSpaceThing);

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A space' }));
    expect(await screen.findByRole('menuitem', { name: /^Copy Space link/ })).toBeVisible();
    fireEvent.click(screen.getByRole('menuitem', { name: /^Open in new tab/ }));

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        `https://space.test${productDestinationPath({ kind: 'space', spaceId: TARGET_SPACE_ID })}`,
        '_blank',
        'noopener,noreferrer',
      ),
    );
    await settled(session);
    open.mockRestore();
  });

  it('offers Create Alias unavailable on a Space Thing, which owns no content', async () => {
    const session = mount(undefined, undefined, withSpaceThing);

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A space' }));

    const row = await screen.findByRole('menuitem', { name: /^Create Alias/ });
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).toHaveTextContent('Only a Markdown Thing can be aliased.');
    expect(thingIds(session)).toHaveLength(3);
    await settled(session);
  });

  /**
   * **Deleting asks first, and the question names what it destroys.**
   *
   * The rail's Delete runs on the press otherwise, and a Thing's deletion cannot
   * be taken back: V1 has no undo, and a Space Thing owns its target's lifetime
   * together with every other reference to it, so the same press can reach work
   * in Spaces that are not on screen (ADR 0074). The Sidebar's footer carried
   * this `AlertDialog` and the Sidebar has gone; the dialog moved to the App
   * root rather than into the menu, because the menu closes on the press and
   * would take the question with it.
   *
   * The claim this replaced compared two surfaces running one Edit. There is one
   * surface now — a Thing's commands are the Thing's (ADR 0073) — so what is left
   * to pin is that the one route asks, and that answering it runs the deletion.
   */
  it('asks before deleting, and deletes when the question is answered', async () => {
    const session = mount(
      { selection: DIAGRAM_ID, thingId: THING_ID, graphId: null, presentationThingId: null },
      // The location the Thing is addressed from: the opening and the pathname
      // the browser location then follows are one position in production, so
      // they are one here.
      recordingHistory(
        productDestinationPath({
          kind: 'diagram-thing',
          spaceId: SPACE_ID,
          diagramId: DIAGRAM_ID,
          thingId: THING_ID,
        }),
      ),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete Thing' }));

    // The press asked rather than deleted, and the question says what goes.
    const question = await screen.findByRole('alertdialog', { name: 'Delete Thing A?' });
    expect(question).toHaveTextContent('every Diagram that contains it');
    expect(thingIds(session)).toEqual([THING_ID, OTHER_THING_ID]);

    fireEvent.click(within(question).getByRole('button', { name: 'Delete Thing' }));

    await waitFor(() => expect(thingIds(session)).toEqual([OTHER_THING_ID]));
    await settled(session);
  });

  /**
   * **The press asked, so the press does not say it deleted.**
   *
   * `EntityActionsMenu` holds a reporting item's menu open and swaps its label
   * to the word the outcome names — machinery built for a command that *runs*
   * on the press. This one only raises a question, so `done` on the press said
   * "Thing deleted" beside a dialog still asking whether to, and announced it to
   * a reader who then pressed Cancel. The deletion's own outcome is the canvas's
   * to report, and its refusal the confirmation's.
   */
  it('does not report a deletion while the question is still asking', async () => {
    const session = mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete Thing' }));
    await screen.findByRole('alertdialog', { name: 'Delete Thing A?' });

    expect(screen.queryByText('Thing deleted')).not.toBeInTheDocument();
    await settled(session);
  });

  /**
   * The question names the Thing by its **name** (ADR 0083).
   *
   * A Thing's Title is one or more Title Lines and the front draws the ladder;
   * a dialog title is a sentence, and a line break arriving in one draws as a
   * broken-looking label rather than as an error. This is the claim the
   * retired Sidebar's own footer used to hold.
   */
  it('names the Thing in the question by its name and not by its whole Title', async () => {
    const session = mount();
    const laddered = 'A\nAnd read this next';
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Title A' }));
    const input = screen.getByRole('textbox', { name: 'Thing title' });
    fireEvent.change(input, { target: { value: laddered } });
    fireEvent.keyDown(input, { key: 'Enter' });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete Thing' }));

    const question = await screen.findByRole('alertdialog', { name: 'Delete Thing A?' });
    expect(question).not.toHaveTextContent('And read this next');
    fireEvent.click(within(question).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await settled(session);
  });

  /** The other answer, which is the one that makes the question a question. */
  it('leaves the Thing alone when the question is cancelled', async () => {
    const session = mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete Thing' }));
    const question = await screen.findByRole('alertdialog', { name: 'Delete Thing A?' });
    fireEvent.click(within(question).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(thingIds(session)).toEqual([THING_ID, OTHER_THING_ID]);
    await settled(session);
  });
});

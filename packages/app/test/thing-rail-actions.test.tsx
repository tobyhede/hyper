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
import { expectMenuGroups } from './menu-assertions';
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
const REFERENCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
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

/** The same Space with a Reference Thing of `A` already in it, for the terminal-row case. */
const withReference: SpaceSnapshot = spaceSnapshotSchema.parse({
  ...snapshot,
  document: {
    ...snapshot.document,
    diagrams: [
      {
        ...snapshot.document.diagrams?.[0],
        positions: {
          ...snapshot.document.diagrams?.[0]?.positions,
          [REFERENCE_ID]: { x: 0, y: 400, open: false },
        },
      },
    ],
  },
  things: [
    ...snapshot.things,
    { id: REFERENCE_ID, document: { title: 'A reference', kind: 'reference', target: THING_ID } },
  ],
});

/** A Space Thing with a target that the test backend also stores. */
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
  /** The Space to mount, for the one case that needs a Reference Thing already in it. */
  mounted: SpaceSnapshot = snapshot,
): SpaceSession {
  const stored = { snapshot: mounted, revision: 0n, exportedRevision: null };
  const { spaceSession: session, spaceThings } = openTestSpace(
    new MemorySpaceBackend([
      stored,
      ...(mounted.things.some((thing) => thing.document.kind === 'space')
        ? [
            {
              snapshot: spaceSnapshotSchema.parse({
                id: TARGET_SPACE_ID,
                document: {
                  version: 1,
                  title: 'Target',
                  defaultDiagram: TARGET_DIAGRAM_ID,
                  diagrams: [
                    {
                      id: TARGET_DIAGRAM_ID,
                      title: 'Target Diagram',
                      kind: 'positioned',
                      positions: {},
                      graphs: [{ id: TARGET_GRAPH_ID, title: 'Target Graph', edges: [] }],
                    },
                  ],
                },
                things: [],
              }),
              revision: 0n,
              exportedRevision: null,
            },
          ]
        : []),
    ]),
    stored,
  );
  let view: RenderResult | undefined;
  mountSpace(
    {
      id: runtime(mounted).id,
      session,
      app: composeApp({ spaceSession: session, spaceThings }),
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
    await screen.findByRole('menuitem', { name: 'Delete from Space' });

    expect(
      await screen.findByRole('menuitem', {
        name: (accessibleName) => accessibleName.startsWith('Copy link to Thing in Diagram'),
      }),
    ).toBeVisible();
    expect(
      await screen.findByRole('menuitem', {
        name: (accessibleName) =>
          accessibleName.startsWith('Copy link to Thing') && !accessibleName.includes('Diagram'),
      }),
    ).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: /^Copy link to Space/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^Open in New Tab/ })).not.toBeInTheDocument();
    expect(await screen.findByRole('menuitem', { name: 'Delete from Space' })).toBeVisible();
    expect(await screen.findByRole('menuitem', { name: 'Remove from Diagram' })).toBeVisible();
    await settled(session);
  });

  /**
   * The Thing menu's one grouping grammar
   * (`.scratch/dock-menu-reorganisation/issues/03`): Create Reference on its own,
   * both copy links beside each other, then Remove from Diagram and Delete
   * from Space sharing the trailing destructive group — one separator between
   * each. The dropdown and the context menu draw the identical list
   * (`EntityActionItems`), so this is the one place the order has to hold.
   */
  it('groups Create Reference, both copy links, then Remove and Delete, in that order', async () => {
    const session = mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A' }));
    const menu = await screen.findByRole('menu');

    expectMenuGroups(menu, [
      ['Create Reference'],
      ['Copy link to Thing in Diagram', 'Copy link to Thing'],
      ['Remove from Diagram', 'Delete from Space'],
    ]);
    await settled(session);
  });

  /**
   * Present and unavailable on a Reference Thing (ADR 0070): the same grouping, with
   * Create Reference leading the menu greyed rather than absent.
   */
  it('keeps Create Reference leading and unavailable in a Reference Thing’s own menu', async () => {
    const session = mount(undefined, undefined, withReference);

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A reference' }));
    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');

    expectMenuGroups(menu, [
      ['Create Reference'],
      ['Copy link to Thing in Diagram', 'Copy link to Thing', 'Copy link to Target'],
      ['Remove from Diagram', 'Delete from Space'],
    ]);
    expect(items[0]).toHaveAttribute('aria-disabled', 'true');
    await settled(session);
  });

  /**
   * Remove from Diagram is the named command for the Edit Delete/Backspace already
   * runs. It must not ask first: that question is Delete from Space's, because only
   * a Space deletion cascades (v1-release/03).
   */
  it('removes the Thing from this Diagram and leaves it in the Space, without asking', async () => {
    const session = mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove from Diagram' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(
        session.getState().working.document.diagrams?.[0]?.positions[THING_ID],
      ).toBeUndefined();
    });
    expect(thingIds(session)).toEqual([THING_ID, OTHER_THING_ID]);
    await settled(session);
  });

  /**
   * Delete from Space is withdrawn while a Thing is Open so Open state cannot outlive
   * the Thing. Remove from Diagram is the canvas key's availability: it reclaims
   * the Open room and stays offered.
   */
  it('still offers Remove from Diagram while the Thing is Open', async () => {
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
                openSize: { width: THING_WIDTH, height: THING_HEIGHT },
              },
            },
          },
        ],
      },
    });
    const session = mount(undefined, undefined, opened);

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A' }));

    expect(await screen.findByRole('menuitem', { name: 'Remove from Diagram' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Delete from Space' })).not.toBeInTheDocument();
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
   * **Create Reference is a command about the Thing, so it lives on the Thing.**
   *
   * A Reference Thing is always created *from* its Target (ADR 0089), which is what
   * removes the Target-selection interaction entirely — the gesture is on the
   * Thing, so the Target is the Thing it was invoked on. It inherits this
   * menu's keyboard route rather than needing one invented, which is why it is
   * a row here and not a rail glyph or a bare shortcut.
   */
  it('creates a Reference Thing of the Thing whose menu ran the command', async () => {
    const session = mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Create Reference' }));

    await waitFor(() => expect(thingIds(session)).toHaveLength(3));
    const created = session.getState().working.things[2];
    expect(created?.document).toEqual({ title: 'A', kind: 'reference', target: THING_ID });
    await settled(session);
  });

  /**
   * The Title is the Target's, copied once and independent thereafter, and the
   * caret is in it.
   *
   * ADR 0083 keeps the Target's name off the Thing front, so without the copy
   * the author has no on-canvas indication of what the Reference Thing points at beyond
   * the dotted border. Copying it *once* is what keeps the two ordinary
   * independent Titles afterwards.
   */
  it('continues in the new Reference Thing’s own Title editor, seeded from its Target', async () => {
    const session = mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Create Reference' }));

    const editor = await screen.findByRole('textbox', { name: 'Thing title' });
    expect(editor).toHaveValue('A');
    expect(editor).toHaveFocus();
    await settled(session);
  });

  /**
   * Placed at a fixed offset from the source, so the Reference Thing lands where the
   * author is looking.
   *
   * A free-position search was rejected: that is a placement algorithm, and ADR
   * 0086 put automatic arrangement behind an Edit and out of the render path
   * deliberately. The overlap is authored and the author drags it off.
   */
  it('places the Reference Thing at a fixed offset from the Thing it was made from', async () => {
    const session = mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Create Reference' }));

    await waitFor(() => expect(thingIds(session)).toHaveLength(3));
    const reference = session.getState().working.things[2]!.id;
    const positions = session.getState().working.document.diagrams?.[0]?.positions;
    // Three quarters of a Thing on each axis, not half: at half the new Reference Thing's
    // centre lands exactly on the Target's bottom-right corner and the Target
    // takes every pointer event aimed at it (`REFERENCE_OFFSET_RATIO` in `App.tsx`).
    expect(positions?.[reference]).toMatchObject({
      x: Math.round(THING_WIDTH * 0.75),
      y: Math.round(THING_HEIGHT * 0.75),
    });
    await settled(session);
  });

  it.each([4, 6])(
    'keeps a Reference Thing separated after closing its %s-times-sized Target',
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
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Create Reference' }));
      const editor = await screen.findByRole('textbox', { name: 'Thing title' });
      fireEvent.keyDown(editor, { key: 'Escape' });
      const reference = session.getState().working.things[2]!.id;
      fireEvent.click(await screen.findByRole('button', { name: 'Close Thing A' }));
      await waitFor(() => {
        const positions = session.getState().working.document.diagrams?.[0]?.positions;
        expect(positions?.[THING_ID]?.open).toBe(false);
        // Close reclaims the width `createReferenceFrom` added ahead of the
        // collapsed step and nothing else: the Reference Thing is clear of the
        // Target on `x`, so that is its one room axis (ADR 0093). It lands back on
        // the rounded 0.75 of the collapsed width, and below the Closed Target by
        // the height growth it keeps.
        const heightGrowth = THING_HEIGHT * scale - THING_HEIGHT;
        expect(positions?.[reference]?.x).toBe(Math.round(THING_WIDTH * 0.75));
        expect(positions?.[reference]?.y).toBe(Math.round(THING_HEIGHT * 0.75) + heightGrowth);
        expect(positions?.[reference]?.y).toBeGreaterThanOrEqual(THING_HEIGHT);
      });
      await settled(session);
    },
  );

  /**
   * **Present and unavailable on a Reference Thing, not absent.**
   *
   * ADR 0070 forbids a Reference Thing of a Reference Thing, and a row that can never apply would
   * ordinarily not be one of that kind's commands. It is drawn and greyed
   * anyway, because a Reference Thing is otherwise a regular Thing: this row is where the
   * product says that referencing terminates.
   */
  it('offers Create Reference unavailable on a Reference Thing, because referencing terminates', async () => {
    const session = mount(undefined, undefined, withReference);

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A reference' }));

    const row = await screen.findByRole('menuitem', { name: /^Create Reference/ });
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(thingIds(session)).toHaveLength(3);
    await settled(session);
  });

  /**
   * Copy link to Target copies the Target's own Thing address — not a
   * within-Diagram one, and not this Reference Thing's own address, which is
   * what the two rows before it already offer. The Target is often absent from
   * this Diagram entirely (`.scratch/reference-thing/issues/02`).
   */
  it('offers a Reference Thing a Copy link to Target, copying the Target’s own address', async () => {
    const written: string[] = [];
    const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (value: string) => {
          written.push(value);
          return Promise.resolve();
        },
      },
    });

    try {
      const session = mount(undefined, undefined, withReference);

      fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A reference' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: /^Copy link to Target/ }));

      await waitFor(() =>
        expect(written).toEqual([
          `https://space.test${productDestinationPath({ kind: 'thing', spaceId: SPACE_ID, thingId: THING_ID })}`,
        ]),
      );
      await settled(session);
    } finally {
      if (previousClipboard === undefined) Reflect.deleteProperty(navigator, 'clipboard');
      else Object.defineProperty(navigator, 'clipboard', previousClipboard);
    }
  });

  /**
   * An unavailable Target — here, the clipboard refusing the write — takes the
   * existing refusal path rather than a new one: the same standing alert and
   * the same in-place item label every other copy command uses
   * (`SpaceApp.test.tsx`).
   */
  it('reports a refused Copy link to Target the way every other copy command does', async () => {
    const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('Clipboard permission denied')) },
    });

    try {
      const session = mount(undefined, undefined, withReference);

      fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A reference' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: /^Copy link to Target/ }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Link not copied');
      expect(alert).toHaveTextContent('The browser refused clipboard access.');
      expect(await screen.findByRole('menuitem', { name: /^Not copied/ })).toBeVisible();
      await settled(session);
    } finally {
      if (previousClipboard === undefined) Reflect.deleteProperty(navigator, 'clipboard');
      else Object.defineProperty(navigator, 'clipboard', previousClipboard);
    }
  });

  /**
   * The Space Thing menu's own grouping grammar
   * (`.scratch/dock-menu-reorganisation/issues/04`): Create Reference on its own,
   * then Open in New Tab (Enter is absent here — this isolated single-Space
   * mount carries no `OpenSpacesContext`, so `spaces === null` withholds it;
   * `enter-space-thing.test.tsx` holds the full order with Enter present),
   * then the three copy links, then Remove from Diagram and Delete from
   * Space sharing the trailing destructive group — one separator between
   * each. Rename is absent, which this exact-order assertion would catch as
   * an extra row if it were not.
   */
  it('groups Create Reference, Open in New Tab, the copy links, then Remove and Delete on a Space Thing', async () => {
    const session = mount(undefined, undefined, withSpaceThing);

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A space' }));
    const menu = await screen.findByRole('menu');

    expectMenuGroups(menu, [
      ['Create Reference'],
      ['Open in New Tab'],
      ['Copy link to Thing in Diagram', 'Copy link to Thing', 'Copy link to Space'],
      ['Remove from Diagram', 'Delete from Space'],
    ]);
    await settled(session);
  });

  /**
   * Removing Rename from the Space Thing menu must not take on-front Title
   * editing with it — the two are separate seams, and this presses the
   * front's own control directly rather than through the menu.
   */
  it('still edits a Space Thing’s Title on the Thing front, not through the menu', async () => {
    const session = mount(undefined, undefined, withSpaceThing);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Title A space' }));
    const editor = screen.getByRole('textbox', { name: 'Thing title' });
    expect(editor).toHaveFocus();
    fireEvent.change(editor, { target: { value: 'Renamed on the front' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    expect(await screen.findByRole('heading', { name: 'Renamed on the front' })).toBeVisible();
    expect(
      session.getState().working.things.find((thing) => thing.id === SPACE_THING_ID)?.document,
    ).toMatchObject({ title: 'Renamed on the front' });
    await settled(session);
  });

  /**
   * Delete from Space is a leaving action on every Thing, including a Space
   * Thing. Filtering the rail down to Remove from Diagram alone would withdraw
   * a command that is still available (`availability.deleteThing`).
   */
  it('offers Delete from Space on a Space Thing when deletion is available', async () => {
    const session = mount(undefined, undefined, withSpaceThing);

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A space' }));

    expect(await screen.findByRole('menuitem', { name: 'Delete from Space' })).toBeVisible();
    expect(await screen.findByRole('menuitem', { name: 'Remove from Diagram' })).toBeVisible();
    await settled(session);
  });

  it('offers a Space Thing the target Space’s address and opens it independently', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(window);
    const session = mount(undefined, undefined, withSpaceThing);

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A space' }));
    expect(await screen.findByRole('menuitem', { name: /^Copy link to Space/ })).toBeVisible();
    fireEvent.click(screen.getByRole('menuitem', { name: /^Open in New Tab/ }));

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

  it('creates a Reference Thing from a Space Thing', async () => {
    const session = mount(undefined, undefined, withSpaceThing);
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A space' }));
    const row = await screen.findByRole('menuitem', { name: 'Create Reference' });
    expect(row).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(row);
    expect(thingIds(session)).toHaveLength(4);
    expect(session.getState().working.things.at(-1)?.document).toMatchObject({
      kind: 'reference',
      title: 'A space',
    });
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
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete from Space' }));

    // The press asked rather than deleted, and the question says what goes.
    const question = await screen.findByRole('alertdialog', { name: 'Delete from Space A?' });
    expect(question).toHaveTextContent('every Diagram that contains it');
    expect(thingIds(session)).toEqual([THING_ID, OTHER_THING_ID]);

    fireEvent.click(within(question).getByRole('button', { name: 'Delete from Space' }));

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
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete from Space' }));
    await screen.findByRole('alertdialog', { name: 'Delete from Space A?' });

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
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete from Space' }));

    const question = await screen.findByRole('alertdialog', { name: 'Delete from Space A?' });
    expect(question).not.toHaveTextContent('And read this next');
    fireEvent.click(within(question).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await settled(session);
  });

  /** The other answer, which is the one that makes the question a question. */
  it('leaves the Thing alone when the question is cancelled', async () => {
    const session = mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Thing A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete from Space' }));
    const question = await screen.findByRole('alertdialog', { name: 'Delete from Space A?' });
    fireEvent.click(within(question).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(thingIds(session)).toEqual([THING_ID, OTHER_THING_ID]);
    await settled(session);
  });
});

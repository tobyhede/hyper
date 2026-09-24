import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  type RenderResult,
} from '@testing-library/react';
import { selectResource, selectResourceById } from './resource-selection';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { productDestinationPath } from '@project/http';
import { MemorySpaceBackend, type SpaceSession } from '@project/persistence';
import type { HistoryApi } from '../src/browser-location';
import { composeApp, type ComposedApp } from '../src/compose-app';
import type { DestinationOpening } from '../src/destination-opening';
import { recordingHistory } from './browser-history';
import { newGraphItem } from './command-dock';
import { expectMenuGroups } from './menu-assertions';
import { openTestSpace } from './opened-space';
import { mountSpace } from './space-mounting';
import { RESOURCE_HEIGHT, RESOURCE_WIDTH } from '../src/resource';

/**
 * A Resource's own commands belong to the Resource (ADR 0073, ADR 0082).
 *
 * The addresses and the deletion were reachable only through the Space's
 * command surface, which named the *selected* Resource in its footer. Both are now
 * on the Resource's own rail, and these tests are what keeps them there once that
 * surface is replaced: the menu is asserted through the canvas rather than
 * through any chrome, and the deletion is asserted to be the very Edit the
 * footer ran rather than a second one that resembles it.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const REFERENCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const TARGET_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const TARGET_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');
const GRAPH_ID_2 = uuidSchema.parse('00000000-0000-4000-8000-00000000000c');

/**
 * Two placed Resources and no Edges.
 *
 * Two, because the deletion below has to leave a Space behind that is still
 * worth looking at: a Map that has lost its only Resource says nothing about
 * whether the Edit removed the right one.
 */
const snapshot: SpaceSnapshot = spaceSnapshotSchema.parse({
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
          [RESOURCE_ID]: { x: 0, y: 0, open: false },
          [OTHER_RESOURCE_ID]: { x: 400, y: 0, open: false },
        },
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
      },
    ],
    defaultMap: MAP_ID,
  },
  resources: [
    { id: RESOURCE_ID, document: { title: 'A', kind: 'markdown', body: 'A source' } },
    { id: OTHER_RESOURCE_ID, document: { title: 'B', kind: 'markdown', body: 'B source' } },
  ],
});

/** The same Space with a Reference Resource of `A` already in it, for the terminal-row case. */
const withReference: SpaceSnapshot = spaceSnapshotSchema.parse({
  ...snapshot,
  document: {
    ...snapshot.document,
    maps: [
      {
        ...snapshot.document.maps?.[0],
        positions: {
          ...snapshot.document.maps?.[0]?.positions,
          [REFERENCE_ID]: { x: 0, y: 400, open: false },
        },
      },
    ],
  },
  resources: [
    ...snapshot.resources,
    {
      id: REFERENCE_ID,
      document: { title: 'A reference', kind: 'reference', target: RESOURCE_ID },
    },
  ],
});

/** A Space Resource with a target that the test backend also stores. */
const withSpaceResource: SpaceSnapshot = spaceSnapshotSchema.parse({
  ...snapshot,
  document: {
    ...snapshot.document,
    maps: [
      {
        ...snapshot.document.maps?.[0],
        positions: {
          ...snapshot.document.maps?.[0]?.positions,
          [SPACE_RESOURCE_ID]: { x: 0, y: 400, open: false },
        },
      },
    ],
  },
  resources: [
    ...snapshot.resources,
    {
      id: SPACE_RESOURCE_ID,
      document: {
        title: 'A space',
        kind: 'space',
        spaceId: TARGET_SPACE_ID,
        map: TARGET_MAP_ID,
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
  /** The Space to mount, for the one case that needs a Reference Resource already in it. */
  mounted: SpaceSnapshot = snapshot,
  /** Adjusts the composition before it is mounted, for a case that needs a refusal. */
  prepare?: (app: ComposedApp) => void,
): SpaceSession {
  const stored = { snapshot: mounted, revision: 0n, exportedRevision: null };
  const { spaceSession: session, spaceResources } = openTestSpace(
    new MemorySpaceBackend(SPACE_ID, [
      stored,
      ...(mounted.resources.some((resource) => resource.document.kind === 'space')
        ? [
            {
              snapshot: spaceSnapshotSchema.parse({
                id: TARGET_SPACE_ID,
                document: {
                  version: 1,
                  title: 'Target',
                  defaultMap: TARGET_MAP_ID,
                  maps: [
                    {
                      id: TARGET_MAP_ID,
                      title: 'Target Map',
                      kind: 'positioned',
                      positions: {},
                      graphs: [{ id: TARGET_GRAPH_ID, title: 'Target Graph', edges: [] }],
                    },
                  ],
                },
                resources: [],
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
  const app = composeApp({ spaceSession: session, spaceResources });
  prepare?.(app);
  mountSpace(
    {
      id: runtime(mounted).id,
      session,
      app,
      spaceResources,
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
 * Persistence is asynchronous and so is the strategy that places Resources, so a
 * test that ends the moment it has asserted leaves both to land against an
 * unmounted tree.
 */
const settled = (session: SpaceSession): Promise<void> =>
  waitFor(() => expect(session.getState().persistence.kind).toBe('settled'));

const resourceIds = (session: SpaceSession): readonly string[] =>
  session.getState().working.resources.map((resource) => resource.id);

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

describe('a Resource’s commands on the canvas rail', () => {
  /**
   * Reached by selecting the Resource first. The commands are the Resource's
   * (ADR 0073) and float in React Flow's `NodeToolbar`, which draws them while that
   * Resource is the one selected; the right-click menu still reaches the same
   * actions without selecting.
   */
  it('offers both of a placed Resource’s addresses and its deletion', async () => {
    const session = mount();

    await selectResource('A');
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource A' }));
    await screen.findByRole('menuitem', { name: 'Delete from Space' });

    expect(
      await screen.findByRole('menuitem', {
        name: (accessibleName) => accessibleName.startsWith('Copy link to Resource in Map'),
      }),
    ).toBeVisible();
    expect(
      await screen.findByRole('menuitem', {
        name: (accessibleName) =>
          accessibleName.startsWith('Copy link to Resource') && !accessibleName.includes('Map'),
      }),
    ).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: /^Copy link to Space/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^Open in New Tab/ })).not.toBeInTheDocument();
    expect(await screen.findByRole('menuitem', { name: 'Delete from Space' })).toBeVisible();
    expect(await screen.findByRole('menuitem', { name: 'Remove from Map' })).toBeVisible();
    await settled(session);
  });

  /**
   * The dropdown and the context menu draw the identical list
   * (`EntityActionItems`), so this is the one place the order has to hold.
   */
  it('groups Create Reference, Connect, both copy links, then Remove and Delete, in that order', async () => {
    const session = mount();

    await selectResource('A');
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource A' }));
    const menu = await screen.findByRole('menu');

    expectMenuGroups(menu, [
      ['Create Reference'],
      ['Connect to Resource'],
      ['Copy link to Resource in Map', 'Copy link to Resource'],
      ['Remove from Map', 'Delete from Space'],
    ]);
    await settled(session);
  });

  /**
   * Present and unavailable on a Reference Resource (ADR 0070): the same grouping, with
   * Create Reference leading the menu greyed rather than absent.
   */
  it('keeps Create Reference leading and unavailable in a Reference Resource’s own menu', async () => {
    const session = mount(undefined, undefined, withReference);

    await selectResource('A reference');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Actions for Resource A reference' }),
    );
    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');

    expectMenuGroups(menu, [
      ['Create Reference'],
      ['Connect to Resource'],
      ['Copy link to Resource in Map', 'Copy link to Resource', 'Copy link to Target'],
      ['Remove from Map', 'Delete from Space'],
    ]);
    expect(items[0]).toHaveAttribute('aria-disabled', 'true');
    await settled(session);
  });

  /**
   * Remove from Map is the named command for the Edit Delete/Backspace already
   * runs. It must not ask first: that question is Delete from Space's, because only
   * a Space deletion cascades (v1-release/03).
   */
  it('removes the Resource from this Map and leaves it in the Space, without asking', async () => {
    const session = mount();

    await selectResource('A');
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove from Map' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(session.getState().working.document.maps?.[0]?.positions[RESOURCE_ID]).toBeUndefined();
    });
    expect(resourceIds(session)).toEqual([RESOURCE_ID, OTHER_RESOURCE_ID]);
    await settled(session);
  });

  /**
   * Remove from Map reports on its own channel. It used to borrow Delete from
   * Space's, so a refused removal read "Resource not deleted" about a Resource
   * nobody was deleting.
   */
  it('shows a refused removal as "Resource not removed" and dismisses it', async () => {
    const session = mount(undefined, undefined, snapshot, ({ authoring }) => {
      const complete = authoring.complete;
      vi.spyOn(authoring, 'complete').mockImplementation((completion) =>
        completion.kind === 'removed-resource-from-map'
          ? { kind: 'refused', refusal: { code: 'resource-not-found' } }
          : complete(completion),
      );
    });

    await selectResource('A');
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove from Map' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Resource not removed');
    expect(alert).toHaveTextContent('This Resource is no longer part of the Space.');
    expect(screen.queryByText('Resource not deleted')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss: Resource not removed' }));
    await waitFor(() => expect(screen.queryByText('Resource not removed')).not.toBeInTheDocument());
    await settled(session);
  });

  /**
   * A refused Graph Edit and a refused Reference Resource creation are drawn
   * from command outcomes' `graph-edit` and `reference-create` channels, each
   * under its own title, and each dismissal puts away only its own notice.
   */
  it('shows a refused Graph Edit and Reference Resource creation, and dismisses each', async () => {
    const session = mount(undefined, undefined, snapshot, ({ authoring }) => {
      const complete = authoring.complete;
      vi.spyOn(authoring, 'complete').mockImplementation((completion) => {
        if (completion.kind === 'added-graph') {
          return { kind: 'refused', refusal: { code: 'map-not-found' } };
        }
        if (completion.kind === 'created-reference') {
          return { kind: 'refused', refusal: { code: 'resource-not-found' } };
        }
        return complete(completion);
      });
    });

    await selectResource('A');
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Create Reference' }));
    await waitFor(() => expect(newGraphItem('Graph')).not.toHaveAttribute('aria-disabled', 'true'));
    fireEvent.click(newGraphItem('Graph'));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((alert) => alert.textContent)).toEqual([
      expect.stringContaining('Reference Resource not created'),
      expect.stringContaining('Graph unchanged'),
    ]);
    expect(alerts[0]).toHaveTextContent('This Resource is no longer part of the Space.');
    expect(alerts[1]).toHaveTextContent('This Map is no longer part of the Space.');
    expect(resourceIds(session)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss: Graph unchanged' }));
    await waitFor(() => expect(screen.queryByText('Graph unchanged')).not.toBeInTheDocument());
    expect(screen.getByText('Reference Resource not created')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss: Reference Resource not created' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Reference Resource not created')).not.toBeInTheDocument(),
    );
    await settled(session);
  });

  /**
   * Delete from Space is withdrawn while a Resource is Open so Open state cannot outlive
   * the Resource. Remove from Map is the canvas key's availability: it reclaims
   * the Open room and stays offered.
   */
  it('still offers Remove from Map while the Resource is Open', async () => {
    const opened = spaceSnapshotSchema.parse({
      ...snapshot,
      document: {
        ...snapshot.document,
        maps: [
          {
            ...snapshot.document.maps?.[0],
            positions: {
              ...snapshot.document.maps?.[0]?.positions,
              [RESOURCE_ID]: {
                x: 0,
                y: 0,
                open: true,
                openSize: { width: RESOURCE_WIDTH, height: RESOURCE_HEIGHT },
              },
            },
          },
        ],
      },
    });
    const session = mount(undefined, undefined, opened);

    await selectResource('A');
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource A' }));

    expect(await screen.findByRole('menuitem', { name: 'Remove from Map' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Delete from Space' })).not.toBeInTheDocument();
    await settled(session);
  });

  /**
   * Each Resource's menu names its own Resource, which is what makes them the Resource's.
   * The commands float in React Flow's `NodeToolbar`, drawn only for the Resource that is
   * selected, so selecting the other Resource replaces one named menu with the other.
   */
  it('names its own Resource in each menu, drawn for the selected Resource alone', async () => {
    const session = mount();

    await selectResource('A');
    expect(await screen.findByRole('button', { name: 'Actions for Resource A' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Actions for Resource B' }),
    ).not.toBeInTheDocument();

    await selectResource('B');
    expect(await screen.findByRole('button', { name: 'Actions for Resource B' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Actions for Resource A' }),
    ).not.toBeInTheDocument();
    await settled(session);
  });

  /**
   * **Create Reference is a command about the Resource, so it lives on the Resource.**
   *
   * A Reference Resource is always created *from* its Target (ADR 0089), which is what
   * removes the Target-selection interaction entirely — the gesture is on the
   * Resource, so the Target is the Resource it was invoked on. It inherits this
   * menu's keyboard route rather than needing one invented, which is why it is
   * a row here and not a rail glyph or a bare shortcut.
   */
  it('creates a Reference Resource of the Resource whose menu ran the command', async () => {
    const session = mount();

    await selectResource('A');
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Create Reference' }));

    await waitFor(() => expect(resourceIds(session)).toHaveLength(3));
    const created = session.getState().working.resources[2];
    expect(created?.document).toEqual({ title: 'A', kind: 'reference', target: RESOURCE_ID });
    await settled(session);
  });

  /**
   * The Title is the Target's, copied once and independent thereafter, and the
   * caret is in it.
   *
   * ADR 0083 keeps the Target's name off the Resource front, so without the copy
   * the author has no on-canvas indication of what the Reference Resource points at beyond
   * the dotted border. Copying it *once* is what keeps the two ordinary
   * independent Titles afterwards.
   */
  it('continues in the new Reference Resource’s own Title editor, seeded from its Target', async () => {
    const session = mount();

    await selectResource('A');
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Create Reference' }));

    const editor = await screen.findByRole('textbox', { name: 'Resource title' });
    expect(editor).toHaveValue('A');
    expect(editor).toHaveFocus();
    await settled(session);
  });

  /**
   * Placed at a fixed offset from the source, so the Reference Resource lands where the
   * author is looking.
   *
   * A free-position search was rejected: that is a placement algorithm, and ADR
   * 0086 put automatic arrangement behind an Edit and out of the render path
   * deliberately. The overlap is authored and the author drags it off.
   */
  it('places the Reference Resource at a fixed offset from the Resource it was made from', async () => {
    const session = mount();

    await selectResource('A');
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Create Reference' }));

    await waitFor(() => expect(resourceIds(session)).toHaveLength(3));
    const reference = session.getState().working.resources[2]!.id;
    const positions = session.getState().working.document.maps?.[0]?.positions;
    // Three quarters of a Resource on each axis, not half: at half the new Reference Resource's
    // centre lands exactly on the Target's bottom-right corner and the Target
    // takes every pointer event aimed at it (`REFERENCE_OFFSET_RATIO` in `resource-placement.ts`).
    expect(positions?.[reference]).toMatchObject({
      x: Math.round(RESOURCE_WIDTH * 0.75),
      y: Math.round(RESOURCE_HEIGHT * 0.75),
    });
    await settled(session);
  });

  it.each([
    {
      label: '4-times-sized',
      width: RESOURCE_WIDTH * 4,
      height: RESOURCE_HEIGHT * 4,
      closedX: Math.round(RESOURCE_WIDTH * 0.75),
    },
    {
      label: '6-times-sized',
      width: RESOURCE_WIDTH * 6,
      height: RESOURCE_HEIGHT * 6,
      closedX: Math.round(RESOURCE_WIDTH * 0.75),
    },
    {
      label: '300×400',
      width: 300,
      height: 400,
      // At or past the collapsed width at Close (ADR 0093), then Close reclaims
      // the width growth `300 - RESOURCE_WIDTH`.
      closedX: RESOURCE_WIDTH - (300 - RESOURCE_WIDTH),
    },
  ])(
    'keeps a Reference Resource separated after closing its $label Target',
    async ({ width, height, closedX }) => {
      const opened = spaceSnapshotSchema.parse({
        ...snapshot,
        document: {
          ...snapshot.document,
          maps: [
            {
              ...snapshot.document.maps?.[0],
              positions: {
                ...snapshot.document.maps?.[0]?.positions,
                [RESOURCE_ID]: {
                  x: 0,
                  y: 0,
                  open: true,
                  openSize: { width, height },
                },
              },
            },
          ],
        },
      });
      const session = mount(undefined, undefined, opened);
      await selectResource('A');
      fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource A' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Create Reference' }));
      const editor = await screen.findByRole('textbox', { name: 'Resource title' });
      fireEvent.keyDown(editor, { key: 'Escape' });
      const reference = session.getState().working.resources[2]!.id;
      // The Target is selected so its own toolbar is drawn. The Reference Resource
      // carries the Target's name, so the Target is selected by its id.
      await selectResourceById(RESOURCE_ID);
      fireEvent.click(await screen.findByRole('button', { name: 'Close Resource A' }));
      await waitFor(() => {
        const positions = session.getState().working.document.maps?.[0]?.positions;
        expect(positions?.[RESOURCE_ID]?.open).toBe(false);
        // Close reclaims the width `createReferenceFrom` added ahead of the
        // collapsed step and nothing else: the Reference Resource is clear of the
        // Target on `x`, so that is its one room axis (ADR 0093). It stays below
        // the Closed Target by the height growth it keeps.
        const heightGrowth = height - RESOURCE_HEIGHT;
        expect(positions?.[reference]?.x).toBe(closedX);
        expect(positions?.[reference]?.y).toBe(Math.round(RESOURCE_HEIGHT * 0.75) + heightGrowth);
        expect(positions?.[reference]?.y).toBeGreaterThanOrEqual(RESOURCE_HEIGHT);
      });
      await settled(session);
    },
  );

  /**
   * **Present and unavailable on a Reference Resource, not absent.**
   *
   * ADR 0070 forbids a Reference Resource of a Reference Resource, and a row that can never apply would
   * ordinarily not be one of that kind's commands. It is drawn and greyed
   * anyway, because a Reference Resource is otherwise a regular Resource: this row is where the
   * product says that referencing terminates.
   */
  it('offers Create Reference unavailable on a Reference Resource, because referencing terminates', async () => {
    const session = mount(undefined, undefined, withReference);

    await selectResource('A reference');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Actions for Resource A reference' }),
    );

    const row = await screen.findByRole('menuitem', { name: /^Create Reference/ });
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(resourceIds(session)).toHaveLength(3);
    await settled(session);
  });

  /**
   * Copy link to Target copies the Target's own Resource address — not a
   * within-Map one, and not this Reference Resource's own address, which is
   * what the two rows before it already offer. The Target is often absent from
   * this Map entirely (`.scratch/reference-thing/issues/02`).
   */
  it('offers a Reference Resource a Copy link to Target, copying the Target’s own address', async () => {
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

      await selectResource('A reference');
      fireEvent.click(
        await screen.findByRole('button', { name: 'Actions for Resource A reference' }),
      );
      fireEvent.click(await screen.findByRole('menuitem', { name: /^Copy link to Target/ }));

      await waitFor(() =>
        expect(written).toEqual([
          `https://space.test${productDestinationPath({ kind: 'resource', spaceId: SPACE_ID, resourceId: RESOURCE_ID })}`,
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

      await selectResource('A reference');
      fireEvent.click(
        await screen.findByRole('button', { name: 'Actions for Resource A reference' }),
      );
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
   * The Space Resource menu's own grouping grammar
   * (`.scratch/dock-menu-reorganisation/issues/04`): Create Reference on its own,
   * then Open in New Tab (Enter is absent here — this isolated single-Space
   * mount carries no `OpenSpacesContext`, so `spaces === null` withholds it;
   * `enter-space-resource.test.tsx` holds the full order with Enter present),
   * then the three copy links, then Remove from Map and Delete from
   * Space sharing the trailing destructive group — one separator between
   * each. Rename is absent, which this exact-order assertion would catch as
   * an extra row if it were not.
   */
  it('groups Create Reference, Connect, Open in New Tab, the copy links, then Remove and Delete on a Space Resource', async () => {
    const session = mount(undefined, undefined, withSpaceResource);

    await selectResource('A space');
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource A space' }));
    const menu = await screen.findByRole('menu');

    expectMenuGroups(menu, [
      ['Create Reference'],
      ['Connect to Resource'],
      ['Open in New Tab'],
      ['Copy link to Resource in Map', 'Copy link to Resource', 'Copy link to Space'],
      ['Remove from Map', 'Delete from Space'],
    ]);
    await settled(session);
  });

  /**
   * Removing Rename from the Space Resource menu must not take on-front Title
   * editing with it — the two are separate seams, and this presses the
   * front's own control directly rather than through the menu.
   */
  it('still edits a Space Resource’s Title on the Resource front, not through the menu', async () => {
    const session = mount(undefined, undefined, withSpaceResource);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Title A space' }));
    const editor = screen.getByRole('textbox', { name: 'Resource title' });
    expect(editor).toHaveFocus();
    fireEvent.change(editor, { target: { value: 'Renamed on the front' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    expect(await screen.findByRole('heading', { name: 'Renamed on the front' })).toBeVisible();
    expect(
      session.getState().working.resources.find((resource) => resource.id === SPACE_RESOURCE_ID)
        ?.document,
    ).toMatchObject({ title: 'Renamed on the front' });
    await settled(session);
  });

  /**
   * Delete from Space is a leaving action on every Resource, including a Space
   * Resource. Filtering the rail down to Remove from Map alone would withdraw
   * a command that is still available (`availability.deleteResource`).
   */
  it('offers Delete from Space on a Space Resource when deletion is available', async () => {
    const session = mount(undefined, undefined, withSpaceResource);

    await selectResource('A space');
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource A space' }));

    expect(await screen.findByRole('menuitem', { name: 'Delete from Space' })).toBeVisible();
    expect(await screen.findByRole('menuitem', { name: 'Remove from Map' })).toBeVisible();
    await settled(session);
  });

  it('offers a Space Resource the target Space’s address and opens it independently', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(window);
    const session = mount(undefined, undefined, withSpaceResource);

    await selectResource('A space');
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource A space' }));
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

  it('creates a Reference Resource from a Space Resource', async () => {
    const session = mount(undefined, undefined, withSpaceResource);
    await selectResource('A space');
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource A space' }));
    const row = await screen.findByRole('menuitem', { name: 'Create Reference' });
    expect(row).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(row);
    expect(resourceIds(session)).toHaveLength(4);
    expect(session.getState().working.resources.at(-1)?.document).toMatchObject({
      kind: 'reference',
      title: 'A space',
    });
    await settled(session);
  });

  /**
   * **Deleting asks first, and the question names what it destroys.**
   *
   * The rail's Delete runs on the press otherwise, and a Resource's deletion cannot
   * be taken back: V1 has no undo, and a Space Resource owns its target's lifetime
   * together with every other reference to it, so the same press can reach work
   * in Spaces that are not on screen (ADR 0074). The Sidebar's footer carried
   * this `AlertDialog` and the Sidebar has gone; the dialog moved to the App
   * root rather than into the menu, because the menu closes on the press and
   * would take the question with it.
   *
   * The claim this replaced compared two surfaces running one Edit. There is one
   * surface now — a Resource's commands are the Resource's (ADR 0073) — so what is left
   * to pin is that the one route asks, and that answering it runs the deletion.
   */
  it('asks before deleting, and deletes when the question is answered', async () => {
    const session = mount(
      { selection: MAP_ID, resourceId: RESOURCE_ID, graphId: null, presentationResourceId: null },
      // The location the Resource is addressed from: the opening and the pathname
      // the browser location then follows are one position in production, so
      // they are one here.
      recordingHistory(
        productDestinationPath({
          kind: 'map-resource',
          spaceId: SPACE_ID,
          mapId: MAP_ID,
          resourceId: RESOURCE_ID,
        }),
      ),
    );

    await selectResource('A');
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete from Space' }));

    // The press asked rather than deleted, and the question says what goes.
    const question = await screen.findByRole('alertdialog', { name: 'Delete from Space A?' });
    expect(question).toHaveTextContent('every Map that contains it');
    expect(resourceIds(session)).toEqual([RESOURCE_ID, OTHER_RESOURCE_ID]);

    fireEvent.click(within(question).getByRole('button', { name: 'Delete from Space' }));

    await waitFor(() => expect(resourceIds(session)).toEqual([OTHER_RESOURCE_ID]));
    await settled(session);
  });

  /**
   * **The press asked, so the press does not say it deleted.**
   *
   * `EntityActionsMenu` holds a reporting item's menu open and swaps its label
   * to the word the outcome names — machinery built for a command that *runs*
   * on the press. This one only raises a question, so `done` on the press said
   * "Resource deleted" beside a dialog still asking whether to, and announced it to
   * a reader who then pressed Cancel. The deletion's own outcome is the canvas's
   * to report, and its refusal the confirmation's.
   */
  it('does not report a deletion while the question is still asking', async () => {
    const session = mount();

    await selectResource('A');
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete from Space' }));
    await screen.findByRole('alertdialog', { name: 'Delete from Space A?' });

    expect(screen.queryByText('Resource deleted')).not.toBeInTheDocument();
    await settled(session);
  });

  /**
   * The question names the Resource by its **name** (ADR 0083).
   *
   * A Resource's Title is one or more Title Lines and the front draws the ladder;
   * a dialog title is a sentence, and a line break arriving in one draws as a
   * broken-looking label rather than as an error. This is the claim the
   * retired Sidebar's own footer used to hold.
   */
  it('names the Resource in the question by its name and not by its whole Title', async () => {
    const session = mount();
    const laddered = 'A\nAnd read this next';
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Title A' }));
    const input = screen.getByRole('textbox', { name: 'Resource title' });
    fireEvent.change(input, { target: { value: laddered } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await selectResource('A');
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete from Space' }));

    const question = await screen.findByRole('alertdialog', { name: 'Delete from Space A?' });
    expect(question).not.toHaveTextContent('And read this next');
    fireEvent.click(within(question).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await settled(session);
  });

  /** The other answer, which is the one that makes the question a question. */
  it('leaves the Resource alone when the question is cancelled', async () => {
    const session = mount();

    await selectResource('A');
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Resource A' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete from Space' }));
    const question = await screen.findByRole('alertdialog', { name: 'Delete from Space A?' });
    fireEvent.click(within(question).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(resourceIds(session)).toEqual([RESOURCE_ID, OTHER_RESOURCE_ID]);
    await settled(session);
  });
});

/** Asserted through the Actions menu, not Edge Authoring, to hold the menu-to-Edit wiring. */
describe('Connect to Resource in a Resource’s Actions menu', () => {
  const edgesOf = (session: SpaceSession) =>
    session.getState().working.document.maps?.[0]?.graphs[0]?.edges ?? [];

  /** A third Resource in the Space that the Map does not place. */
  const withUnplaced: SpaceSnapshot = spaceSnapshotSchema.parse({
    ...snapshot,
    resources: [
      ...snapshot.resources,
      { id: REFERENCE_ID, document: { title: 'C', kind: 'markdown', body: 'C source' } },
    ],
  });

  const openConnect = async (name: string) => {
    await selectResource(name);
    fireEvent.click(await screen.findByRole('button', { name: `Actions for Resource ${name}` }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Connect to Resource' }));
    return await screen.findByRole('dialog', { name: `Connect Resource ${name}` });
  };

  /** A rail Connect command would cover the closed header, where a Resource is grabbed to drag. */
  it('is not a command on the rail', async () => {
    const session = mount();

    await selectResource('A');
    await screen.findByRole('button', { name: 'Actions for Resource A' });
    expect(screen.queryByRole('button', { name: /^Connect Resource / })).not.toBeInTheDocument();
    await settled(session);
  });

  it('lists the Map’s placed Resources bar this one, and draws the Edge to the chosen one', async () => {
    const session = mount(undefined, undefined, withUnplaced);

    const list = await openConnect('A');

    expect(
      within(list)
        .getAllByRole('button', { name: /^Connect to / })
        .map((row) => row.getAttribute('aria-label')),
    ).toEqual(['Connect to B', 'Connect to a new Resource']);

    fireEvent.click(within(list).getByRole('button', { name: 'Connect to B' }));

    expect(edgesOf(session)).toEqual([{ from: RESOURCE_ID, to: OTHER_RESOURCE_ID }]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await settled(session);
  });

  it('keeps an Edge the Graph already has listed, unavailable, with the reason', async () => {
    const session = mount();
    fireEvent.click(within(await openConnect('A')).getByRole('button', { name: 'Connect to B' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const row = within(await openConnect('A')).getByRole('button', { name: 'Connect to B' });

    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).toHaveAccessibleDescription('These Resources are already connected in this Graph.');
    await settled(session);
  });

  it('creates a Markdown Resource beside this one and connects to it', async () => {
    const session = mount();

    fireEvent.click(
      within(await openConnect('A')).getByRole('button', { name: 'Connect to a new Resource' }),
    );

    const created = session
      .getState()
      .working.resources.find(({ id }) => id !== RESOURCE_ID && id !== OTHER_RESOURCE_ID);
    expect(created?.document.kind).toBe('markdown');
    expect(edgesOf(session)).toEqual([{ from: RESOURCE_ID, to: created?.id }]);
    await settled(session);
  });

  /** The list is canvas state, not the rail's, so the canvas must dispose of it. */
  it('closes when presenting withdraws authoring, and does not reopen when it returns', async () => {
    const withEdge: SpaceSnapshot = spaceSnapshotSchema.parse({
      ...snapshot,
      document: {
        ...snapshot.document,
        maps: [
          {
            ...snapshot.document.maps?.[0],
            graphs: [
              {
                id: GRAPH_ID,
                title: 'Graph',
                edges: [{ from: RESOURCE_ID, to: OTHER_RESOURCE_ID }],
              },
            ],
          },
        ],
      },
    });
    let composed: ComposedApp | undefined;
    const session = mount(undefined, undefined, withEdge, (app) => {
      composed = app;
    });
    await openConnect('A');

    act(() => composed?.navigation.present());
    expect(composed?.navigation.getState().mode).toBe('presenting');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Connect Resource A' })).not.toBeInTheDocument(),
    );

    act(() => composed?.navigation.exitPresenting());
    await screen.findByRole('button', { name: 'Actions for Resource A' });
    expect(screen.queryByRole('dialog', { name: 'Connect Resource A' })).not.toBeInTheDocument();
    await settled(session);
  });

  it('closes when another Map is selected, although that Map places the same Resource', async () => {
    const OTHER_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000b');
    const twoMaps: SpaceSnapshot = spaceSnapshotSchema.parse({
      ...snapshot,
      document: {
        ...snapshot.document,
        maps: [
          ...(snapshot.document.maps ?? []),
          {
            id: OTHER_MAP_ID,
            title: 'Other Map',
            kind: 'positioned',
            positions: {
              [RESOURCE_ID]: { x: 0, y: 0, open: false },
              [OTHER_RESOURCE_ID]: { x: 400, y: 0, open: false },
            },
            graphs: [{ id: GRAPH_ID_2, title: 'Graph', edges: [] }],
          },
        ],
      },
    });
    let composed: ComposedApp | undefined;
    const session = mount(undefined, undefined, twoMaps, (app) => {
      composed = app;
    });
    await openConnect('A');

    act(() => composed?.navigation.selectMap(OTHER_MAP_ID));

    await screen.findByRole('button', { name: 'Actions for Resource A' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Connect Resource A' })).not.toBeInTheDocument(),
    );
    await settled(session);
  });

  it('closes on Escape back to the Actions trigger it was opened from', async () => {
    const session = mount();

    const list = await openConnect('A');
    fireEvent.keyDown(within(list).getByRole('textbox', { name: 'Search resources' }), {
      key: 'Escape',
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Actions for Resource A' })).toHaveFocus(),
    );
    await settled(session);
  });
});

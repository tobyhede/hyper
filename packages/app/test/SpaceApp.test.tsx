import { act, fireEvent, render, screen, waitFor, type RenderResult } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  GRID_SPACE_VIEW_ID,
  spaceSnapshotSchema,
  uuidSchema,
  type SpaceSnapshot,
} from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { productDestinationPath } from '@project/http';
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  openSpaceSession,
  type SpaceSession,
} from '@project/persistence';
import { mountSpaceApp } from '../src/SpaceApp';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const MISSING_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const OWNED_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const OUTSIDE_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const OTHER_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');

const snapshot = (title: string, cardTitle: string, x: number, y: number): SpaceSnapshot =>
  spaceSnapshotSchema.parse({
    id: SPACE_ID,
    document: {
      version: 1,
      title,
      layouts: [
        {
          id: LAYOUT_ID,
          title: 'Layout',
          kind: 'positioned',
          positions: { [CARD_ID]: { x, y, open: false } },
          // A Layout owns at least one Graph (ADR 0040), and one Card has
          // nothing to connect — so the Graph it opens on holds no Edges.
          graphs: [{ id: OWNED_GRAPH_ID, title: 'Graph', edges: [] }],
        },
      ],
      defaultRenderer: LAYOUT_ID,
    },
    cards: [
      {
        id: CARD_ID,
        document: { title: cardTitle, kind: 'markdown', body: cardTitle },
      },
    ],
  });

/**
 * The same Space with its Layout owning a Graph that reaches a Card the Space
 * does not hold — the unloadable snapshot every test below is about.
 *
 * An Edge is closed over the Cards its owning Layout positions (ADR 0040), so
 * the dangling endpoint lives inside the Layout rather than beside it, and
 * intake names it there.
 */
const withDanglingGraph = (base: SpaceSnapshot, title: string): SpaceSnapshot => ({
  ...base,
  document: {
    ...base.document,
    title,
    layouts: (base.document.layouts ?? []).map((layout) => ({
      ...layout,
      graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [{ from: CARD_ID, to: MISSING_CARD_ID }] }],
      // Named outright rather than carried through: replacing the owned Graphs
      // would otherwise strand an inherited `activeGraph` on an id this Layout
      // no longer holds, and the snapshot would be unloadable for two reasons
      // where these tests are about one.
      activeGraph: GRAPH_ID,
    })),
  },
});

const runtime = (value: SpaceSnapshot) => {
  const loaded = loadSpaceSnapshot(value);
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join('\n'));
  return loaded.space;
};

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

describe('Space app conflict recovery', () => {
  it('replaces the visible runtime and editor placement when remote state is accepted', async () => {
    const local = snapshot('Local space', 'Local card', 10, 20);
    const remote = snapshot('Remote space', 'Remote card', 900, 700);
    const backend = new MemorySpaceBackend(SPACE_ID, [
      { snapshot: remote, revision: 4n, exportedRevision: null },
    ]);
    const session = openSpaceSession(backend, {
      snapshot: local,
      revision: 3n,
      exportedRevision: null,
    });
    session.submit(local);
    await new Promise<void>((resolve) => {
      if (session.getState().persistence.kind === 'conflicted') resolve();
      else {
        const unsubscribe = session.subscribe(() => {
          if (session.getState().persistence.kind !== 'conflicted') return;
          unsubscribe();
          resolve();
        });
      }
    });

    let view: RenderResult | undefined;
    mountSpaceApp({ space: runtime(local), spaceSession: session }, (app) => {
      if (view === undefined) view = render(app);
      else view.rerender(app);
    });
    expect(screen.getByText('Local space')).toBeVisible();
    expect(screen.getByRole('alertdialog', { name: 'Changes conflict' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Keep local and retry' })).toBeVisible();

    fireEvent.click(screen.getByTestId('persistence-accept-remote'));

    expect(await screen.findByText('Remote space')).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Remote card' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Local card' })).not.toBeInTheDocument();
    expect(session.getState().working).toEqual(remote);
    const cardNode = screen
      .getByRole('heading', { name: 'Remote card' })
      .closest('.react-flow__node');
    expect(cardNode).toHaveStyle({ transform: 'translate(900px,700px)' });
  });

  /**
   * A conflicted session whose remote snapshot does not load. Mounted, with the
   * accept already clicked, because both tests below assert on what that leaves
   * behind.
   */
  const refusedRemote = async (): Promise<{ local: SpaceSnapshot; session: SpaceSession }> => {
    const local = snapshot('Local space', 'Local card', 10, 20);
    const dangling = withDanglingGraph(local, 'Remote space');
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'conflict',
      conflicts: [
        {
          spaceId: SPACE_ID,
          current: { snapshot: dangling, revision: 4n, exportedRevision: null },
        },
      ],
    });
    const session = openSpaceSession(new MemorySpaceBackend(SPACE_ID, [], control), {
      snapshot: local,
      revision: 3n,
      exportedRevision: null,
    });
    session.submit(local);
    await new Promise<void>((resolve) => {
      const unsubscribe = session.subscribe(() => {
        if (session.getState().persistence.kind !== 'conflicted') return;
        unsubscribe();
        resolve();
      });
    });

    let view: RenderResult | undefined;
    mountSpaceApp({ space: runtime(local), spaceSession: session }, (app) => {
      if (view === undefined) view = render(app);
      else view.rerender(app);
    });

    fireEvent.click(screen.getByTestId('persistence-accept-remote'));
    return { local, session };
  };

  /**
   * `acceptRemote` is an `onClick` handler (`App.tsx`), and React error
   * boundaries do not catch throws from event handlers — so a throw here escapes
   * to the window rather than reaching `SpaceAppFailure`, and the session has
   * *already* published the unloadable snapshot as settled working state. The
   * page then still shows the stale local Space with no conflict left to
   * resolve and no way back. Validate the remote snapshot before accepting it.
   */
  it('refuses an unloadable remote snapshot instead of accepting it into the session', async () => {
    const { local, session } = await refusedRemote();

    // In the alert's own text, not an attribute: `role="alert"` announces what
    // it contains, and a reason a pointer has to hover to reach is one a
    // keyboard or touch user never gets.
    const refusal = await screen.findByTestId('persistence-remote-refused');
    expect(refusal).toHaveTextContent('The remote space is invalid and was not accepted');
    expect(refusal).toHaveTextContent(MISSING_CARD_ID);
    expect(session.getState().working).toEqual(local);
    expect(session.getState().persistence.kind).toBe('conflicted');
  });

  /**
   * A refusal explains one remote snapshot. `resolveConflict` commits again
   * without leaving the conflicted state, so the next conflict can arrive
   * carrying a different — and loadable — remote. Holding the old sentence over
   * it tells the author their work cannot be replaced when in fact it can.
   */
  it('drops a refusal once a different remote snapshot is the one in conflict', async () => {
    const local = snapshot('Local space', 'Local card', 10, 20);
    const dangling = withDanglingGraph(local, 'Broken remote');
    const loadable = snapshot('Remote space', 'Remote card', 900, 700);
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'conflict',
      conflicts: [
        {
          spaceId: SPACE_ID,
          current: { snapshot: dangling, revision: 4n, exportedRevision: null },
        },
      ],
    });
    control.queueResult({
      kind: 'conflict',
      conflicts: [
        {
          spaceId: SPACE_ID,
          current: { snapshot: loadable, revision: 5n, exportedRevision: null },
        },
      ],
    });
    const session = openSpaceSession(new MemorySpaceBackend(SPACE_ID, [], control), {
      snapshot: local,
      revision: 3n,
      exportedRevision: null,
    });
    session.submit(local);
    await waitFor(() => expect(session.getState().persistence.kind).toBe('conflicted'));

    let view: RenderResult | undefined;
    mountSpaceApp({ space: runtime(local), spaceSession: session }, (app) => {
      if (view === undefined) view = render(app);
      else view.rerender(app);
    });
    fireEvent.click(screen.getByTestId('persistence-accept-remote'));
    expect(await screen.findByTestId('persistence-remote-refused')).toBeVisible();

    // `act` around the synchronous publication only, and the wait outside it.
    // Nesting `waitFor` inside `act` puts the commit's asynchronous conflict
    // reply inside the window where Testing Library sets the act environment
    // false on purpose, and React then warns about the very flush it was asked
    // for.
    act(() => {
      session.resolveConflict(local);
    });
    await waitFor(() => {
      const { persistence } = session.getState();
      expect(persistence.kind === 'conflicted' ? persistence.current?.revision : null).toBe(5n);
    });

    await waitFor(() =>
      expect(screen.queryByTestId('persistence-remote-refused')).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('persistence-accept-remote')).toBeVisible();
  });

  /**
   * Refusing is not a failure of the Space app: the local work is intact and the
   * conflict is still the session's state, so the page that owns both has to
   * stay. Reporting through the failure panel unmounted the whole tree, which
   * left the author reading why their unsaved work could not be replaced on a
   * screen that no longer showed it — and no control to do anything else.
   */
  it('keeps the conflicted Space on screen when it refuses the remote snapshot', async () => {
    await refusedRemote();

    expect(screen.getByText('Local space')).toBeVisible();
    // Awaited because placement is asynchronous — the Card arrives with the
    // placement, not with the mount.
    expect(await screen.findByRole('heading', { name: 'Local card', hidden: true })).toBeVisible();
    expect(screen.getByTestId('persistence-accept-remote')).toBeVisible();
    expect(screen.queryByTestId('space-app-failure')).not.toBeInTheDocument();
  });
});

describe('Space app permanent save refusal', () => {
  it('explains the server refusal and returns the author to their local work', async () => {
    const local = snapshot('Local space', 'Local card', 10, 20);
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'permanent-failure',
      code: 'invalid-commit',
      message: 'Graph names an absent card',
    });
    const session = openSpaceSession(new MemorySpaceBackend(SPACE_ID, [], control), {
      snapshot: local,
      revision: 3n,
      exportedRevision: null,
    });
    session.submit(local);
    await waitFor(() => expect(session.getState().persistence.kind).toBe('rejected'));

    let view: RenderResult | undefined;
    mountSpaceApp({ space: runtime(local), spaceSession: session }, (app) => {
      if (view === undefined) view = render(app);
      else view.rerender(app);
    });

    expect(screen.getByRole('alertdialog', { name: 'Changes couldn’t be saved' })).toBeVisible();
    expect(screen.getByText('Graph names an absent card')).toBeVisible();

    fireEvent.click(screen.getByTestId('persistence-rejection-continue'));

    await waitFor(() =>
      expect(
        screen.queryByRole('alertdialog', { name: 'Changes couldn’t be saved' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Persistence rejected' })).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Local card' })).toBeVisible();
    expect(session.getState().persistence.kind).toBe('rejected');
  });
});

describe('Space app failure reporting', () => {
  it('opens an addressed Graph as navigation context without editing the Space', async () => {
    const addressed = {
      ...snapshot('Space', 'Card', 10, 20),
      document: {
        ...snapshot('Space', 'Card', 10, 20).document,
        layouts: snapshot('Space', 'Card', 10, 20).document.layouts?.map((layout) => ({
          ...layout,
          graphs: [...layout.graphs, { id: GRAPH_ID, title: 'Addressed', edges: [] }],
        })),
      },
    };
    const session = openSpaceSession(new MemorySpaceBackend(SPACE_ID), {
      snapshot: addressed,
      revision: 0n,
      exportedRevision: null,
    });

    mountSpaceApp({ space: runtime(addressed), spaceSession: session }, (app) => render(app), {
      selection: LAYOUT_ID,
      cardId: null,
      graphId: GRAPH_ID,
      presentationCardId: null,
    });

    expect(await screen.findByRole('button', { name: 'Present' })).toBeVisible();
    expect(session.getState().working).toEqual(addressed);
  });

  it.each([
    'Copy link to Card',
    'Copy link in this Space View',
    'Copy link to Graph',
    'Copy link to Graph in this Space View',
  ])(
    'reports a rejected clipboard write from %s without unmounting the Space',
    async (copyAction) => {
      const valid = snapshot('Space', 'Card', 10, 20);
      const session = openSpaceSession(new MemorySpaceBackend(SPACE_ID), {
        snapshot: valid,
        revision: 0n,
        exportedRevision: null,
      });
      const clipboardFailure = new Error('Clipboard permission denied');
      const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: vi.fn().mockRejectedValue(clipboardFailure) },
      });

      try {
        mountSpaceApp({ space: runtime(valid), spaceSession: session }, (app) => render(app), {
          selection: LAYOUT_ID,
          cardId: CARD_ID,
          graphId: null,
          presentationCardId: null,
        });

        fireEvent.click(await screen.findByRole('button', { name: copyAction }));

        const report = await screen.findByRole('alert');
        expect(report).toHaveTextContent('Link not copied');
        expect(report).toHaveTextContent('The browser refused clipboard access.');
        expect(screen.getByText('Space')).toBeVisible();
      } finally {
        if (previousClipboard === undefined) Reflect.deleteProperty(navigator, 'clipboard');
        else Object.defineProperty(navigator, 'clipboard', previousClipboard);
      }
    },
  );

  /**
   * The snapshot is already unloadable when the Space app is composed, so
   * nothing has rendered yet: `createApp` builds Navigation, which resolves the
   * renderer the Space opens in against the session's working Space, and that
   * throws before there is a tree for the error boundary to catch it in. What is
   * pinned is that `mountSpaceApp` reports it anyway rather than throwing at
   * its caller and leaving a blank page.
   */
  it('names a working snapshot that stopped loading instead of blanking the page', () => {
    const valid = snapshot('Space', 'Card', 10, 20);
    const dangling = withDanglingGraph(valid, valid.document.title);
    const session = openSpaceSession(new MemorySpaceBackend(SPACE_ID), {
      snapshot: dangling,
      revision: 0n,
      exportedRevision: null,
    });
    // React reports a boundary-caught error to `console.error` as well as to the
    // boundary. The report is the point; the duplicate is noise this test owns.
    const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() =>
      mountSpaceApp({ space: runtime(valid), spaceSession: session }, (app) => {
        render(app);
      }),
    ).not.toThrow();

    expect(screen.getByTestId('space-app-failure')).toHaveTextContent(MISSING_CARD_ID);
    expect(screen.getByRole('heading', { name: 'Unable to open this space' })).toBeVisible();
    // Logged as well as reported: nothing else traces this path. React logs the
    // boundary's own catch, so only this one would otherwise leave a developer a
    // sentence and an empty console.
    expect(reported).toHaveBeenCalledWith('Composing the Space app failed', expect.any(Error));
  });

  /**
   * The other path to the same sentence, and the one the error boundary itself
   * is for: a Space app that composed and mounted, whose snapshot then stops
   * passing intake under it. `App` re-derives the whole aggregate on every
   * render, so the throw lands in the boundary rather than in `mountSpaceApp`.
   */
  it('names a working snapshot that stops loading under a mounted Space app', () => {
    const valid = snapshot('Space', 'Card', 10, 20);
    const session = openSpaceSession(new MemorySpaceBackend(SPACE_ID), {
      snapshot: valid,
      revision: 0n,
      exportedRevision: null,
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mountSpaceApp({ space: runtime(valid), spaceSession: session }, (app) => {
      render(app);
    });

    // Written straight onto the session, past the validation every authoring
    // path performs first: reaching this state means an invariant has already
    // broken, and what is pinned is that it reports rather than blanking.
    act(() => {
      session.submit(withDanglingGraph(valid, valid.document.title));
    });

    expect(screen.getByTestId('space-app-failure')).toHaveTextContent(MISSING_CARD_ID);
    expect(screen.getByRole('heading', { name: 'Unable to open this space' })).toBeVisible();
  });
});

describe('Space app Cards drawer', () => {
  it('opens once for the client whose working load created the empty Layout', () => {
    const base = snapshot('Space', 'Card', 10, 20);
    const stored = { snapshot: base, revision: 1n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend(SPACE_ID, [stored]), stored);

    mountSpaceApp(
      { space: runtime(base), spaceSession: session, initialization: 'created-layout' },
      (app) => render(app),
    );

    expect(screen.getByRole('dialog', { name: 'Cards' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cards' }));
    expect(screen.queryByRole('dialog', { name: 'Cards' })).not.toBeInTheDocument();
  });

  it('opens an accessible empty drawer for an initialized zero-Card Space', () => {
    const seeded = snapshot('Space', 'Card', 10, 20);
    const empty: SpaceSnapshot = {
      ...seeded,
      cards: [],
      document: {
        ...seeded.document,
        layouts: seeded.document.layouts?.map((layout) => ({ ...layout, positions: {} })),
      },
    };
    const stored = { snapshot: empty, revision: 1n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend(SPACE_ID, [stored]), stored);

    mountSpaceApp(
      { space: runtime(empty), spaceSession: session, initialization: 'created-layout' },
      (app) => render(app),
    );

    expect(screen.getByRole('dialog', { name: 'Cards' })).toHaveTextContent(
      'This Space has no Cards.',
    );
    const addCard = screen.getByRole('button', { name: 'Add Card' });
    expect(addCard).toBeEnabled();
    fireEvent.click(addCard);
    expect(session.getState().working.cards).toHaveLength(1);
  });

  it('adds an empty selected Layout and reveals its existing Cards once', () => {
    const base = snapshot('Space', 'Card', 10, 20);
    const stored = { snapshot: base, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend(SPACE_ID, [stored]), stored);

    mountSpaceApp({ space: runtime(base), spaceSession: session }, (app) => render(app));

    fireEvent.click(screen.getByRole('button', { name: 'Add Layout' }));

    expect(session.getState().working.document.layouts).toHaveLength(2);
    expect(session.getState().working.document.layouts?.[1]?.positions).toEqual({});
    expect(session.getState().working.document.layouts?.[1]?.graphs).toHaveLength(1);
    expect(screen.getByTestId('selected-canvas')).toHaveTextContent('Layout 1');
    expect(screen.getByRole('dialog', { name: 'Cards' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Cards' }));
    expect(screen.queryByRole('dialog', { name: 'Cards' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add Card' }));
    expect(screen.queryByRole('dialog', { name: 'Cards' })).not.toBeInTheDocument();
  });

  it('offers Layout rename and delete actions and explains why the last cannot be deleted', async () => {
    const base = snapshot('Space', 'Card', 10, 20);
    const stored = { snapshot: base, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend(SPACE_ID, [stored]), stored);

    mountSpaceApp({ space: runtime(base), spaceSession: session }, (app) => render(app));

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Space View Layout' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete Layout' }));
    expect(screen.getByRole('alert')).toHaveTextContent('A Space keeps at least one Layout.');

    fireEvent.click(screen.getByRole('button', { name: 'Add Layout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cards' }));
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Space View Layout 1' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const editor = await screen.findByRole('textbox', { name: 'Layout name' });
    fireEvent.change(editor, { target: { value: 'Workshop' } });
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(screen.getByTestId('selected-canvas')).toHaveTextContent('Workshop');

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Space View Workshop' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete Layout' }));
    expect(session.getState().working.document.layouts).toHaveLength(1);
    expect(session.getState().working.cards).toEqual(base.cards);
    expect(screen.getByTestId('selected-canvas')).toHaveTextContent('Layout');
  });

  /**
   * The refusal is drawn under Add Layout, which every canvas selection shows.
   * A Delete Layout refusal that outlived its own renderer therefore reappeared
   * as the next one's, explaining a Layout the reader had just left.
   */
  it('clears a Layout management refusal when the canvas selection changes', async () => {
    const base = snapshot('Space', 'Card', 10, 20);
    const stored = { snapshot: base, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend(SPACE_ID, [stored]), stored);

    mountSpaceApp({ space: runtime(base), spaceSession: session }, (app) => render(app));

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Space View Layout' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete Layout' }));
    expect(screen.getByRole('alert')).toHaveTextContent('A Space keeps at least one Layout.');

    fireEvent.click(screen.getByRole('button', { name: 'Grid' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the Cards drawer closed after the reader closes it, even once the Space gains another Card', async () => {
    const base = snapshot('Space', 'Card', 10, 20);
    const local: SpaceSnapshot = {
      ...base,
      cards: [
        ...base.cards,
        { id: OUTSIDE_CARD_ID, document: { title: 'Outside card', kind: 'markdown', body: '' } },
      ],
    };
    const stored = { snapshot: local, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend(SPACE_ID, [stored]), stored);

    mountSpaceApp({ space: runtime(local), spaceSession: session }, (app) => render(app), {
      selection: LAYOUT_ID,
      cardId: OUTSIDE_CARD_ID,
      graphId: null,
      presentationCardId: null,
    });

    expect(screen.getByRole('button', { name: 'Add Outside card to Layout' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Cards' }));
    expect(
      screen.queryByRole('button', { name: 'Add Outside card to Layout' }),
    ).not.toBeInTheDocument();

    const addCardButton = await waitFor(() => {
      const button = screen.getByRole('button', { name: 'Add Card' });
      expect(button).toBeEnabled();
      return button;
    });
    const before = session.getState().working.cards.length;
    fireEvent.click(addCardButton);
    expect(session.getState().working.cards.length).toBe(before + 1);

    expect(
      screen.queryByRole('button', { name: 'Add Outside card to Layout' }),
    ).not.toBeInTheDocument();
  });

  it('reveals the addressed Card again in a newly adopted default Layout that omits it, even though the same Card was already addressed once', async () => {
    const base = snapshot('Space', 'Card', 10, 20);
    const local: SpaceSnapshot = {
      ...base,
      document: {
        ...base.document,
        layouts: [
          ...(base.document.layouts ?? []),
          {
            id: OTHER_LAYOUT_ID,
            title: 'Other Layout',
            kind: 'positioned',
            positions: {},
            graphs: [{ id: OTHER_GRAPH_ID, title: 'Other Graph', edges: [] }],
          },
        ],
        // The canonical Card link below resolves to the Space's default
        // renderer, so this second navigation lands on the Layout that omits
        // the Card rather than the one it started on.
        defaultRenderer: OTHER_LAYOUT_ID,
      },
    };
    const stored = { snapshot: local, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend(SPACE_ID, [stored]), stored);

    mountSpaceApp({ space: runtime(local), spaceSession: session }, (app) => render(app), {
      selection: LAYOUT_ID,
      cardId: CARD_ID,
      graphId: null,
      presentationCardId: null,
    });

    // Card is a member of the selected Layout, so there is nothing to reveal yet.
    expect(screen.queryByRole('button', { name: 'Add Card to Layout' })).not.toBeInTheDocument();

    // The canonical Card link carries no Space View of its own — it opens
    // wherever the Space's default renderer is, which is now the Layout that
    // omits this Card.
    window.history.replaceState(
      null,
      '',
      productDestinationPath({ kind: 'card', spaceId: SPACE_ID, cardId: CARD_ID }),
    );
    fireEvent(window, new PopStateEvent('popstate'));

    expect(await screen.findByTestId('selected-canvas')).toHaveTextContent('Other Layout');
    expect(await screen.findByRole('button', { name: 'Add Card to Layout' })).toBeVisible();
  });
});

describe('explicit Layout creation', () => {
  it('keeps Add Layout available while a Computed View is replacing its placement', async () => {
    const local = spaceSnapshotSchema.parse({
      id: SPACE_ID,
      document: {
        version: 1,
        title: 'Computed space',
        layouts: [],
        defaultRenderer: GRID_SPACE_VIEW_ID,
      },
      cards: [
        {
          id: CARD_ID,
          document: { title: 'Card', kind: 'markdown', body: '' },
        },
      ],
    });
    const stored = { snapshot: local, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend([stored]), stored);

    mountSpaceApp({ space: runtime(local), spaceSession: session }, (app) => render(app));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Layout' })).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Add Card' })).not.toBeInTheDocument();

    act(() => {
      session.submit({
        ...local,
        cards: [
          ...local.cards,
          {
            id: OUTSIDE_CARD_ID,
            document: { title: 'Another card', kind: 'markdown', body: '' },
          },
        ],
      });
    });

    expect(screen.getByRole('button', { name: 'Add Layout' })).toBeEnabled();
  });
});

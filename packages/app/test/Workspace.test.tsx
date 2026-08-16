import { act, fireEvent, render, screen, waitFor, type RenderResult } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  openSpaceSession,
  type SpaceSession,
} from '@project/persistence';
import { mountWorkspace } from '../src/Workspace';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const MISSING_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const OWNED_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');

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
          positions: { [CARD_ID]: { x, y } },
          // A Layout owns at least one Graph (ADR 0040), and one Card has
          // nothing to connect — so the Graph it opens on holds no Edges.
          graphs: [{ id: OWNED_GRAPH_ID, title: 'Graph', edges: [] }],
        },
      ],
      defaultView: LAYOUT_ID,
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

describe('Workspace conflict recovery', () => {
  it('replaces the visible runtime and editor placement when remote state is accepted', async () => {
    const local = snapshot('Local workspace', 'Local card', 10, 20);
    const remote = snapshot('Remote workspace', 'Remote card', 900, 700);
    const backend = new MemorySpaceBackend([
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
    mountWorkspace({ space: runtime(local), spaceSession: session }, (app) => {
      if (view === undefined) view = render(app);
      else view.rerender(app);
    });
    expect(screen.getByText('Local workspace')).toBeVisible();
    expect(screen.getByRole('alertdialog', { name: 'Changes conflict' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save' })).toBeVisible();

    fireEvent.click(screen.getByTestId('persistence-accept-remote'));

    expect(await screen.findByText('Remote workspace')).toBeVisible();
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
    const local = snapshot('Local workspace', 'Local card', 10, 20);
    const dangling = withDanglingGraph(local, 'Remote workspace');
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'conflict',
      current: { snapshot: dangling, revision: 4n, exportedRevision: null },
    });
    const session = openSpaceSession(new MemorySpaceBackend([], control), {
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
    mountWorkspace({ space: runtime(local), spaceSession: session }, (app) => {
      if (view === undefined) view = render(app);
      else view.rerender(app);
    });

    fireEvent.click(screen.getByTestId('persistence-accept-remote'));
    return { local, session };
  };

  /**
   * `acceptRemote` is an `onClick` handler (`App.tsx`), and React error
   * boundaries do not catch throws from event handlers — so a throw here escapes
   * to the window rather than reaching `WorkspaceFailure`, and the session has
   * *already* published the unloadable snapshot as settled working state. The
   * page then still shows the stale local workspace with no conflict left to
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
    const local = snapshot('Local workspace', 'Local card', 10, 20);
    const dangling = withDanglingGraph(local, 'Broken remote');
    const loadable = snapshot('Remote workspace', 'Remote card', 900, 700);
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'conflict',
      current: { snapshot: dangling, revision: 4n, exportedRevision: null },
    });
    control.queueResult({
      kind: 'conflict',
      current: { snapshot: loadable, revision: 5n, exportedRevision: null },
    });
    const session = openSpaceSession(new MemorySpaceBackend([], control), {
      snapshot: local,
      revision: 3n,
      exportedRevision: null,
    });
    session.submit(local);
    await waitFor(() => expect(session.getState().persistence.kind).toBe('conflicted'));

    let view: RenderResult | undefined;
    mountWorkspace({ space: runtime(local), spaceSession: session }, (app) => {
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
      expect(persistence.kind === 'conflicted' ? persistence.current.revision : null).toBe(5n);
    });

    await waitFor(() =>
      expect(screen.queryByTestId('persistence-remote-refused')).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('persistence-accept-remote')).toBeVisible();
  });

  /**
   * Refusing is not a failure of the workspace: the local work is intact and the
   * conflict is still the session's state, so the page that owns both has to
   * stay. Reporting through the failure panel unmounted the whole tree, which
   * left the author reading why their unsaved work could not be replaced on a
   * screen that no longer showed it — and no control to do anything else.
   */
  it('keeps the conflicted workspace on screen when it refuses the remote snapshot', async () => {
    await refusedRemote();

    expect(screen.getByText('Local workspace')).toBeVisible();
    // Awaited because placement is asynchronous — the Card arrives with the
    // arrangement, not with the mount.
    expect(await screen.findByRole('heading', { name: 'Local card', hidden: true })).toBeVisible();
    expect(screen.getByTestId('persistence-accept-remote')).toBeVisible();
    expect(screen.queryByTestId('workspace-failure')).not.toBeInTheDocument();
  });
});

describe('Workspace permanent save refusal', () => {
  it('explains the server refusal and returns the author to their local work', async () => {
    const local = snapshot('Local workspace', 'Local card', 10, 20);
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'permanent-failure',
      code: 'invalid-snapshot',
      message: 'Graph names an absent card',
    });
    const session = openSpaceSession(new MemorySpaceBackend([], control), {
      snapshot: local,
      revision: 3n,
      exportedRevision: null,
    });
    session.submit(local);
    await waitFor(() => expect(session.getState().persistence.kind).toBe('rejected'));

    let view: RenderResult | undefined;
    mountWorkspace({ space: runtime(local), spaceSession: session }, (app) => {
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
    expect(await screen.findByRole('heading', { name: 'Local card' })).toBeVisible();
    expect(session.getState().persistence.kind).toBe('rejected');
  });
});

describe('Workspace failure reporting', () => {
  it('names a working snapshot that stopped loading instead of blanking the page', () => {
    const valid = snapshot('Workspace', 'Card', 10, 20);
    const dangling = withDanglingGraph(valid, valid.document.title);
    const session = openSpaceSession(new MemorySpaceBackend(), {
      snapshot: dangling,
      revision: 0n,
      exportedRevision: null,
    });
    // React reports a boundary-caught error to `console.error` as well as to the
    // boundary. The report is the point; the duplicate is noise this test owns.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() =>
      mountWorkspace({ space: runtime(valid), spaceSession: session }, (app) => {
        render(app);
      }),
    ).not.toThrow();

    expect(screen.getByTestId('workspace-failure')).toHaveTextContent(MISSING_CARD_ID);
  });
});

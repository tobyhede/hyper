import { fireEvent, render, screen, type RenderResult } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  openSpaceSession,
} from '@project/persistence';
import { mountWorkspace } from '../src/Workspace';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const MISSING_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');

const snapshot = (title: string, cardTitle: string, x: number, y: number): SpaceSnapshot =>
  spaceSnapshotSchema.parse({
    id: SPACE_ID,
    document: {
      version: 2,
      title,
      routes: [],
      layouts: [
        {
          id: LAYOUT_ID,
          title: 'Layout',
          kind: 'positioned',
          positions: { [CARD_ID]: { x, y } },
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
   * `acceptRemote` is an `onClick` handler (`App.tsx`), and React error
   * boundaries do not catch throws from event handlers — so a throw here escapes
   * to the window rather than reaching `WorkspaceFailure`, and the session has
   * *already* published the unloadable snapshot as settled working state. The
   * page then still shows the stale local workspace with no conflict left to
   * resolve and no way back. Validate the remote snapshot before accepting it.
   */
  it('refuses an unloadable remote snapshot instead of accepting it into the session', async () => {
    const local = snapshot('Local workspace', 'Local card', 10, 20);
    const dangling: SpaceSnapshot = {
      ...local,
      document: {
        ...local.document,
        title: 'Remote workspace',
        routes: [{ id: ROUTE_ID, title: 'Route', edges: [{ from: CARD_ID, to: MISSING_CARD_ID }] }],
      },
    };
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

    expect(await screen.findByTestId('workspace-failure')).toHaveTextContent(MISSING_CARD_ID);
    expect(session.getState().working).toEqual(local);
    expect(session.getState().persistence.kind).toBe('conflicted');
  });
});

describe('Workspace failure reporting', () => {
  it('names a working snapshot that stopped loading instead of blanking the page', () => {
    const valid = snapshot('Workspace', 'Card', 10, 20);
    const dangling: SpaceSnapshot = {
      ...valid,
      document: {
        ...valid.document,
        routes: [{ id: ROUTE_ID, title: 'Route', edges: [{ from: CARD_ID, to: MISSING_CARD_ID }] }],
      },
    };
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

import { fireEvent, render, screen, type RenderResult } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { mountWorkspace } from '../src/Workspace';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');

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
});

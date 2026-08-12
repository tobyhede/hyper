import { fireEvent, render, screen, type RenderResult } from '@testing-library/react';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { mountWorkspace } from '../src/Workspace';

/**
 * React Flow positions the whole graph with one viewport transform, and derives
 * everything else from its scale — `Background`'s pattern geometry included.
 *
 * `fitView` computes that scale by dividing the container's size by the bounds of
 * the nodes. Remounting the workspace runs it again, and a Card carries declared
 * dimensions (`projection.ts`) so it is measured immediately — which means the
 * division can happen before the container has been measured at all. Zero over
 * zero is `NaN`, and a `NaN` scale renders the graph nowhere.
 *
 * A headless DOM reports every element as 0x0, so this is reachable in tests long
 * before it would be in a browser. That is what the container-size stub in the
 * root `vitest.setup.ts` exists for, and this is what holds it there.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

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
          // A Layout owns at least one Graph (ADR 0040); this one holds no
          // Edges, which is all a single-Card Space has to connect.
          graphs: [{ id: GRAPH_ID, title: 'Main', edges: [] }],
        },
      ],
      defaultView: LAYOUT_ID,
    },
    cards: [{ id: CARD_ID, document: { title: cardTitle, kind: 'markdown', body: cardTitle } }],
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

const viewportTransform = (): string =>
  document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform ?? '';

describe('graph viewport', () => {
  it('keeps a finite scale when accepted remote placement replaces live nodes', async () => {
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
    await screen.findByText('Local workspace');
    expect(viewportTransform()).not.toMatch(/NaN/);

    fireEvent.click(screen.getByTestId('persistence-accept-remote'));
    await screen.findByText('Remote workspace');

    expect(viewportTransform()).not.toMatch(/NaN/);
  });
});

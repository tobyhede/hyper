import { fireEvent, render, screen, waitFor, type RenderResult } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { MemorySpaceBackend, type SpaceSession } from '@project/persistence';
import { composeApp } from '../src/compose-app';
import type { SpaceThingAuthoring } from '../src/space-thing-lifecycle';
import { deleteGraphItem } from './command-dock';
import { openTestSpace } from './opened-space';
import { mountSpace } from './space-mounting';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000b');

/** Two Graphs so Delete Graph stays offered after a refused first attempt. */
const twoGraphs: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    diagrams: [
      {
        id: DIAGRAM_ID,
        title: 'Diagram',
        kind: 'positioned',
        positions: { [THING_ID]: { x: 10, y: 20, open: false } },
        graphs: [
          { id: GRAPH_ID, title: 'Graph', edges: [] },
          { id: OTHER_GRAPH_ID, title: 'Other Graph', edges: [] },
        ],
      },
    ],
    defaultDiagram: DIAGRAM_ID,
  },
  things: [{ id: THING_ID, document: { title: 'A', kind: 'markdown', body: 'A source' } }],
});

const runtime = (value: SpaceSnapshot) => {
  const loaded = loadSpaceSnapshot(value);
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join('\n'));
  return loaded.space;
};

const graphsOf = (session: SpaceSession): readonly string[] =>
  session.getState().working.document.diagrams?.[0]?.graphs.map((graph) => graph.id) ?? [];

/**
 * The first Graph delete is a coordinated refusal; later attempts run the real
 * lifecycle. That is the sequence the Dock notice has to survive: a standing
 * error, then a different attempt that must not keep showing it.
 */
const refuseFirstGraphDelete = (spaceThings: SpaceThingAuthoring): SpaceThingAuthoring => {
  let refuseNext = true;
  return {
    ...spaceThings,
    deleteGraph: async (input) => {
      if (refuseNext) {
        refuseNext = false;
        return {
          kind: 'refused',
          refusal: { code: 'diagram-not-found', diagramId: input.diagramId },
        };
      }
      return spaceThings.deleteGraph(input);
    },
  };
};

function mount(): SpaceSession {
  const stored = { snapshot: twoGraphs, revision: 0n, exportedRevision: null };
  const { spaceSession: session, spaceThings } = openTestSpace(
    MemorySpaceBackend.asMeta(stored),
    stored,
  );
  const wrapped = refuseFirstGraphDelete(spaceThings);
  let view: RenderResult | undefined;
  mountSpace(
    {
      id: runtime(twoGraphs).id,
      session,
      app: composeApp({ spaceSession: session, spaceThings: wrapped }),
      spaceThings: wrapped,
    },
    (app) => {
      if (view === undefined) view = render(app);
      else view.rerender(app);
    },
  );
  return session;
}

const settled = (session: SpaceSession): Promise<void> =>
  waitFor(() => expect(session.getState().persistence.kind).toBe('settled'));

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

describe('Graph deletion notice', () => {
  /**
   * A failed Graph deletion draws "Graph not deleted". The next attempt that
   * completes must clear that standing sentence — otherwise a later success
   * still reports the previous refusal.
   */
  it('clears a failed Graph deletion notice when the next attempt completes', async () => {
    const session = mount();
    await screen.findByTestId('selected-canvas');
    await waitFor(() => expect(graphsOf(session)).toHaveLength(2));

    fireEvent.click(deleteGraphItem('Graph'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Graph not deleted');
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This Diagram is no longer part of the Space.',
    );
    expect(graphsOf(session)).toHaveLength(2);

    fireEvent.click(deleteGraphItem('Graph'));
    await waitFor(() => expect(graphsOf(session)).toHaveLength(1));
    expect(screen.queryByText('Graph not deleted')).not.toBeInTheDocument();
    await settled(session);
  });
});

import { describe, expect, it } from 'vitest';
import type { Layout, SpaceSnapshot } from '@project/core';
import type { SpaceSessionState } from '@project/persistence';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import type { NodeChange } from '@xyflow/react';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { createEditorStore } from '../src/editor';
import { preparePlacementSubmission } from '../src/completed-edit';

const SPACE_ID = '00000000-0000-4000-8000-000000000001';
const CARD_A = '00000000-0000-4000-8000-000000000002';
const CARD_B = '00000000-0000-4000-8000-000000000003';
const ROUTE_ID = '00000000-0000-4000-8000-000000000004';
const DEFAULT_LAYOUT_ID = '00000000-0000-4000-8000-000000000021';
const OTHER_LAYOUT_ID = '00000000-0000-4000-8000-000000000022';

const automaticSnapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 2,
    title: 'Space',
    routes: [{ id: ROUTE_ID, title: 'Main', edges: [{ from: CARD_A, to: CARD_B }] }],
  },
  cards: [
    { id: CARD_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: CARD_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
  ],
};

const defaultLayout: Layout = {
  id: DEFAULT_LAYOUT_ID,
  title: 'Authored Layout',
  kind: 'positioned',
  positions: { [CARD_A]: { x: 10, y: 20 } },
  routes: [ROUTE_ID],
};
const otherLayout: Layout = {
  id: OTHER_LAYOUT_ID,
  title: 'Other Layout',
  kind: 'positioned',
  positions: { [CARD_B]: { x: 900, y: 700 } },
};
const positionedSnapshot: SpaceSnapshot = {
  ...automaticSnapshot,
  document: {
    ...automaticSnapshot.document,
    layouts: [defaultLayout, otherLayout],
    defaultView: DEFAULT_LAYOUT_ID,
  },
};

function node(id: string, x: number, y: number): CardFlowNode {
  return {
    id,
    type: 'card',
    position: { x, y },
    className: 'rf-card-node',
    data: {
      cardId: id,
      title: id,
      sourceHandles: [],
      targetHandles: [],
      active: false,
      showContent: false,
      activeRouteId: null,
      emphasis: 'equal',
    },
  };
}

const projected = [node(CARD_A, 10, 20), node(CARD_B, 300, 20)];

const moving = (id: string, x: number, y: number): NodeChange<CardFlowNode>[] => [
  { type: 'position', id, position: { x, y }, dragging: true },
];
const settled = (id: string, x: number, y: number): NodeChange<CardFlowNode>[] => [
  { type: 'position', id, position: { x, y }, dragging: false },
];

const waitForSettled = (
  getState: () => SpaceSessionState,
  subscribe: (listener: () => void) => () => void,
): Promise<SpaceSessionState> => {
  const current = getState();
  if (current.persistence.kind === 'settled') return Promise.resolve(current);
  return new Promise((resolve) => {
    const unsubscribe = subscribe(() => {
      const state = getState();
      if (state.persistence.kind !== 'settled') return;
      unsubscribe();
      resolve(state);
    });
  });
};

describe('completed placement composition', () => {
  it('submits nothing on automatic load, then persists all visible cards on first edit', async () => {
    const loaded = { snapshot: automaticSnapshot, revision: 0n, exportedRevision: null };
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded);
    const editor = createEditorStore();
    editor.getState().syncNodes(projected);

    expect(
      preparePlacementSubmission(
        session.getState().working,
        0,
        { revision: editor.getState().revision, positions: editor.getState().positions },
        {
          layoutId: DEFAULT_LAYOUT_ID,
          layoutTitle: 'Layout',
          activeRouteId: ROUTE_ID,
        },
      ),
    ).toBeNull();
    expect(session.getState().acknowledgedRevision).toBe(0n);

    editor.getState().changeNodes(moving(CARD_A, 500, 400));
    editor.getState().changeNodes(settled(CARD_A, 500, 400));
    const prepared = preparePlacementSubmission(
      session.getState().working,
      0,
      { revision: editor.getState().revision, positions: editor.getState().positions },
      {
        layoutId: DEFAULT_LAYOUT_ID,
        layoutTitle: 'Layout',
        activeRouteId: ROUTE_ID,
      },
    );
    if (prepared === null) throw new Error('Expected a prepared submission');
    session.submit(prepared.snapshot);
    await waitForSettled(session.getState, session.subscribe);

    expect(session.getState().acknowledgedRevision).toBe(1n);
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({
      revision: 1n,
      snapshot: {
        document: {
          defaultView: DEFAULT_LAYOUT_ID,
          layouts: [
            {
              id: DEFAULT_LAYOUT_ID,
              activeRoute: ROUTE_ID,
              positions: {
                [CARD_A]: { x: 500, y: 400 },
                [CARD_B]: { x: 300, y: 20 },
              },
            },
          ],
        },
      },
    });
  });
});

it('preserves an existing Layout and unrelated Layouts when its first edit persists', async () => {
  const loaded = { snapshot: positionedSnapshot, revision: 0n, exportedRevision: null };
  const backend = new MemorySpaceBackend([loaded]);
  const session = openSpaceSession(backend, loaded);
  const editor = createEditorStore(new Map(Object.entries(defaultLayout.positions)));
  editor.getState().syncNodes(projected);

  expect(
    preparePlacementSubmission(
      session.getState().working,
      0,
      { revision: editor.getState().revision, positions: editor.getState().positions },
      {
        layoutId: defaultLayout.id,
        layoutTitle: defaultLayout.title,
        activeRouteId: ROUTE_ID,
      },
    ),
  ).toBeNull();

  editor.getState().changeNodes(moving(CARD_A, 700, 500));
  editor.getState().changeNodes(settled(CARD_A, 700, 500));
  const prepared = preparePlacementSubmission(
    session.getState().working,
    0,
    { revision: editor.getState().revision, positions: editor.getState().positions },
    {
      layoutId: defaultLayout.id,
      layoutTitle: defaultLayout.title,
      activeRouteId: ROUTE_ID,
    },
  );
  if (prepared === null) throw new Error('Expected a prepared submission');
  expect(
    preparePlacementSubmission(
      session.getState().working,
      prepared.revision,
      { revision: editor.getState().revision, positions: editor.getState().positions },
      {
        layoutId: defaultLayout.id,
        layoutTitle: defaultLayout.title,
        activeRouteId: ROUTE_ID,
      },
    ),
  ).toBeNull();
  session.submit(prepared.snapshot);
  await waitForSettled(session.getState, session.subscribe);

  const persisted = await backend.loadSpace(SPACE_ID);
  expect(persisted?.revision).toBe(1n);
  expect(persisted?.snapshot.document.defaultView).toBe(DEFAULT_LAYOUT_ID);
  expect(persisted?.snapshot.document.layouts).toEqual([
    otherLayout,
    {
      id: defaultLayout.id,
      title: defaultLayout.title,
      kind: 'positioned',
      positions: { [CARD_A]: { x: 700, y: 500 } },
      routes: [ROUTE_ID],
      activeRoute: ROUTE_ID,
    },
  ]);
});

it('rejects a completed revision that has no authored placement', () => {
  expect(() =>
    preparePlacementSubmission(
      automaticSnapshot,
      0,
      { revision: 1, positions: null },
      {
        layoutId: DEFAULT_LAYOUT_ID,
        layoutTitle: 'Layout',
        activeRouteId: ROUTE_ID,
      },
    ),
  ).toThrow('A completed editor revision must carry authored positions.');
});

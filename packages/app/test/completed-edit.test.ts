import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type Layout, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend, openSpaceSession, type SpaceSession } from '@project/persistence';
import { createEditorStore, type EditorStore } from '../src/editor';
import {
  preparePlacementSubmission,
  type PlacementTarget,
  type PlacementSubmission,
} from '../src/completed-edit';
import { layoutPositionMap } from '../src/view';
import { completeDrag, node } from './editor-fixtures';
import { waitForSettled } from './session-fixtures';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const DEFAULT_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const OTHER_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');

const automaticSnapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 2,
    title: 'Space',
    routes: [{ id: ROUTE_ID, title: 'Main', edges: [{ from: CARD_A, to: CARD_B }] }],
    layouts: [
      {
        id: OTHER_LAYOUT_ID,
        title: 'Layout 1',
        kind: 'positioned',
        positions: { [CARD_B]: { x: 900, y: 700 } },
      },
    ],
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

const projected = [node(CARD_A, 10, 20), node(CARD_B, 300, 20)];

const automaticTarget: PlacementTarget = {
  kind: 'view',
  layoutId: DEFAULT_LAYOUT_ID,
  activeRouteId: ROUTE_ID,
};
const positionedTarget: PlacementTarget = {
  kind: 'layout',
  layoutId: defaultLayout.id,
  activeRouteId: ROUTE_ID,
};

function prepareEditorSubmission(
  session: SpaceSession,
  editor: EditorStore,
  submittedRevision: number,
  target: PlacementTarget,
): PlacementSubmission | null {
  return preparePlacementSubmission(
    session.getState().working,
    submittedRevision,
    { revision: editor.getState().revision, positions: editor.getState().positions },
    target,
  );
}

describe('completed placement composition', () => {
  it('numbers a converted Layout after every existing neutral title', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 1, max: 50 }), { maxLength: 12 }), (numbers) => {
        const layouts: Layout[] = numbers.map((number, index) => ({
          id: uuidSchema.parse(`00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`),
          title: `Layout ${number}`,
          kind: 'positioned',
          positions: {},
        }));
        const base: SpaceSnapshot = {
          ...automaticSnapshot,
          document: { ...automaticSnapshot.document, layouts },
        };

        const prepared = preparePlacementSubmission(
          base,
          0,
          { revision: 1, positions: new Map([[CARD_A, { x: 1, y: 2 }]]) },
          automaticTarget,
        );

        expect(prepared?.snapshot.document.layouts?.slice(0, -1)).toEqual(layouts);
        expect(prepared?.snapshot.document.layouts?.at(-1)?.title).toBe(
          `Layout ${Math.max(0, ...numbers) + 1}`,
        );
      }),
    );
  });

  it('converts an Algorithmic View into the next uniquely titled Layout on first edit', async () => {
    const loaded = { snapshot: automaticSnapshot, revision: 0n, exportedRevision: null };
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded);
    const editor = createEditorStore();
    editor.getState().syncNodes(projected);

    expect(prepareEditorSubmission(session, editor, 0, automaticTarget)).toBeNull();
    expect(session.getState().acknowledgedRevision).toBe(0n);

    completeDrag(editor, CARD_A, 500, 400);
    const prepared = prepareEditorSubmission(session, editor, 0, automaticTarget);
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
            automaticSnapshot.document.layouts?.[0],
            {
              id: DEFAULT_LAYOUT_ID,
              title: 'Layout 2',
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

  it('converts once when a second edit arrives before the renderer selection flips', () => {
    // The race `App`'s stable `nextLayoutId` exists to close. Converting submits
    // the new Layout and *schedules* `selectedRenderer` to become
    // `{kind: 'layout'}`; a second completed edit can reach the effect before
    // React processes that flip, and so takes the view branch again. Holding the
    // id steady makes that second edit update the Layout the first one created.
    // Minting per effect run would append a second Layout for one conversion,
    // against ADR 0031's one-edit-one-Layout reading.
    const first = preparePlacementSubmission(
      automaticSnapshot,
      0,
      { revision: 1, positions: new Map([[CARD_A, { x: 500, y: 400 }]]) },
      automaticTarget,
    );
    if (first === null) throw new Error('Expected a prepared submission');

    const second = preparePlacementSubmission(
      first.snapshot,
      first.revision,
      { revision: 2, positions: new Map([[CARD_A, { x: 700, y: 600 }]]) },
      automaticTarget,
    );
    if (second === null) throw new Error('Expected a second prepared submission');

    const layouts = second.snapshot.document.layouts ?? [];
    expect(layouts).toHaveLength(2);
    expect(layouts.filter((layout) => layout.id === DEFAULT_LAYOUT_ID)).toHaveLength(1);
    expect(layouts[0]).toEqual(automaticSnapshot.document.layouts?.[0]);
    expect(layouts.at(-1)).toMatchObject({
      id: DEFAULT_LAYOUT_ID,
      positions: { [CARD_A]: { x: 700, y: 600 } },
    });
    expect(second.snapshot.document.defaultView).toBe(DEFAULT_LAYOUT_ID);
    // A known wrinkle, asserted so a change to it is deliberate: the second pass
    // still takes the view branch, so it recomputes a neutral title against a
    // base that now contains `Layout 2`. The Layout keeps its identity and is
    // renamed. Only reachable in this race.
    expect(layouts.at(-1)?.title).toBe('Layout 3');
  });

  it('preserves an existing Layout and unrelated Layouts when its first edit persists', async () => {
    const loaded = { snapshot: positionedSnapshot, revision: 0n, exportedRevision: null };
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded);
    const editor = createEditorStore(layoutPositionMap(defaultLayout));
    editor.getState().syncNodes(projected);

    expect(prepareEditorSubmission(session, editor, 0, positionedTarget)).toBeNull();

    completeDrag(editor, CARD_A, 700, 500);
    const prepared = prepareEditorSubmission(session, editor, 0, positionedTarget);
    if (prepared === null) throw new Error('Expected a prepared submission');
    expect(
      prepareEditorSubmission(session, editor, prepared.revision, positionedTarget),
    ).toBeNull();
    session.submit(prepared.snapshot);
    await waitForSettled(session.getState, session.subscribe);

    const persisted = await backend.loadSpace(SPACE_ID);
    expect(persisted?.revision).toBe(1n);
    expect(persisted?.snapshot.document.defaultView).toBe(DEFAULT_LAYOUT_ID);
    expect(persisted?.snapshot.document.layouts).toEqual([
      {
        id: defaultLayout.id,
        title: defaultLayout.title,
        kind: 'positioned',
        positions: { [CARD_A]: { x: 700, y: 500 } },
        routes: [ROUTE_ID],
        activeRoute: ROUTE_ID,
      },
      otherLayout,
    ]);
  });

  it('rejects a completed revision that has no authored placement', () => {
    expect(() =>
      preparePlacementSubmission(
        automaticSnapshot,
        0,
        { revision: 1, positions: null },
        {
          kind: 'view',
          layoutId: DEFAULT_LAYOUT_ID,
          activeRouteId: ROUTE_ID,
        },
      ),
    ).toThrow('A completed editor revision must carry authored positions.');
  });
});

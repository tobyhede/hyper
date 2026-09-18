import { describe, expect, it } from 'vitest';
import { newUuid, uuidSchema, type SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { composeApp } from '../src/compose-app';
import { coordinatedDiagramDelete } from '../src/coordinated-context-delete';
import { createOpenSpaces } from '../src/open-spaces';
import { recordingHistory } from './browser-history';
import { openTestSpace } from './opened-space';
import { node, settled } from './render-adapter-fixtures';

/**
 * Red-first coverage for `.scratch/snapshot-edits/issues/02-remove-authorings-placement-copy.md`,
 * "Red first". Each `describe` below is one of the ticket's four suspected
 * defects, named the way the ticket names it.
 *
 * None of these tests calls `authoredPlacement`, `reportRendered`,
 * `replacePlacement` or `initialPlacement` — the members the ticket deletes —
 * on purpose: every assertion reads the session's own written snapshot or the
 * render adapter's own drawn projection, so the tests stay meaningful once the
 * copy they are about is gone.
 */

const id = (suffix: string) =>
  uuidSchema.parse(`00000000-0000-4000-8000-${suffix.padStart(12, '0')}`);

describe('Diagram delete draws the right geometry (ticket 02, item 1)', () => {
  const SPACE_ID = id('1');
  const DELETED_DIAGRAM_ID = id('2');
  const SURVIVING_DIAGRAM_ID = id('3');
  const DELETED_GRAPH_ID = id('4');
  const SURVIVING_GRAPH_ID = id('5');
  const SHARED_THING_ID = id('6');

  /**
   * One Thing placed in both Diagrams, at two different points — the shape the
   * ticket names: "a Thing in both the deleted Diagram and the newly selected
   * one".
   */
  const snapshot: SpaceSnapshot = {
    id: SPACE_ID,
    document: {
      version: 1,
      title: 'Space',
      defaultDiagram: DELETED_DIAGRAM_ID,
      diagrams: [
        {
          id: DELETED_DIAGRAM_ID,
          title: 'Deleted',
          kind: 'positioned',
          positions: { [SHARED_THING_ID]: { x: 10, y: 20, open: false } },
          graphs: [{ id: DELETED_GRAPH_ID, title: 'Deleted Graph', edges: [] }],
        },
        {
          id: SURVIVING_DIAGRAM_ID,
          title: 'Surviving',
          kind: 'positioned',
          positions: { [SHARED_THING_ID]: { x: 500, y: 600, open: false } },
          graphs: [{ id: SURVIVING_GRAPH_ID, title: 'Surviving Graph', edges: [] }],
        },
      ],
    },
    things: [{ id: SHARED_THING_ID, document: { title: 'Shared', kind: 'markdown', body: '' } }],
  };

  it('writes the surviving Diagram’s own position for a Thing both Diagrams place, not the deleted Diagram’s', async () => {
    const backend = new MemorySpaceBackend([{ snapshot, revision: 0n, exportedRevision: null }]);
    const { spaceSession: session, spaceThings } = openTestSpace(backend, {
      snapshot,
      revision: 0n,
      exportedRevision: null,
    });
    const app = composeApp({ spaceSession: session });
    expect(app.navigation.getState().selectedDiagramId).toBe(DELETED_DIAGRAM_ID);

    // What `App.tsx`'s Dock entity command does (`onDeleteDiagram`): coordinate
    // the delete, then select and activate whatever it answers.
    const result = await coordinatedDiagramDelete(spaceThings.deleteDiagram, {
      targetSpaceId: SPACE_ID,
      diagramId: DELETED_DIAGRAM_ID,
      preferredDiagramId: null,
    });
    if (result.kind !== 'completed')
      throw new Error(`Expected a completed delete, got ${result.kind}`);
    expect(result.diagramId).toBe(SURVIVING_DIAGRAM_ID);
    app.navigation.selectDiagram(result.diagramId);
    app.navigation.activateGraph(result.graphId);
    expect(app.navigation.getState().selectedDiagramId).toBe(SURVIVING_DIAGRAM_ID);

    // An Edit that touches no position — renaming the surviving Diagram's own
    // Graph — still writes the whole placement into the Diagram
    // (`updatePositionedDiagram`). The correct source for that write is the
    // surviving Diagram's own authored position for the shared Thing.
    const renamed = app.authoring.complete({
      kind: 'renamed-graph',
      graphId: SURVIVING_GRAPH_ID,
      title: 'Renamed Graph',
    });
    expect(renamed.kind).toBe('completed');

    const written = session
      .getState()
      .working.document.diagrams?.find((diagram) => diagram.id === SURVIVING_DIAGRAM_ID);
    expect(written?.positions[SHARED_THING_ID]).toEqual({ x: 500, y: 600, open: false });
  });
});

describe('Entering draws the entered Diagram’s geometry (ticket 02, item 2)', () => {
  const META_ID = id('10');
  const OTHER_ID = id('11');
  const DEFAULT_DIAGRAM_ID = id('12');
  const ENTERED_DIAGRAM_ID = id('13');
  const DEFAULT_GRAPH_ID = id('14');
  const ENTERED_GRAPH_ID = id('15');
  const SHARED_THING_ID = id('16');
  const META_THING_ID = id('17');
  const META_DIAGRAM_ID = id('18');
  const META_GRAPH_ID = id('19');

  const metaSnapshot: SpaceSnapshot = {
    id: META_ID,
    document: {
      version: 1,
      title: 'Meta',
      defaultDiagram: META_DIAGRAM_ID,
      diagrams: [
        {
          id: META_DIAGRAM_ID,
          title: 'Meta Diagram',
          kind: 'positioned',
          positions: { [META_THING_ID]: { x: 0, y: 0, open: false } },
          graphs: [{ id: META_GRAPH_ID, title: 'Meta Graph', edges: [] }],
        },
      ],
    },
    things: [{ id: META_THING_ID, document: { title: 'Meta Thing', kind: 'markdown', body: '' } }],
  };

  /**
   * The Space Enter opens: a Space-default Diagram, and a second one that
   * places the same Thing at a different point — the shape a Space Thing
   * entered at a non-default Diagram/Graph makes real (ADR 0079).
   */
  const otherSnapshot: SpaceSnapshot = {
    id: OTHER_ID,
    document: {
      version: 1,
      title: 'Other',
      defaultDiagram: DEFAULT_DIAGRAM_ID,
      diagrams: [
        {
          id: DEFAULT_DIAGRAM_ID,
          title: 'Default',
          kind: 'positioned',
          positions: { [SHARED_THING_ID]: { x: 10, y: 20, open: false } },
          graphs: [{ id: DEFAULT_GRAPH_ID, title: 'Default Graph', edges: [] }],
        },
        {
          id: ENTERED_DIAGRAM_ID,
          title: 'Entered',
          kind: 'positioned',
          positions: { [SHARED_THING_ID]: { x: 500, y: 600, open: false } },
          graphs: [{ id: ENTERED_GRAPH_ID, title: 'Entered Graph', edges: [] }],
        },
      ],
    },
    things: [{ id: SHARED_THING_ID, document: { title: 'Shared', kind: 'markdown', body: '' } }],
  };

  it('writes the entered Diagram’s own position for a Thing both Diagrams place, not the Space default one', async () => {
    const backend = new MemorySpaceBackend(META_ID, [
      { snapshot: metaSnapshot, revision: 0n, exportedRevision: null },
      { snapshot: otherSnapshot, revision: 0n, exportedRevision: null },
    ]);
    const spaces = createOpenSpaces({
      backend,
      metaSpaceId: META_ID,
      newId: newUuid,
      history: recordingHistory(),
    });
    await spaces.open(META_ID);
    const entered = await spaces.enter(OTHER_ID, ENTERED_DIAGRAM_ID, ENTERED_GRAPH_ID);
    expect(entered.app.navigation.getState().selectedDiagramId).toBe(ENTERED_DIAGRAM_ID);

    // Again, an Edit that touches no position.
    const renamed = entered.app.authoring.complete({
      kind: 'renamed-graph',
      graphId: ENTERED_GRAPH_ID,
      title: 'Renamed Graph',
    });
    expect(renamed.kind).toBe('completed');

    const written = entered.session
      .getState()
      .working.document.diagrams?.find((diagram) => diagram.id === ENTERED_DIAGRAM_ID);
    expect(written?.positions[SHARED_THING_ID]).toEqual({ x: 500, y: 600, open: false });
  });
});

describe('An embedded Edit in an unselected Diagram leaves no stale member (ticket 02, item 3)', () => {
  const SPACE_ID = id('30');
  const TOP_DIAGRAM_ID = id('31');
  const OTHER_DIAGRAM_ID = id('32');
  const TOP_GRAPH_ID = id('33');
  const OTHER_GRAPH_ID = id('34');
  const OTHER_GRAPH_TO_DELETE_ID = id('35');
  const TOP_THING_ID = id('36');
  const OTHER_THING_ID = id('37');

  const snapshot: SpaceSnapshot = {
    id: SPACE_ID,
    document: {
      version: 1,
      title: 'Space',
      defaultDiagram: TOP_DIAGRAM_ID,
      diagrams: [
        {
          id: TOP_DIAGRAM_ID,
          title: 'Top',
          kind: 'positioned',
          positions: { [TOP_THING_ID]: { x: 10, y: 20, open: false } },
          graphs: [{ id: TOP_GRAPH_ID, title: 'Top Graph', edges: [] }],
        },
        {
          id: OTHER_DIAGRAM_ID,
          title: 'Other',
          kind: 'positioned',
          positions: { [OTHER_THING_ID]: { x: 500, y: 600, open: false } },
          graphs: [
            { id: OTHER_GRAPH_ID, title: 'Other Graph', edges: [] },
            { id: OTHER_GRAPH_TO_DELETE_ID, title: 'Doomed Graph', edges: [] },
          ],
        },
      ],
    },
    things: [
      { id: TOP_THING_ID, document: { title: 'Top Thing', kind: 'markdown', body: '' } },
      { id: OTHER_THING_ID, document: { title: 'Other Thing', kind: 'markdown', body: '' } },
    ],
  };

  /**
   * The ticket's suspected cause named `deleted-thing` specifically: "a
   * `deleted-thing` cascade can leave a stale member that the next Edit writes
   * into the snapshot, where intake refuses the reference." That exact shape
   * could not be reproduced through any typed call: `SpaceAuthoring.completeInDiagram`'s
   * parameter type (`EmbeddedThingCompletion | EmbeddedContextCompletion`)
   * excludes `deleted-thing`, and `thing-deletion.ts`, the only production
   * caller of a `deleted-thing` completion, always calls the top-level
   * `authoring.complete` rather than `completeInDiagram`.
   *
   * With Authoring's own placement copy gone, the suspected *mechanism* — a
   * copy left stale because reconciliation was gated by `installing` — is gone
   * with it: an embedded Edit now writes straight into the session's snapshot,
   * exactly as a top-level one does, and every later read derives its
   * placement fresh from that same snapshot. There is no second store left to
   * go stale, for `deleted-thing` or any other kind.
   *
   * The test stays as a guard on the surrounding behaviour: an embedded Edit
   * on a Diagram other than the one selected still has to produce a snapshot
   * intake accepts, and a later top-level Edit still has to see it — exercised
   * with `deleted-graph`, the closest reachable kind that changes an
   * unselected Diagram's own content, called directly through
   * `completeInDiagram` exactly as `space-authoring-operations.test.ts` does
   * to reach this same primitive outside its production callers.
   */
  it('produces a snapshot intake accepts after a later top-level Edit', () => {
    const backend = new MemorySpaceBackend([{ snapshot, revision: 0n, exportedRevision: null }]);
    const session = openSpaceSession(backend, { snapshot, revision: 0n, exportedRevision: null });
    const app = composeApp({ spaceSession: session });
    expect(app.navigation.getState().selectedDiagramId).toBe(TOP_DIAGRAM_ID);

    // An embedded Edit against a Diagram other than the one selected at the
    // top level.
    const embedded = app.authoring.completeInDiagram(OTHER_DIAGRAM_ID, {
      kind: 'deleted-graph',
      graphId: OTHER_GRAPH_TO_DELETE_ID,
    });
    expect(embedded.kind).toBe('completed');

    // The next top-level Edit, against the (still selected) other Diagram.
    const renamed = app.authoring.complete({
      kind: 'renamed-diagram',
      diagramId: TOP_DIAGRAM_ID,
      title: 'Renamed Top',
    });
    expect(renamed.kind).toBe('completed');

    const written = session.getState().working;
    const loaded = loadSpaceSnapshot(written);
    expect(loaded.ok).toBe(true);

    const top = written.document.diagrams?.find((diagram) => diagram.id === TOP_DIAGRAM_ID);
    expect(top?.positions[TOP_THING_ID]).toEqual({ x: 10, y: 20, open: false });
    const other = written.document.diagrams?.find((diagram) => diagram.id === OTHER_DIAGRAM_ID);
    expect(other?.graphs.map((graph) => graph.id)).toEqual([OTHER_GRAPH_ID]);
  });
});

describe('A queued drag holds its drop point (ticket 02, item 4 — guards the change)', () => {
  const SPACE_ID = id('40');
  const DIAGRAM_ID = id('41');
  const GRAPH_ID = id('42');
  const THING_A = id('43');
  const THING_B = id('44');

  const snapshot: SpaceSnapshot = {
    id: SPACE_ID,
    document: {
      version: 1,
      title: 'Space',
      defaultDiagram: DIAGRAM_ID,
      diagrams: [
        {
          id: DIAGRAM_ID,
          title: 'Diagram',
          kind: 'positioned',
          positions: {
            [THING_A]: { x: 10, y: 20, open: false },
            [THING_B]: { x: 300, y: 20, open: false },
          },
          graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
        },
      ],
    },
    things: [
      { id: THING_A, document: { title: 'A', kind: 'markdown', body: '' } },
      { id: THING_B, document: { title: 'B', kind: 'markdown', body: '' } },
    ],
  };

  /**
   * This test guards the change rather than a suspected defect, and must pass
   * before and after (ticket 02, "Red first"): a `settled-thing-movement`
   * that queues behind an in-flight commit must stay drawn at its drop point
   * until it is derived and lands there.
   *
   * The nested `changeNodes` call below simulates a drag settling from inside
   * an `EditCompleted` notification of an unrelated, already-in-flight Edit —
   * which is exactly what makes Space Authoring's `completing` gate answer
   * `queued` rather than deriving it immediately (`session-registry`/
   * `space-authoring.ts` reentrancy rules, `docs/agents/editing-and-persistence.md`
   * "Session notification is non-throwing…").
   */
  it('keeps a moved Thing drawn at its drop point while its completion waits behind an in-flight one', () => {
    const backend = new MemorySpaceBackend([{ snapshot, revision: 0n, exportedRevision: null }]);
    const session = openSpaceSession(backend, { snapshot, revision: 0n, exportedRevision: null });
    const { authoring, adapter } = composeApp({ spaceSession: session, selection: DIAGRAM_ID });

    adapter.getState().syncProjection([node(THING_A, 10, 20), node(THING_B, 300, 20)], []);

    let sawDuringQueue: { readonly x: number; readonly y: number } | undefined;
    let notifications = 0;
    const unsubscribe = session.subscribe(() => {
      notifications += 1;
      // Only the first notification is the outer Edit's own submit; a later
      // one is the queued drag's own derivation draining, and re-entering
      // there would settle the same drag a second time.
      if (notifications !== 1) return;
      adapter.getState().changeNodes(settled(THING_B, 777, 888));
      sawDuringQueue = adapter
        .getState()
        .projection?.nodes.find((thing) => thing.id === THING_B)?.position;
    });
    try {
      const result = authoring.complete({
        kind: 'renamed-diagram',
        diagramId: DIAGRAM_ID,
        title: 'Renamed',
      });
      expect(result.kind).toBe('completed');
    } finally {
      unsubscribe();
    }

    expect(sawDuringQueue).toEqual({ x: 777, y: 888 });
    // And it is still the drop point once the queued completion has drained.
    expect(
      adapter.getState().projection?.nodes.find((thing) => thing.id === THING_B)?.position,
    ).toEqual({ x: 777, y: 888 });
  });
});

import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { composeApp } from '../src/compose-app';
import { node, settled } from './render-adapter-fixtures';

/**
 * Coverage for `.scratch/snapshot-edits/issues/02-remove-authorings-placement-copy.md`,
 * "Red first" — items 3 and 4, both green against `main`. Items 1 and 2 (red)
 * land in a follow-up commit, with the reasons in that commit's message.
 *
 * Neither test below calls `authoredPlacement`, `reportRendered`,
 * `replacePlacement` or `initialPlacement` — the members the ticket deletes —
 * on purpose: every assertion reads the session's own written snapshot or the
 * render adapter's own drawn projection, so the tests stay meaningful once the
 * copy they are about is gone.
 */

const id = (suffix: string) =>
  uuidSchema.parse(`00000000-0000-4000-8000-${suffix.padStart(12, '0')}`);

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
   * The ticket's suspected cause names `deleted-thing` specifically: "a
   * `deleted-thing` cascade can leave a stale member that the next Edit writes
   * into the snapshot, where intake refuses the reference."
   *
   * That exact shape could not be reproduced through any typed call. A
   * `deleted-thing` completion is the only completion kind that removes a
   * Thing from the Space's `things` array — every other embedded-reachable
   * kind only changes one Diagram's own positions or graphs — and
   * `SpaceAuthoring.completeInDiagram`'s own parameter type
   * (`EmbeddedThingCompletion | EmbeddedContextCompletion`) excludes
   * `deleted-thing`. `thing-deletion.ts` is the only production caller of a
   * `deleted-thing` completion, and it always calls the top-level
   * `authoring.complete` (no `embeddedDiagramId`) — never `completeInDiagram`.
   * `embedded-authoring.test.ts`'s "reports rather than forwards" coverage
   * confirms the canvas-facing wrapper refuses to forward `deleted-thing` to
   * an embedded Diagram at all. So `space-authoring.ts`'s embedded branch
   * (`performCompletion`, the `install(derived.edit.placement)` gated on
   * `navigation.getState().selectedDiagramId === reported.embeddedDiagramId`)
   * never sees a `deleted-thing` completion in production, and a test cannot
   * reach it without an unsafe type assertion — which ADR 0062 forbids adding.
   *
   * What follows instead exercises the same gate (no install, reconciliation
   * skipped because `installing !== 0`) with the closest reachable kind that
   * changes an unselected Diagram's own content, `deleted-graph`, called
   * directly through `completeInDiagram` exactly as
   * `space-authoring-operations.test.ts` already does to reach this same
   * primitive outside its production callers. It passes today: not reproduced,
   * for the reason above rather than because the suspected mechanism is sound.
   */
  it('produces a snapshot intake accepts after a later top-level Edit', () => {
    const backend = new MemorySpaceBackend([{ snapshot, revision: 0n, exportedRevision: null }]);
    const session = openSpaceSession(backend, { snapshot, revision: 0n, exportedRevision: null });
    const app = composeApp({ spaceSession: session });
    expect(app.navigation.getState().selectedDiagramId).toBe(TOP_DIAGRAM_ID);

    // An embedded Edit against a Diagram other than the one selected at the
    // top level — the gate at `space-authoring.ts:1868` skips `install` and
    // the next session notification skips reconciliation, both because this
    // runs inside the embedded branch's own `installTogether`.
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

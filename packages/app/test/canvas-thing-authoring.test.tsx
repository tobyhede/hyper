import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  SPACE_THING_MIN_OPEN_SIZE,
  spaceSnapshotSchema,
  uuidSchema,
  type ThingId,
} from '@project/core';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import type { ThingFlowNode } from '@project/react-flow-adapter';
import { THING_SIZE } from '../src/thing';
import { authoringAvailability } from '../src/authoring-availability';
import { useCanvasThingAuthoring } from '../src/canvas-thing-authoring';
import { composeApp } from '../src/compose-app';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const MISSING_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const SPACE_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const TARGET_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
/**
 * What the Space Thing selects of its target (ADR 0079). The target Space is not
 * in this fixture — these tests mount one canvas and never read a second Space —
 * so the pair is required by the shape and resolved by nothing here.
 */
const TARGET_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');

const snapshot = spaceSnapshotSchema.parse({
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    diagrams: [
      {
        id: DIAGRAM_ID,
        title: 'Diagram',
        kind: 'positioned',
        positions: {
          [THING_ID]: { x: 0, y: 0, open: false },
          [ALIAS_ID]: { x: 300, y: 0, open: false },
          [SPACE_THING_ID]: { x: 600, y: 0, open: false },
        },
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
      },
    ],
    defaultDiagram: DIAGRAM_ID,
  },
  things: [
    { id: THING_ID, document: { title: 'A', kind: 'markdown', body: 'A source' } },
    { id: ALIAS_ID, document: { title: 'Return', kind: 'alias', target: THING_ID } },
    {
      id: SPACE_THING_ID,
      document: {
        title: 'Architecture',
        kind: 'space',
        spaceId: TARGET_SPACE_ID,
        diagram: TARGET_DIAGRAM_ID,
        graph: TARGET_GRAPH_ID,
      },
    },
  ],
});

const snapshotWithoutThing = spaceSnapshotSchema.parse({
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    diagrams: [
      {
        id: DIAGRAM_ID,
        title: 'Diagram',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
      },
    ],
    defaultDiagram: DIAGRAM_ID,
  },
  things: [],
});

const node = (
  expanded: boolean,
  thingId = THING_ID,
  kind: 'markdown' | 'alias' | 'space' = 'markdown',
): ThingFlowNode => ({
  id: thingId,
  type: 'thing',
  position: { x: 0, y: 0 },
  width: expanded ? 640 : THING_SIZE.width,
  height: expanded ? 480 : THING_SIZE.height,
  data: {
    thingId,
    title: 'A',
    readOnly: false,
    kind,
    body: 'A source',
    expanded,
    active: false,
    selectedForAuthoring: false,
    showContent: false,
    activeGraphId: GRAPH_ID,
    activeGraphColor: '#8a94a6',
    emphasis: 'equal',
  },
});

interface HookProps {
  readonly expanded: boolean;
  readonly enabled: boolean;
  readonly presenting: boolean;
  readonly nameOnCreation: string | null;
  readonly thingId: ThingId;
}

const mountAuthoring = (
  onBodyEditingChange?: (editing: boolean) => void,
  projectedKind: 'markdown' | 'alias' | 'space' = 'markdown',
) => {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const spaceSession = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
  const { authoring, adapter } = composeApp({ spaceSession });
  const initialProps: HookProps = {
    expanded: false,
    enabled: true,
    presenting: false,
    nameOnCreation: null,
    thingId: THING_ID,
  };
  const hook = renderHook(
    ({ expanded, enabled, presenting, nameOnCreation, thingId }: HookProps) =>
      useCanvasThingAuthoring({
        nodes: [node(expanded, thingId, projectedKind)],
        // The two facts this hook's rules turn on, stated as facts and turned
        // into answers by the one module that owns them: a modal pane is what
        // `enabled: false` has always meant here, and it is deliberately not
        // the thing that ends a live content edit.
        availability: authoringAvailability({
          editable: true,
          presenting,
          creatingThing: !enabled,
          editingThingBody: false,
          editingThingTitle: false,
          thingIsOpen: false,
          editingChromeTitle: false,
          spaceOnCanvas: true,
          editingEmbeddedDiagram: false,
        }),
        nameOnCreation,
        authoring,
        spaceSession,
        thingResize: adapter.getState().thingResize,
        onSelectThing: () => undefined,
        onBodyEditingChange,
      }),
    {
      initialProps,
    },
  );
  return { ...hook, spaceSession, authoring, adapter };
};

const onlyNode = (nodes: readonly ThingFlowNode[]): ThingFlowNode => {
  const decorated = nodes[0];
  if (decorated === undefined) throw new Error('The Thing was not decorated.');
  return decorated;
};

describe('canvas Thing authoring', () => {
  it('authors Open before installing the body editor for Edit on a Closed Thing', () => {
    const { result, rerender, spaceSession } = mountAuthoring();

    const closed = onlyNode(result.current.nodes);
    expect(closed.data.bodyEditor).toBeUndefined();

    act(() => {
      expect(closed.data.onEditThing?.(true)).toBe('completed');
      closed.data.onBeginBodyEditing?.();
    });
    expect(spaceSession.getState().working.document.diagrams?.[0]?.positions[THING_ID]?.open).toBe(
      true,
    );
    expect(result.current.nodes[0]?.data.bodyEditor).toBeUndefined();

    rerender({
      expanded: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      thingId: THING_ID,
    });
    expect(result.current.nodes[0]?.data.bodyEditor).toBeDefined();
  });

  it('authors Open for an Alias through the same Thing operation', () => {
    const { result, rerender, spaceSession } = mountAuthoring(undefined, 'alias');
    rerender({
      expanded: false,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      thingId: ALIAS_ID,
    });

    act(() => expect(result.current.openThing(ALIAS_ID)).toBe('completed'));
    expect(spaceSession.getState().working.document.diagrams?.[0]?.positions[ALIAS_ID]?.open).toBe(
      true,
    );

    rerender({
      expanded: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      thingId: ALIAS_ID,
    });

    // Open and read-only are the two halves of ADR 0070, and this Alias is in
    // the working Space, so nothing else is withholding these. Opening keeps
    // Close and the shared Title interaction; it never hands the Alias the
    // caret or the editor that would let it author the Target's content.
    const alias = onlyNode(result.current.nodes);
    expect(alias.data.onEditThing).toBeDefined();
    expect(alias.data.titleEditingEnabled).toBe(true);
    expect(alias.data.onBeginBodyEditing).toBeUndefined();
    expect(alias.data.bodyEditor).toBeUndefined();
  });

  /**
   * `openThing` refuses on `authorOnCanvas`, so presenting withdraws it — and
   * that term is the one the guard gained when it stopped reading the modal
   * pane alone.
   *
   * Unreachable through today's two call sites, both of which are already
   * behind the same answer, which is exactly why it is pinned here: the
   * presenting chrome does reach this canvas (`connectOnCanvas` deliberately
   * survives a presentation), so a future caller Opening a Thing mid-traversal
   * would otherwise take a silent `'retained'` with nothing failing.
   */
  it('withholds Open while presenting, which authorOnCanvas withdraws', () => {
    const { result, rerender, spaceSession } = mountAuthoring();

    rerender({
      expanded: false,
      enabled: true,
      presenting: true,
      nameOnCreation: null,
      thingId: THING_ID,
    });

    act(() => expect(result.current.openThing(THING_ID)).toBe('retained'));
    expect(
      spaceSession.getState().working.document.diagrams?.[0]?.positions[THING_ID]?.open,
    ).not.toBe(true);
  });

  it('forgets a title caret when canvas authoring is withdrawn', () => {
    const { result, rerender, spaceSession } = mountAuthoring();
    act(() => result.current.beginTitleEditing(THING_ID));
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeDefined();

    rerender({
      expanded: false,
      enabled: false,
      presenting: false,
      nameOnCreation: null,
      thingId: THING_ID,
    });
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeUndefined();

    rerender({
      expanded: false,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      thingId: THING_ID,
    });
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeUndefined();
    act(() => expect(result.current.openThing(THING_ID)).toBe('completed'));
    expect(spaceSession.getState().working.document.diagrams?.[0]?.positions[THING_ID]?.open).toBe(
      true,
    );
  });

  it('keeps a live body editor when a modal withdraws canvas controls', () => {
    const { result, rerender } = mountAuthoring();
    rerender({
      expanded: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      thingId: THING_ID,
    });
    act(() => onlyNode(result.current.nodes).data.onBeginBodyEditing?.());

    rerender({
      expanded: true,
      enabled: false,
      presenting: false,
      nameOnCreation: null,
      thingId: THING_ID,
    });

    const withdrawn = onlyNode(result.current.nodes);
    expect(withdrawn.data.bodyEditor).toBeDefined();
    expect(withdrawn.data.resize).toBeUndefined();
  });

  it('withholds competing Thing edits while a body caret is live', () => {
    const { result, rerender } = mountAuthoring();
    rerender({
      expanded: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      thingId: THING_ID,
    });
    act(() => onlyNode(result.current.nodes).data.onBeginBodyEditing?.());

    const editing = onlyNode(result.current.nodes);
    expect(editing.data.titleEditingEnabled).toBe(false);
    expect(editing.data.onBeginTitleEditing).toBeUndefined();
    expect(editing.data.onBeginBodyEditing).toBeUndefined();
  });

  it('temporarily hides a body editor while presenting without discarding its caret', () => {
    const { result, rerender } = mountAuthoring();
    rerender({
      expanded: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      thingId: THING_ID,
    });
    act(() => onlyNode(result.current.nodes).data.onBeginBodyEditing?.());
    expect(onlyNode(result.current.nodes).data.bodyEditor).toBeDefined();

    rerender({
      expanded: true,
      enabled: true,
      presenting: true,
      nameOnCreation: null,
      thingId: THING_ID,
    });
    expect(onlyNode(result.current.nodes).data.bodyEditor).toBeUndefined();

    rerender({
      expanded: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      thingId: THING_ID,
    });
    expect(onlyNode(result.current.nodes).data.bodyEditor).toBeDefined();
  });

  /**
   * An Open Space Thing's floor is its own, and taller than every other Thing's.
   *
   * ADR 0068's embedded Diagram is painted over the Thing, so the Thing's own
   * passengers hold a fixed footer under a fixed rail and `.canvas-thing` hides
   * what will not fit. At the collapsed floor every other Thing resizes to, a
   * Space Thing's Graph selector is simply cut off — so the capability carries
   * `SPACE_THING_MIN_OPEN_SIZE`, which is the inset plus the smallest Thing the
   * embedded Diagram could hold.
   */
  it('allows a Space Thing resize to reach Close while flooring an ordinary Open proposal above its footer', () => {
    const { result, rerender, authoring, adapter, spaceSession } = mountAuthoring(
      undefined,
      'space',
    );
    act(() => {
      authoring.complete({ kind: 'opened-thing', thingId: SPACE_THING_ID });
    });
    rerender({
      expanded: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      thingId: SPACE_THING_ID,
    });

    const space = onlyNode(result.current.nodes);
    expect(space.data.resize?.minWidth).toBe(THING_SIZE.width);
    expect(space.data.resize?.minHeight).toBe(THING_SIZE.height);
    act(() => {
      space.data.resize?.onResizeStart();
      space.data.resize?.onResize({ width: 280, height: 220 });
    });
    expect(adapter.getState().resizeDraft?.size).toEqual(SPACE_THING_MIN_OPEN_SIZE);
    const remembered =
      spaceSession.getState().working.document.diagrams?.[0]?.positions[SPACE_THING_ID];
    act(() => {
      space.data.resize?.onResize(THING_SIZE);
      space.data.resize?.onResizeEnd();
    });
    expect(
      spaceSession.getState().working.document.diagrams?.[0]?.positions[SPACE_THING_ID],
    ).toEqual({
      ...remembered,
      open: false,
    });
  });

  it.each(['markdown', 'alias'] as const)(
    'floors an Open %s Thing resize at the collapsed size',
    (kind) => {
      const { result, rerender } = mountAuthoring(undefined, kind);
      rerender({
        expanded: true,
        enabled: true,
        presenting: false,
        nameOnCreation: null,
        thingId: kind === 'alias' ? ALIAS_ID : THING_ID,
      });

      const thing = onlyNode(result.current.nodes);
      expect(thing.data.resize?.minWidth).toBe(THING_SIZE.width);
      expect(thing.data.resize?.minHeight).toBe(THING_SIZE.height);
    },
  );

  it.each(['markdown', 'alias'] as const)(
    'withholds every authoring control from a projected %s Thing absent from the working Space',
    (kind) => {
      const { result, rerender } = mountAuthoring(undefined, kind);
      rerender({
        expanded: true,
        enabled: true,
        presenting: false,
        nameOnCreation: null,
        thingId: MISSING_THING_ID,
      });
      act(() => result.current.beginTitleEditing(MISSING_THING_ID));

      const missing = onlyNode(result.current.nodes);
      expect(missing.data.titleEditingEnabled).toBe(false);
      expect(missing.data.thingEditingEnabled).toBeUndefined();
      expect(missing.data.onEditThing).toBeUndefined();
      expect(missing.data.onBeginTitleEditing).toBeUndefined();
      expect(missing.data.onBeginBodyEditing).toBeUndefined();
      expect(missing.data.resize).toBeUndefined();
      expect(missing.data.titleEditor).toBeUndefined();
      expect(missing.data.bodyEditor).toBeUndefined();
    },
  );

  it('withdraws authoring when the working Space changes without a projection render', () => {
    const { result, spaceSession } = mountAuthoring();
    expect(onlyNode(result.current.nodes).data.thingEditingEnabled).toBe(true);

    act(() => spaceSession.submit(snapshotWithoutThing));

    const staleProjection = onlyNode(result.current.nodes);
    expect(staleProjection.data.titleEditingEnabled).toBe(false);
    expect(staleProjection.data.thingEditingEnabled).toBeUndefined();
    expect(staleProjection.data.onBeginTitleEditing).toBeUndefined();
  });

  it('forgets an observed body caret when the Thing stops being Open', () => {
    const bodyEditingChanged = vi.fn();
    const { result, rerender } = mountAuthoring(bodyEditingChanged);
    rerender({
      expanded: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      thingId: THING_ID,
    });
    act(() => onlyNode(result.current.nodes).data.onBeginBodyEditing?.());
    expect(bodyEditingChanged).toHaveBeenLastCalledWith(true);

    rerender({
      expanded: false,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      thingId: THING_ID,
    });
    rerender({
      expanded: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      thingId: THING_ID,
    });

    expect(onlyNode(result.current.nodes).data.bodyEditor).toBeUndefined();
    expect(bodyEditingChanged).toHaveBeenLastCalledWith(false);
  });

  it('opens title editing only when a newly created Thing identity changes', () => {
    const { result, rerender } = mountAuthoring();
    rerender({
      expanded: false,
      enabled: true,
      presenting: false,
      nameOnCreation: THING_ID,
      thingId: THING_ID,
    });
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeDefined();

    act(() => onlyNode(result.current.nodes).data.titleEditor?.onCancel());
    rerender({
      expanded: false,
      enabled: true,
      presenting: false,
      nameOnCreation: THING_ID,
      thingId: THING_ID,
    });
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeUndefined();
  });
});

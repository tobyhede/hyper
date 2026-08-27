import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { spaceSnapshotSchema, uuidSchema } from '@project/core';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { CARD_SIZE } from '../src/card';
import { useCanvasCardAuthoring } from '../src/canvas-card-authoring';
import { composeApp } from '../src/compose-app';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const MISSING_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');

const snapshot = spaceSnapshotSchema.parse({
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    layouts: [
      {
        id: LAYOUT_ID,
        title: 'Layout',
        kind: 'positioned',
        positions: { [CARD_ID]: { x: 0, y: 0, open: false } },
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
      },
    ],
    defaultRenderer: LAYOUT_ID,
  },
  cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: 'A source' } }],
});

const node = (expanded: boolean, cardId = CARD_ID): CardFlowNode => ({
  id: cardId,
  type: 'card',
  position: { x: 0, y: 0 },
  width: expanded ? 640 : CARD_SIZE.width,
  height: expanded ? 480 : CARD_SIZE.height,
  data: {
    cardId,
    title: 'A',
    kind: 'markdown',
    body: 'A source',
    expanded,
    active: false,
    selectedForAuthoring: false,
    showContent: false,
    activeGraphId: GRAPH_ID,
    activeGraphColor: '#8a94a6',
    emphasis: 'equal',
    sourceHandles: [],
    targetHandles: [],
  },
});

interface HookProps {
  readonly expanded: boolean;
  readonly enabled: boolean;
  readonly presenting: boolean;
  readonly nameOnCreation: string | null;
  readonly cardId: typeof CARD_ID;
}

const mountAuthoring = (onBodyEditingChange?: (editing: boolean) => void) => {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const spaceSession = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
  const { authoring, adapter } = composeApp({ spaceSession });
  const initialProps: HookProps = {
    expanded: false,
    enabled: true,
    presenting: false,
    nameOnCreation: null,
    cardId: CARD_ID,
  };
  const hook = renderHook(
    ({ expanded, enabled, presenting, nameOnCreation, cardId }: HookProps) =>
      useCanvasCardAuthoring({
        nodes: [node(expanded, cardId)],
        editable: true,
        presenting,
        enabled,
        nameOnCreation,
        authoring,
        spaceSession,
        cardResize: adapter.getState().cardResize,
        onSelectCard: () => undefined,
        onBodyEditingChange,
      }),
    {
      initialProps,
    },
  );
  return { ...hook, spaceSession };
};

const onlyNode = (nodes: readonly CardFlowNode[]): CardFlowNode => {
  const decorated = nodes[0];
  if (decorated === undefined) throw new Error('The Card was not decorated.');
  return decorated;
};

describe('canvas Card authoring', () => {
  it('authors Open before installing the body editor for Edit on a Closed Card', () => {
    const { result, rerender, spaceSession } = mountAuthoring();

    const closed = onlyNode(result.current.nodes);
    expect(closed.data.bodyEditor).toBeUndefined();

    act(() => {
      expect(closed.data.onEditCard?.(true)).toBe('completed');
      closed.data.onBeginBodyEditing?.();
    });
    expect(spaceSession.getState().working.document.layouts?.[0]?.positions[CARD_ID]?.open).toBe(
      true,
    );
    expect(result.current.nodes[0]?.data.bodyEditor).toBeUndefined();

    rerender({
      expanded: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      cardId: CARD_ID,
    });
    expect(result.current.nodes[0]?.data.bodyEditor).toBeDefined();
  });

  it('forgets a title caret when canvas authoring is withdrawn', () => {
    const { result, rerender, spaceSession } = mountAuthoring();
    act(() => result.current.beginTitleEditing(CARD_ID));
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeDefined();

    rerender({
      expanded: false,
      enabled: false,
      presenting: false,
      nameOnCreation: null,
      cardId: CARD_ID,
    });
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeUndefined();

    rerender({
      expanded: false,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      cardId: CARD_ID,
    });
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeUndefined();
    act(() => expect(result.current.openCard(CARD_ID)).toBe('completed'));
    expect(spaceSession.getState().working.document.layouts?.[0]?.positions[CARD_ID]?.open).toBe(
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
      cardId: CARD_ID,
    });
    act(() => onlyNode(result.current.nodes).data.onBeginBodyEditing?.());

    rerender({
      expanded: true,
      enabled: false,
      presenting: false,
      nameOnCreation: null,
      cardId: CARD_ID,
    });

    const withdrawn = onlyNode(result.current.nodes);
    expect(withdrawn.data.bodyEditor).toBeDefined();
    expect(withdrawn.data.resize).toBeUndefined();
  });

  it('withholds competing Card edits while a body caret is live', () => {
    const { result, rerender } = mountAuthoring();
    rerender({
      expanded: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      cardId: CARD_ID,
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
      cardId: CARD_ID,
    });
    act(() => onlyNode(result.current.nodes).data.onBeginBodyEditing?.());
    expect(onlyNode(result.current.nodes).data.bodyEditor).toBeDefined();

    rerender({
      expanded: true,
      enabled: true,
      presenting: true,
      nameOnCreation: null,
      cardId: CARD_ID,
    });
    expect(onlyNode(result.current.nodes).data.bodyEditor).toBeUndefined();

    rerender({
      expanded: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      cardId: CARD_ID,
    });
    expect(onlyNode(result.current.nodes).data.bodyEditor).toBeDefined();
  });

  it('withholds Card editing from a projected node absent from the working Space', () => {
    const { result, rerender } = mountAuthoring();
    rerender({
      expanded: false,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      cardId: MISSING_CARD_ID,
    });
    expect(onlyNode(result.current.nodes).data.cardEditingEnabled).toBeUndefined();
  });

  it('forgets an observed body caret when the Card stops being Open', () => {
    const bodyEditingChanged = vi.fn();
    const { result, rerender } = mountAuthoring(bodyEditingChanged);
    rerender({
      expanded: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      cardId: CARD_ID,
    });
    act(() => onlyNode(result.current.nodes).data.onBeginBodyEditing?.());
    expect(bodyEditingChanged).toHaveBeenLastCalledWith(true);

    rerender({
      expanded: false,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      cardId: CARD_ID,
    });
    rerender({
      expanded: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      cardId: CARD_ID,
    });

    expect(onlyNode(result.current.nodes).data.bodyEditor).toBeUndefined();
    expect(bodyEditingChanged).toHaveBeenLastCalledWith(false);
  });

  it('opens title editing only when a newly created Card identity changes', () => {
    const { result, rerender } = mountAuthoring();
    rerender({
      expanded: false,
      enabled: true,
      presenting: false,
      nameOnCreation: CARD_ID,
      cardId: CARD_ID,
    });
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeDefined();

    act(() => onlyNode(result.current.nodes).data.titleEditor?.onCancel());
    rerender({
      expanded: false,
      enabled: true,
      presenting: false,
      nameOnCreation: CARD_ID,
      cardId: CARD_ID,
    });
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeUndefined();
  });
});

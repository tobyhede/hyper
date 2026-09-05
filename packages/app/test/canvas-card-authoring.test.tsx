import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { spaceSnapshotSchema, uuidSchema, type CardId } from '@project/core';
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
const ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');

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
        positions: {
          [CARD_ID]: { x: 0, y: 0, open: false },
          [ALIAS_ID]: { x: 300, y: 0, open: false },
        },
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
      },
    ],
    defaultLayout: LAYOUT_ID,
  },
  cards: [
    { id: CARD_ID, document: { title: 'A', kind: 'markdown', body: 'A source' } },
    { id: ALIAS_ID, document: { title: 'Return', kind: 'alias', target: CARD_ID } },
  ],
});

const snapshotWithoutCard = spaceSnapshotSchema.parse({
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    layouts: [
      {
        id: LAYOUT_ID,
        title: 'Layout',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
      },
    ],
    defaultLayout: LAYOUT_ID,
  },
  cards: [],
});

const node = (
  expanded: boolean,
  cardId = CARD_ID,
  kind: 'markdown' | 'alias' = 'markdown',
): CardFlowNode => ({
  id: cardId,
  type: 'card',
  position: { x: 0, y: 0 },
  width: expanded ? 640 : CARD_SIZE.width,
  height: expanded ? 480 : CARD_SIZE.height,
  data: {
    cardId,
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
    sourceHandles: [],
    targetHandles: [],
  },
});

interface HookProps {
  readonly expanded: boolean;
  readonly enabled: boolean;
  readonly presenting: boolean;
  readonly nameOnCreation: string | null;
  readonly cardId: CardId;
}

const mountAuthoring = (
  onBodyEditingChange?: (editing: boolean) => void,
  projectedKind: 'markdown' | 'alias' = 'markdown',
  initialName: string | null = null,
  onCreationNamed?: (cardId: string) => void,
) => {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const spaceSession = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
  const { authoring, adapter } = composeApp({ spaceSession });
  const initialProps: HookProps = {
    expanded: false,
    enabled: true,
    presenting: false,
    nameOnCreation: initialName,
    cardId: CARD_ID,
  };
  const hook = renderHook(
    ({ expanded, enabled, presenting, nameOnCreation, cardId }: HookProps) =>
      useCanvasCardAuthoring({
        nodes: [node(expanded, cardId, projectedKind)],
        editable: true,
        presenting,
        enabled,
        nameOnCreation,
        onCreationNamed,
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

  it('authors Open for an Alias through the same Card operation', () => {
    const { result, rerender, spaceSession } = mountAuthoring(undefined, 'alias');
    rerender({
      expanded: false,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      cardId: ALIAS_ID,
    });

    act(() => expect(result.current.openCard(ALIAS_ID)).toBe('completed'));
    expect(spaceSession.getState().working.document.layouts?.[0]?.positions[ALIAS_ID]?.open).toBe(
      true,
    );

    rerender({
      expanded: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      cardId: ALIAS_ID,
    });

    // Open and read-only are the two halves of ADR 0070, and this Alias is in
    // the working Space, so nothing else is withholding these. Opening keeps
    // Close and the shared Title interaction; it never hands the Alias the
    // caret or the editor that would let it author the Target's content.
    const alias = onlyNode(result.current.nodes);
    expect(alias.data.onEditCard).toBeDefined();
    expect(alias.data.titleEditingEnabled).toBe(true);
    expect(alias.data.onBeginBodyEditing).toBeUndefined();
    expect(alias.data.bodyEditor).toBeUndefined();
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

  it.each(['markdown', 'alias'] as const)(
    'withholds every authoring control from a projected %s Card absent from the working Space',
    (kind) => {
      const { result, rerender } = mountAuthoring(undefined, kind);
      rerender({
        expanded: true,
        enabled: true,
        presenting: false,
        nameOnCreation: null,
        cardId: MISSING_CARD_ID,
      });
      act(() => result.current.beginTitleEditing(MISSING_CARD_ID));

      const missing = onlyNode(result.current.nodes);
      expect(missing.data.titleEditingEnabled).toBe(false);
      expect(missing.data.cardEditingEnabled).toBeUndefined();
      expect(missing.data.onEditCard).toBeUndefined();
      expect(missing.data.onBeginTitleEditing).toBeUndefined();
      expect(missing.data.onBeginBodyEditing).toBeUndefined();
      expect(missing.data.resize).toBeUndefined();
      expect(missing.data.titleEditor).toBeUndefined();
      expect(missing.data.bodyEditor).toBeUndefined();
    },
  );

  it('withdraws authoring when the working Space changes without a projection render', () => {
    const { result, spaceSession } = mountAuthoring();
    expect(onlyNode(result.current.nodes).data.cardEditingEnabled).toBe(true);

    act(() => spaceSession.submit(snapshotWithoutCard));

    const staleProjection = onlyNode(result.current.nodes);
    expect(staleProjection.data.titleEditingEnabled).toBe(false);
    expect(staleProjection.data.cardEditingEnabled).toBeUndefined();
    expect(staleProjection.data.onBeginTitleEditing).toBeUndefined();
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
  it('accepts naming on the first mount and acknowledges the installed title editor', () => {
    const accepted = vi.fn();
    const { result } = mountAuthoring(undefined, 'markdown', CARD_ID, accepted);
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeDefined();
    expect(accepted).toHaveBeenCalledWith(CARD_ID);
  });
});

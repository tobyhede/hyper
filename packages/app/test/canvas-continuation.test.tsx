import { render } from '@testing-library/react';
import { ReactFlowProvider, useStoreApi, type Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import { CanvasContinuation } from '../src/components/CanvasContinuation';
import type { Continuation, ContinuationState, PendingContinuation } from '../src/continuation';

/**
 * A `reveal` continuation moves the camera and focuses its Resource, and the
 * focus does not wait on the move.
 *
 * React Flow's own provider is mounted without a `<ReactFlow>` inside it, so
 * there is no pan-zoom instance and the Resource is never measured: the
 * `fitView` the adapter issues stays queued and its Promise never settles,
 * which is what a superseded move answers at the pinned release (ADR 0043).
 * What is under test is which move the adapter queues and whether it focuses
 * regardless of that move's fate.
 */

const RESOURCE = uuidSchema.parse('00000000-0000-4000-8000-000000000002');

const holding = (pending: PendingContinuation): Continuation => {
  let state: ContinuationState = { pending };
  return {
    getState: () => state,
    subscribe: () => () => undefined,
    request: (next) => {
      state = { pending: next };
    },
    take: () => {
      state = { pending: null };
    },
    dispose: () => undefined,
  };
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('a reveal continuation', () => {
  it('focuses its Resource without waiting for the camera move to settle', () => {
    const node = document.createElement('div');
    node.className = 'react-flow__node';
    node.dataset['id'] = RESOURCE;
    node.tabIndex = 0;
    document.body.append(node);
    const continuation = holding({
      target: { kind: 'resource', resourceId: RESOURCE },
      select: true,
      then: 'reveal',
    });
    const onSelectResource = vi.fn();
    const initialNodes: Node[] = [{ id: RESOURCE, position: { x: 0, y: 0 }, data: {} }];
    let store: ReturnType<typeof useStoreApi> | undefined;
    const StoreProbe = () => {
      store = useStoreApi();
      return null;
    };

    render(
      <ReactFlowProvider initialNodes={initialNodes}>
        <StoreProbe />
        <CanvasContinuation
          continuation={continuation}
          onSelectResource={onSelectResource}
          onSelectEdge={vi.fn()}
        />
      </ReactFlowProvider>,
    );

    expect(store?.getState().fitViewQueued).toBe(true);
    expect(store?.getState().fitViewOptions?.nodes).toEqual([{ id: RESOURCE }]);
    expect(onSelectResource).toHaveBeenCalledWith(RESOURCE);
    expect(document.activeElement).toBe(node);
    expect(continuation.getState().pending).toBeNull();
  });
  it('reaches the requesting drawing when the same Resource is drawn twice', () => {
    const nodes = ['left', 'right'].map((occurrence) => {
      const node = document.createElement('div');
      node.className = 'react-flow__node';
      node.dataset['id'] = `${occurrence}:${RESOURCE}`;
      node.tabIndex = 0;
      document.body.append(node);
      return node;
    });
    const continuation = holding({
      target: { kind: 'resource', resourceId: RESOURCE },
      select: true,
      then: 'focus',
    });
    const selected = vi.fn();
    render(
      <ReactFlowProvider>
        <CanvasContinuation
          continuation={continuation}
          onSelectResource={selected}
          onSelectEdge={vi.fn()}
          resourceNodeId={(resourceId) => `right:${resourceId}`}
        />
      </ReactFlowProvider>,
    );
    expect(document.activeElement).toBe(nodes[1]);
    expect(selected).toHaveBeenCalledWith(RESOURCE);
    expect(continuation.getState().pending).toBeNull();
  });
});

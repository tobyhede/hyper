import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import type { Continuation, ContinuationState, PendingContinuation } from '../src/continuation';

/**
 * A `reveal` continuation moves the camera and focuses its Resource, and the
 * focus does not wait on the move.
 *
 * The stubbed `fitView` returns a Promise that never settles, which is what a
 * superseded move answers at the pinned release (ADR 0043). React Flow is mocked
 * rather than mounted, so what is under test is which command the adapter
 * issues and whether it focuses regardless of that command's fate.
 */

const flow = vi.hoisted(() => ({
  fitView: vi.fn(
    (_options: { nodes?: { id: string }[]; padding?: number; duration?: number }) =>
      new Promise<boolean>(() => undefined),
  ),
  getNode: vi.fn((id: string) => ({ id })),
}));

vi.mock('@xyflow/react', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useReactFlow: () => flow,
  useStore: <T,>(selector: (state: { edges: never[]; nodes: never[] }) => T): T =>
    selector({ edges: [], nodes: [] }),
}));

const { CanvasContinuation } = await import('../src/components/CanvasContinuation');

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
  flow.fitView.mockClear();
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

    render(
      <CanvasContinuation
        continuation={continuation}
        onSelectResource={onSelectResource}
        onSelectEdge={vi.fn()}
      />,
    );

    expect(flow.fitView).toHaveBeenCalledTimes(1);
    expect(flow.fitView.mock.calls[0]?.[0].nodes).toEqual([{ id: RESOURCE }]);
    expect(onSelectResource).toHaveBeenCalledWith(RESOURCE);
    expect(document.activeElement).toBe(node);
    expect(continuation.getState().pending).toBeNull();
  });
});

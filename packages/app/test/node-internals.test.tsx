import { useEffect, useRef } from 'react';
import { act, render } from '@testing-library/react';
import {
  Handle,
  Position,
  ReactFlow,
  useUpdateNodeInternals,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

/**
 * React Flow re-measures a card's handles through `updateNodeInternals`, and
 * that path reads the viewport's zoom with `new window.DOMMatrixReadOnly(...)`
 * (`@xyflow/system`). jsdom ships no `DOMMatrixReadOnly`, so the call throws —
 * from inside a `requestAnimationFrame` callback, which is exactly why nothing
 * caught it: the error never reaches a test body, so Vitest prints every test as
 * passing and then exits 1 on the unhandled error.
 *
 * `CardNode` deliberately does *not* call `updateNodeInternals` — a forced
 * remeasure discards the handles `projection.ts` declares for Routes not yet
 * incident to the card, which breaks the next connection. But the stub is still
 * required: React Flow's own `useResizeObserver` reaches the same
 * `DOMMatrixReadOnly` call with `force: true`, so any test rendering a real
 * `<ReactFlow>` can hit it without anyone calling the hook directly.
 *
 * The node below drives that path deliberately rather than waiting for a resize,
 * because an explicit trigger is the only way to make the throw deterministic.
 */

type ProbeNode = Node<{ handles: number }, 'probe'>;

function ProbeNode({ id, data }: NodeProps<ProbeNode>) {
  const updateNodeInternals = useUpdateNodeInternals();
  const measured = useRef<number | null>(null);

  useEffect(() => {
    const previous = measured.current;
    measured.current = data.handles;
    if (previous === null || previous === data.handles) return;
    updateNodeInternals(id);
  }, [id, data.handles, updateNodeInternals]);

  return (
    <>
      <Handle type="target" position={Position.Left} id="in" />
      {Array.from({ length: data.handles }, (_, index) => (
        <Handle
          key={index}
          type="source"
          position={Position.Right}
          id={`out-${index}`}
          style={{ top: 8 + index * 12 }}
        />
      ))}
      <span>probe</span>
    </>
  );
}

// One stable object, or React Flow warns #002 on every render.
const nodeTypes: NodeTypes = { probe: ProbeNode };

const flow = (handles: number) => (
  <ReactFlow
    nodes={[{ id: 'probe-1', type: 'probe', position: { x: 0, y: 0 }, data: { handles } }]}
    edges={[]}
    nodeTypes={nodeTypes}
  />
);

/** Let React Flow's `requestAnimationFrame` callback actually run. */
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

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

it('re-measures a node whose handles changed without throwing out of the frame', async () => {
  const errors: string[] = [];
  const onError = (event: ErrorEvent) => {
    errors.push(event.message);
  };
  window.addEventListener('error', onError);

  try {
    const view = render(flow(1));
    await settle();
    view.rerender(flow(2));
    await settle();
  } finally {
    window.removeEventListener('error', onError);
  }

  expect(errors).toEqual([]);
});

/**
 * The zoom read off that matrix divides every measured handle offset, so a stub
 * that answers with a fixed identity would place handles wrongly and silently
 * the moment a test zooms. React Flow only ever writes the viewport transform as
 * `translate(Xpx,Ypx) scale(Z)`, which is the form that has to survive.
 */
it('reads the viewport scale back off a transform string', () => {
  expect(new window.DOMMatrixReadOnly('translate(10px,20px) scale(1)').m22).toBe(1);
  expect(new window.DOMMatrixReadOnly('translate(-4px,8px) scale(2.5)').m22).toBe(2.5);
  expect(new window.DOMMatrixReadOnly('none').m22).toBe(1);
});

import { render } from '@testing-library/react';
import { ReactFlowProvider, type ReactFlowInstance } from '@xyflow/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { CARD_SIZE } from '../src/card';
import { SpaceCanvas } from '../src/components/SpaceCanvas';

const camera = vi.hoisted(() => ({
  fitView: vi.fn(),
  setCenter: vi.fn(),
  getZoom: vi.fn(),
  getNode: vi.fn(),
}));

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual: Record<string, unknown> & { useReactFlow: () => ReactFlowInstance } =
    await importOriginal();
  return {
    ...actual,
    useReactFlow: () => ({
      ...actual.useReactFlow(),
      fitView: camera.fitView,
      setCenter: camera.setCenter,
      getZoom: camera.getZoom,
      getNode: camera.getNode,
    }),
    useStore: (selector: (state: { width: number; height: number }) => unknown) =>
      selector({ width: 299, height: 168 }),
  };
});

const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');

const node: CardFlowNode = {
  id: CARD_ID,
  type: 'card',
  position: { x: 0, y: 0 },
  width: CARD_SIZE.width,
  height: CARD_SIZE.height,
  data: {
    cardId: CARD_ID,
    title: 'A',
    active: false,
    selectedForAuthoring: false,
    showContent: false,
    activeGraphId: null,
    activeGraphColor: '#8a94a6',
    emphasis: 'equal',
    sourceHandles: [],
    targetHandles: [],
  },
};

function rejectedAnimation(onUnhandled: () => void): Promise<boolean> {
  let handled = false;
  let continued = false;
  queueMicrotask(() => {
    if (!handled && !continued) onUnhandled();
  });
  return {
    then: () => {
      continued = true;
      return rejectedAnimation(onUnhandled);
    },
    catch: () => {
      handled = true;
      return Promise.resolve(false);
    },
  } as Promise<boolean>;
}

function resolvedAnimation(): Promise<boolean> {
  return {
    then: (onFulfilled: (value: boolean) => unknown) => {
      onFulfilled(true);
      return Promise.resolve(true);
    },
  } as Promise<boolean>;
}

function renderCanvas({ presenting = false }: { presenting?: boolean } = {}): void {
  render(
    <ReactFlowProvider>
      <SpaceCanvas
        nodes={[node]}
        edges={[]}
        activeCardId={presenting ? CARD_ID : null}
        presenting={presenting}
        editable={false}
        titleEditingEnabled={false}
        onNodesChange={() => undefined}
        onConnect={() => undefined}
        acceptsConnection={() => false}
        acceptsNewCardTarget={() => false}
        onConnectEnd={() => undefined}
        onCreateConnectedCard={() => undefined}
        newCardTitle="Card 2"
        onOpenCard={() => undefined}
        onCompleteCardTitle={() => null}
        editableCardIds={new Set()}
        graphs={[]}
        colorByGraphId={{}}
        activeGraphId={null}
        activeGraphCardIds={new Set()}
      />
    </ReactFlowProvider>,
  );
}

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
afterEach(() => vi.clearAllMocks());

describe('the overview camera', () => {
  it('contains a rejected camera animation', async () => {
    const onUnhandled = vi.fn();
    camera.fitView.mockReturnValue(rejectedAnimation(onUnhandled));

    renderCanvas();
    await Promise.resolve();

    expect(onUnhandled).not.toHaveBeenCalled();
  });
});

describe('the presenting camera', () => {
  beforeEach(() => {
    camera.getNode.mockReturnValue(node);
  });

  it('contains a rejected card-to-card animation at the current zoom', async () => {
    const onUnhandled = vi.fn();
    camera.getZoom.mockReturnValue(1);
    camera.setCenter.mockReturnValue(rejectedAnimation(onUnhandled));

    renderCanvas({ presenting: true });
    await Promise.resolve();

    expect(camera.setCenter).toHaveBeenCalledOnce();
    expect(onUnhandled).not.toHaveBeenCalled();
  });

  it('contains a rejection from the first stage of a split camera move', async () => {
    const onUnhandled = vi.fn();
    camera.getZoom.mockReturnValue(0.5);
    camera.setCenter.mockReturnValue(rejectedAnimation(onUnhandled));

    renderCanvas({ presenting: true });
    await Promise.resolve();

    expect(camera.setCenter).toHaveBeenCalledOnce();
    expect(onUnhandled).not.toHaveBeenCalled();
  });

  it('contains a rejection from the second stage of a split camera move', async () => {
    const onUnhandled = vi.fn();
    camera.getZoom.mockReturnValue(0.5);
    camera.setCenter
      .mockReturnValueOnce(resolvedAnimation())
      .mockReturnValueOnce(rejectedAnimation(onUnhandled));

    renderCanvas({ presenting: true });
    await Promise.resolve();

    expect(camera.setCenter).toHaveBeenCalledTimes(2);
    expect(onUnhandled).not.toHaveBeenCalled();
  });
});

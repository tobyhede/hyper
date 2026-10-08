import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The opening framing camera, against a stubbed camera call that **never
 * settles** — what a superseded d3 transition does, so nothing may depend on
 * settlement (ADR 0043).
 *
 * React Flow is mocked rather than mounted. What is under test is which command
 * the effect issues.
 */

const flow = vi.hoisted(() => ({
  fitView: vi.fn(
    (_options: {
      nodes?: { id: string }[];
      padding?: number;
      duration?: number;
      maxZoom?: number;
    }) => new Promise<boolean>(() => undefined),
  ),
  setViewport: vi.fn(
    (_viewport: { x: number; y: number; zoom: number }, _options?: { duration?: number }) =>
      new Promise<boolean>(() => undefined),
  ),
  viewport: { width: 1000, height: 800 },
}));

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => flow,
  useStore: (selector: (state: { width: number; height: number }) => number) =>
    selector(flow.viewport),
}));

const { OpeningFramingCamera } = await import('../src/components/cameras');

const fits = () => flow.fitView.mock.calls;

beforeEach(() => {
  flow.fitView.mockClear();
  flow.setViewport.mockClear();
  flow.viewport = { width: 1000, height: 800 };
});

describe('the opening framing camera', () => {
  it('places the entered canvas from stored framing and the canvas size, not fitView', () => {
    render(<OpeningFramingCamera framing={{ centreX: 100, centreY: 50, zoom: 2 }} />);

    expect(fits()).toHaveLength(0);
    expect(flow.setViewport).toHaveBeenCalledTimes(1);
    expect(flow.setViewport.mock.calls[0]?.[0]).toEqual({ x: 300, y: 300, zoom: 2 });
    expect(flow.setViewport.mock.calls[0]?.[1]).toEqual({ duration: 0 });
  });

  it('does nothing when Enter carried no framing', () => {
    render(<OpeningFramingCamera framing={undefined} />);

    expect(flow.setViewport).not.toHaveBeenCalled();
  });
});

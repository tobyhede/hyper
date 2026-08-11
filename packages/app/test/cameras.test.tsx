import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The camera seam, and what it does when a move is interrupted.
 *
 * Every stubbed camera call here returns a Promise that **never settles**, which
 * is the ordinary case rather than an edge one: `getD3Transition` resolves on
 * d3's `end`, a superseded transition fires `interrupt` instead, and `fitView`
 * additionally reuses one resolver across calls. Nothing in the seam may depend
 * on settlement (ADR 0043), so every assertion below has to hold against that
 * stub — and the next move has to be issued regardless of the last one's fate.
 *
 * React Flow is mocked rather than mounted. What is under test is which commands
 * the effects issue; mounting a real flow would supply a real d3 transition, and
 * a real d3 transition is the thing whose settlement cannot be relied on.
 */

const flow = vi.hoisted(() => ({
  fitView: vi.fn(() => new Promise<boolean>(() => undefined)),
  getNode: vi.fn(),
  viewport: { width: 1000, height: 800 },
}));

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => flow,
  useStore: (selector: (state: { width: number; height: number }) => number) =>
    selector(flow.viewport),
}));

const { OverviewCamera, PresentingCamera } = await import('../src/components/cameras');

const CARD = { id: 'a', position: { x: 0, y: 0 }, width: 200, height: 100 };
const OTHER_CARD = { id: 'b', position: { x: 600, y: 0 }, width: 200, height: 100 };

const fits = () =>
  flow.fitView.mock.calls as unknown as [
    { nodes?: { id: string }[]; padding?: number; duration?: number; maxZoom?: number },
  ][];

beforeEach(() => {
  flow.fitView.mockClear();
  flow.viewport = { width: 1000, height: 800 };
  flow.getNode.mockImplementation((id: string) =>
    id === CARD.id ? CARD : id === OTHER_CARD.id ? OTHER_CARD : undefined,
  );
});

describe('the presenting camera', () => {
  it('frames the active Card in one move', () => {
    render(<PresentingCamera activeCardId={CARD.id} />);

    expect(fits()).toHaveLength(1);
    expect(fits()[0]?.[0].nodes).toEqual([{ id: CARD.id }]);
    expect(fits()[0]?.[0].duration).toBeGreaterThan(0);
  });

  /**
   * The move this seam used to make was two commands with the second chained on
   * the first's Promise, so an interruption inside the first left the camera at
   * the overview zoom. One command cannot strand, and the next arrival must be
   * issued whatever became of the last — which the never-settling stub is what
   * proves.
   */
  it('issues the next arrival without waiting for the last to settle', () => {
    const view = render(<PresentingCamera activeCardId={CARD.id} />);

    view.rerender(<PresentingCamera activeCardId={OTHER_CARD.id} />);

    expect(fits()).toHaveLength(2);
    expect(fits()[1]?.[0].nodes).toEqual([{ id: OTHER_CARD.id }]);
  });

  it('re-frames the same Card when the viewport is resized', () => {
    const view = render(<PresentingCamera activeCardId={CARD.id} />);

    flow.viewport = { width: 500, height: 400 };
    view.rerender(<PresentingCamera activeCardId={CARD.id} />);

    expect(fits()).toHaveLength(2);
  });

  /**
   * `fitView` does not treat an unmatched `nodes` filter as "nothing to do" — it
   * fits the bounds of nothing, which is a zero-size rect at the origin. Both
   * guards exist to keep the camera away from that.
   */
  it.each([
    ['no Card is active', { activeCardId: null }],
    ['the active Card is not on the canvas yet', { activeCardId: 'missing' }],
  ])('does not move the camera when %s', (_name, props) => {
    render(<PresentingCamera {...props} />);

    expect(fits()).toHaveLength(0);
  });

  it('does not move the camera before the container has been measured', () => {
    flow.viewport = { width: 0, height: 0 };

    render(<PresentingCamera activeCardId={CARD.id} />);

    expect(fits()).toHaveLength(0);
  });
});

/**
 * The overview fit belongs to React Flow's `fitView` prop, which has already run
 * at first paint. This effect owns the *return* only, and firing it on mount put
 * a second animated fit after the prop's — every load flying the graph in from
 * the viewport origin.
 */
describe('the overview camera', () => {
  it('pulls back when presenting ends', () => {
    const view = render(<OverviewCamera presenting={true} />);

    view.rerender(<OverviewCamera presenting={false} />);

    expect(fits()).toHaveLength(1);
    expect(fits()[0]?.[0].maxZoom).toBe(1);
  });

  it('does not fit on mount, whether or not presenting', () => {
    render(<OverviewCamera presenting={false} />);
    render(<OverviewCamera presenting={true} />);

    expect(fits()).toHaveLength(0);
  });
});

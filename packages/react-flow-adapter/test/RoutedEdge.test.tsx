import '@testing-library/jest-dom/vitest';
import { render, renderHook, screen } from '@testing-library/react';
import type * as ReactFlowReact from '@xyflow/react';
import { Position, type EdgeProps } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import { selfEdgeAttachment } from '../src/edge-attachment';
import { RoutedEdge, useEdgeAttachment } from '../src/RoutedEdge';
import type { RoutedFlowEdge } from '../src/RoutedEdge';
import { uuid } from './uuid';

/**
 * React Flow is the system boundary, so the store is stood in for and the
 * assertions read what the Edge asked it. What matters is that the side is
 * chosen from where the two Resources are *now*: the projection does not run again
 * during a drag, so the handles named on the Edge below are the ones a previous
 * settle left behind (ADR 0087).
 */
interface MockInternalNode {
  internals: { positionAbsolute: { x: number; y: number } };
  measured: { width: number; height: number };
}

const { nodes } = vi.hoisted(() => ({ nodes: new Map<string, MockInternalNode>() }));

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactFlowReact>();
  return {
    ...actual,
    useInternalNode: (id: string) => nodes.get(id),
    /** React Flow's own `<path>`, stood in for so a test can read the curve the
     *  Edge asked for. */
    BaseEdge: ({ path, markerEnd }: { path: string; markerEnd?: string }) => (
      <div data-testid="edge-path" data-d={path} data-marker-end={markerEnd} />
    ),
  };
});

const rect = (x: number, y: number, width = 260, height = 146): MockInternalNode => ({
  internals: { positionAbsolute: { x, y } },
  measured: { width, height },
});

/** An Edge as React Flow hands it to a custom component. The coordinates and
 *  positions are React Flow's own answer for the handles the Edge names, which
 *  is exactly what this Edge replaces. */
const edgeProps = (source: string, target: string): EdgeProps<RoutedFlowEdge> => ({
  id: `${source}->${target}`,
  source,
  target,
  sourceX: 0,
  sourceY: 0,
  sourcePosition: Position.Right,
  targetX: 0,
  targetY: 0,
  targetPosition: Position.Left,
});

describe('useEdgeAttachment', () => {
  it('attaches on the facing sides of where the two Resources are now', () => {
    nodes.set('above', rect(0, 0));
    nodes.set('below', rect(0, 500));

    const { result } = renderHook(() => useEdgeAttachment(edgeProps('above', 'below')));

    expect(result.current).toEqual({
      sourceX: 130,
      sourceY: 158,
      sourcePosition: Position.Bottom,
      targetX: 130,
      targetY: 488,
      targetPosition: Position.Top,
    });
  });

  /*
   * React Flow resolves an Edge's position from its handles before it renders
   * the Edge at all, and hands the answer down as these six props. Reading them
   * when the store cannot answer keeps this a total function without an
   * assertion standing in for a node that is not there.
   */
  it("keeps React Flow's own answer when the store holds neither Resource", () => {
    nodes.clear();

    const props = edgeProps('gone', 'also-gone');
    const { result } = renderHook(() => useEdgeAttachment(props));

    expect(result.current).toEqual({
      sourceX: props.sourceX,
      sourceY: props.sourceY,
      sourcePosition: props.sourcePosition,
      targetX: props.targetX,
      targetY: props.targetY,
      targetPosition: props.targetPosition,
    });
  });

  it('loops a self-Edge rather than dividing by the vector from a Resource to itself', () => {
    nodes.clear();
    nodes.set('alone', rect(100, 200));

    const { result } = renderHook(() => useEdgeAttachment(edgeProps('alone', 'alone')));

    expect(result.current).toEqual(selfEdgeAttachment({ x: 100, y: 200, width: 260, height: 146 }));
  });
});

describe('RoutedEdge', () => {
  it('draws the curve between the two anchors it attaches to', () => {
    nodes.clear();
    nodes.set('above', rect(0, 0));
    nodes.set('below', rect(0, 500));

    render(<RoutedEdge {...edgeProps('above', 'below')} />);

    const path = screen.getByTestId('edge-path').getAttribute('data-d') ?? '';
    expect(path.startsWith('M130,158')).toBe(true);
    expect(path.endsWith('130,488')).toBe(true);
  });
});

describe("an Edge's head", () => {
  const DOTTED = {
    graphId: uuid('00000000-0000-4000-8000-000000000001'),
    laneOffset: 0,
    laneReach: 0,
    endTrim: 0,
    headShape: 'dot',
  } as const;

  const markerOf = (container: HTMLElement): Element => {
    const reference = screen.getByTestId('edge-path').getAttribute('data-marker-end') ?? '';
    const id = /^url\('#(.+)'\)$/.exec(reference)?.[1];
    expect(id, 'the path ends in a marker it names').toBeDefined();
    const marker = [...container.querySelectorAll('marker')].find((m) => m.id === id);
    expect(marker, 'the marker the path names is drawn').toBeDefined();
    return marker!;
  };

  it("ends in its Graph's head shape and colour, at the end of a line that stops short", () => {
    nodes.clear();
    nodes.set('above', rect(0, 0));
    nodes.set('below', rect(0, 500));

    const { container } = render(
      <svg>
        <RoutedEdge
          {...edgeProps('above', 'below')}
          data={{
            graphId: uuid('00000000-0000-4000-8000-000000000001'),
            laneOffset: 8,
            laneReach: 8,
            endTrim: 0.2,
            headShape: 'dot',
          }}
          style={{ stroke: '#2ca02c', opacity: 0.4 }}
        />
      </svg>,
    );

    const glyph = markerOf(container).querySelector('[data-slot="graph-head-shape"]');
    expect(glyph).toHaveAttribute('data-head-shape', 'dot');
    expect(glyph).toHaveAttribute('fill', '#2ca02c');
  });

  it('draws its line before its marker, so the line is the first thing in the Edge', () => {
    nodes.clear();
    nodes.set('above', rect(0, 0));
    nodes.set('below', rect(0, 500));

    const { container } = render(
      <svg>
        <RoutedEdge {...edgeProps('above', 'below')} data={DOTTED} style={{ stroke: '#1f77b4' }} />
      </svg>,
    );

    expect(container.querySelector('marker')).not.toBeNull();
    expect(container.querySelector('svg')?.firstElementChild).toBe(screen.getByTestId('edge-path'));
  });

  it('draws no head for an Edge carrying no Graph data', () => {
    nodes.clear();
    nodes.set('above', rect(0, 0));
    nodes.set('below', rect(0, 500));

    const { container } = render(
      <svg>
        <RoutedEdge {...edgeProps('above', 'below')} style={{ stroke: '#1f77b4' }} />
      </svg>,
    );

    expect(screen.getByTestId('edge-path')).not.toHaveAttribute('data-marker-end');
    expect(container.querySelector('marker')).toBeNull();
  });

  // One Map can be drawn twice on a page — on the canvas and inside an Open
  // Space Resource — so the same Edge id is rendered twice, each in its own
  // colour context.
  it('names a marker of its own, even where the same Edge is drawn twice', () => {
    nodes.clear();
    nodes.set('a', rect(0, 0));
    nodes.set('b', rect(0, 500));

    const { container } = render(
      <svg>
        <RoutedEdge {...edgeProps('a', 'b')} id="g1::a::b" data={DOTTED} />
        <RoutedEdge {...edgeProps('a', 'b')} id="g1::a::b" data={DOTTED} />
      </svg>,
    );

    const ids = [...container.querySelectorAll('marker')].map((marker) => marker.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    const references = screen
      .getAllByTestId('edge-path')
      .map((path) => path.getAttribute('data-marker-end'));
    expect(references).toEqual(ids.map((id) => `url('#${id}')`));
  });
});

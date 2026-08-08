import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { Node as FlowNode } from '@xyflow/react';
import { vi } from 'vitest';
import { GraphHud } from '../src/GraphHud';
import { uuid } from './uuid';

vi.mock('@xyflow/react', () => ({
  Panel: ({ position, children }: { position: string; children: React.ReactNode }) => (
    <aside data-testid="panel" data-position={position}>
      {children}
    </aside>
  ),
  MiniMap: ({
    nodeColor,
    nodeStrokeColor,
  }: {
    nodeColor: string | ((node: FlowNode) => string);
    nodeStrokeColor: string | ((node: FlowNode) => string);
  }) => {
    const color = (value: string | ((node: FlowNode) => string), node: FlowNode) =>
      typeof value === 'function' ? value(node) : value;
    return (
      <div
        data-testid="minimap"
        data-active-fill={color(nodeColor, {
          id: uuid('00000000-0000-4000-8000-000000000001'),
          position: { x: 0, y: 0 },
          data: {},
        })}
        data-active-stroke={color(nodeStrokeColor, {
          id: uuid('00000000-0000-4000-8000-000000000001'),
          position: { x: 0, y: 0 },
          data: {},
        })}
        data-other-fill={color(nodeColor, {
          id: uuid('00000000-0000-4000-8000-000000000002'),
          position: { x: 0, y: 0 },
          data: {},
        })}
        data-other-stroke={color(nodeStrokeColor, {
          id: uuid('00000000-0000-4000-8000-000000000002'),
          position: { x: 0, y: 0 },
          data: {},
        })}
      />
    );
  },
}));

describe('GraphHud', () => {
  it('groups the graph key above a minimap coloured by active-graph membership', () => {
    const activeGraphId = uuid('00000000-0000-4000-8000-000000000010');
    const { container } = render(
      <GraphHud
        graphs={[
          { id: activeGraphId, title: 'Primary', color: '#6ea8fe', edges: [] },
          {
            id: uuid('00000000-0000-4000-8000-000000000011'),
            title: 'Alternate',
            color: '#f4a259',
            edges: [],
          },
        ]}
        colorByGraphId={{ [activeGraphId]: '#6ea8fe' }}
        activeGraphId={activeGraphId}
        activeGraphCardIds={new Set([uuid('00000000-0000-4000-8000-000000000001')])}
      />,
    );

    expect(screen.getByTestId('panel')).toHaveAttribute('data-position', 'bottom-right');
    const legend = screen.getByTestId('graph-legend');
    const minimap = screen.getByTestId('minimap');
    expect(
      legend.compareDocumentPosition(minimap) & globalThis.Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(minimap).toHaveAttribute('data-active-fill', 'var(--panel-2)');
    expect(minimap).toHaveAttribute('data-active-stroke', '#6ea8fe');
    expect(minimap).toHaveAttribute('data-other-fill', 'var(--panel-2)');
    expect(minimap).toHaveAttribute('data-other-stroke', 'var(--border)');
    expect(container).toHaveTextContent('Primary');
    expect(container).toHaveTextContent('Alternate');
  });
});

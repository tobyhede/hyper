import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { vi } from 'vitest';
import { RouteHud } from '../src/RouteHud';
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
    nodeColor: string | ((node: Node) => string);
    nodeStrokeColor: string | ((node: Node) => string);
  }) => {
    const color = (value: string | ((node: Node) => string), node: Node) =>
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

describe('RouteHud', () => {
  it('groups the route key above a minimap coloured by active-route membership', () => {
    const activeRouteId = uuid('00000000-0000-4000-8000-000000000010');
    const { container } = render(
      <RouteHud
        routes={[
          { id: activeRouteId, title: 'Primary', color: '#6ea8fe', edges: [] },
          {
            id: uuid('00000000-0000-4000-8000-000000000011'),
            title: 'Alternate',
            color: '#f4a259',
            edges: [],
          },
        ]}
        colorByRouteId={{ [activeRouteId]: '#6ea8fe' }}
        activeRouteId={activeRouteId}
        activeRouteCardIds={new Set([uuid('00000000-0000-4000-8000-000000000001')])}
      />,
    );

    expect(screen.getByTestId('panel')).toHaveAttribute('data-position', 'bottom-right');
    const legend = screen.getByTestId('route-legend');
    const minimap = screen.getByTestId('minimap');
    expect(legend.compareDocumentPosition(minimap) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(minimap).toHaveAttribute('data-active-fill', 'var(--panel-2)');
    expect(minimap).toHaveAttribute('data-active-stroke', '#6ea8fe');
    expect(minimap).toHaveAttribute('data-other-fill', 'var(--panel-2)');
    expect(minimap).toHaveAttribute('data-other-stroke', 'var(--border)');
    expect(container).toHaveTextContent('Primary');
    expect(container).toHaveTextContent('Alternate');
  });
});

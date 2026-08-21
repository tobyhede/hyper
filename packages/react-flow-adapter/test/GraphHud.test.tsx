import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
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
    expect(minimap).toHaveAttribute('data-active-fill', 'var(--secondary)');
    expect(minimap).toHaveAttribute('data-active-stroke', '#6ea8fe');
    expect(minimap).toHaveAttribute('data-other-fill', 'var(--secondary)');
    expect(minimap).toHaveAttribute('data-other-stroke', 'var(--border)');
    expect(container).toHaveTextContent('Primary');
    expect(container).toHaveTextContent('Alternate');
  });

  /**
   * The key's own two claims, now that the HUD owns the markup rather than
   * delegating it: the stripe is the *resolved* colour, and the Active Graph is
   * the one that is not dimmed.
   *
   * The projection's answer outranks the Graph's own `color`, which is what
   * `graphColor` decides and what the Sidebar reads through the same seam — so
   * a stripe here disagreeing with a Sidebar glyph would mean the seam had been
   * bypassed.
   */
  it('resolves each stripe through the shared Graph colour seam and dims the rest', () => {
    const activeGraphId = uuid('00000000-0000-4000-8000-000000000010');
    const otherGraphId = uuid('00000000-0000-4000-8000-000000000011');
    render(
      <GraphHud
        graphs={[
          { id: activeGraphId, title: 'Primary', color: '#6ea8fe', edges: [] },
          { id: otherGraphId, title: 'Alternate', color: '#f4a259', edges: [] },
        ]}
        colorByGraphId={{ [activeGraphId]: '#123456' }}
        activeGraphId={activeGraphId}
        activeGraphCardIds={new Set()}
      />,
    );

    const key = screen.getByTestId('graph-legend');
    expect(within(key).getByText('Graphs')).toBeInTheDocument();
    const active = within(key).getByText('Primary').closest('li');
    const inactive = within(key).getByText('Alternate').closest('li');
    expect(active).toHaveAttribute('data-active', 'true');
    expect(active).toHaveStyle({ opacity: '1' });
    // The projection's colour, not the Graph's own — `graphColor`'s precedence.
    expect(active?.querySelector('[aria-hidden="true"]')).toHaveStyle({ background: '#123456' });
    expect(inactive).toHaveAttribute('data-active', 'false');
    expect(inactive).toHaveStyle({ opacity: '0.5' });
    expect(inactive?.querySelector('[aria-hidden="true"]')).toHaveStyle({ background: '#f4a259' });
  });

  /*
   * `list-none` sets `list-style: none`, which makes Safari/VoiceOver drop list
   * semantics and stop announcing the Graph count. The explicit role restores it.
   *
   * Asserted as an attribute rather than through `getByRole('list')` on purpose:
   * jsdom maps `<ul>` to the list role from the tag alone and never applies the
   * Safari quirk, so a role query passes with or without the fix and would prove
   * nothing. The attribute is the whole deliverable here.
   */
  it('keeps list semantics despite the unstyled list', () => {
    render(
      <GraphHud
        graphs={[{ id: uuid('00000000-0000-4000-8000-000000000010'), title: 'Only', edges: [] }]}
        colorByGraphId={{}}
        activeGraphId={null}
        activeGraphCardIds={new Set()}
      />,
    );

    expect(within(screen.getByTestId('graph-legend')).getByRole('list')).toHaveAttribute(
      'role',
      'list',
    );
  });
});

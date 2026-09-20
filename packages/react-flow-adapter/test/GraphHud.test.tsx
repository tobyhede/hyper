import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import { GraphHud } from '../src/GraphHud';
import { uuid } from './uuid';

vi.mock('@xyflow/react', () => ({
  Panel: ({
    position,
    style,
    children,
  }: {
    position: string;
    style?: React.CSSProperties;
    children: React.ReactNode;
  }) => (
    <aside data-testid="panel" data-position={position} style={style}>
      {children}
    </aside>
  ),
  MiniMap: ({
    style,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    bgColor?: string;
    nodeColor?: unknown;
    nodeStrokeColor?: unknown;
    pannable?: boolean;
    zoomable?: boolean;
  }) => (
    <div
      data-testid="minimap"
      data-custom-background={props.bgColor === undefined ? undefined : 'true'}
      data-custom-node-color={props.nodeColor === undefined ? undefined : 'true'}
      data-custom-node-stroke={props.nodeStrokeColor === undefined ? undefined : 'true'}
      data-pannable={props.pannable === undefined ? undefined : String(props.pannable)}
      data-zoomable={props.zoomable === undefined ? undefined : String(props.zoomable)}
      style={style}
    />
  ),
}));

describe('GraphHud', () => {
  it('draws an attached identity and Graph key above a sibling minimap', () => {
    const activeGraphId = uuid('00000000-0000-4000-8000-000000000010');
    const { container } = render(
      <GraphHud
        spaceTitle="Atlas"
        diagramTitle="Overview"
        graphs={[
          { id: activeGraphId, title: 'Primary', color: '#1f77b4', edges: [] },
          {
            id: uuid('00000000-0000-4000-8000-000000000011'),
            title: 'Alternate',
            color: '#f4a259',
            edges: [],
          },
        ]}
        colorByGraphId={{ [activeGraphId]: '#1f77b4' }}
        activeGraphId={activeGraphId}
      />,
    );

    expect(screen.getByTestId('panel')).toHaveAttribute('data-position', 'bottom-right');
    expect(screen.getByTestId('panel')).toHaveStyle({ marginBottom: 'calc(15px + 150px)' });
    const minimap = screen.getByTestId('minimap');
    expect(screen.getByTestId('panel')).not.toContainElement(minimap);
    expect(minimap.getAttribute('style')).toBe('width: 200px; height: 150px;');
    expect(minimap).not.toHaveAttribute('data-custom-background');
    expect(minimap).not.toHaveAttribute('data-custom-node-color');
    expect(minimap).not.toHaveAttribute('data-custom-node-stroke');
    expect(minimap).not.toHaveAttribute('data-pannable');
    expect(minimap).not.toHaveAttribute('data-zoomable');
    expect(screen.getByTestId('hud-space')).toHaveTextContent('Atlas');
    expect(screen.getByTestId('hud-diagram')).toHaveTextContent('Overview');
    expect(
      within(screen.getByTestId('canvas-identity')).queryByRole('button'),
    ).not.toBeInTheDocument();
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
        spaceTitle="Atlas"
        diagramTitle="Overview"
        graphs={[
          { id: activeGraphId, title: 'Primary', color: '#1f77b4', edges: [] },
          { id: otherGraphId, title: 'Alternate', color: '#f4a259', edges: [] },
        ]}
        colorByGraphId={{ [activeGraphId]: '#123456' }}
        activeGraphId={activeGraphId}
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
        spaceTitle="Atlas"
        diagramTitle="Overview"
        graphs={[{ id: uuid('00000000-0000-4000-8000-000000000010'), title: 'Only', edges: [] }]}
        colorByGraphId={{}}
        activeGraphId={null}
      />,
    );

    expect(within(screen.getByTestId('graph-legend')).getByRole('list')).toHaveAttribute(
      'role',
      'list',
    );
  });
});

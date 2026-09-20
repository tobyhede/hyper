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
        mapTitle="Overview"
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
    expect(screen.getByTestId('hud-space')).toHaveTextContent('Atlas');
    expect(screen.getByTestId('hud-map')).toHaveTextContent('Overview');
    expect(
      within(screen.getByTestId('canvas-identity')).queryByRole('button'),
    ).not.toBeInTheDocument();
    expect(container).toHaveTextContent('Primary');
    expect(container).toHaveTextContent('Alternate');
  });

  /**
   * The minimap pans and zooms the canvas, as it did before it was unnested.
   *
   * These are not decoration. `XYMinimap` calls d3-zoom on the MiniMap's own
   * SVG unconditionally — `selection.call(zoomAndPanHandler, {})` in
   * `@xyflow/system` — and d3-zoom's own wheel and mousedown handlers
   * `preventDefault` and `stopImmediatePropagation` whatever these props say.
   * So the 200×150 box swallows the gesture either way; the props decide only
   * whether it answers one. Dropped, the map is a dead patch over the canvas.
   */
  it('keeps the minimap panning and zooming the canvas', () => {
    render(
      <GraphHud
        spaceTitle="Atlas"
        mapTitle="Overview"
        graphs={[{ id: uuid('00000000-0000-4000-8000-000000000010'), title: 'Only', edges: [] }]}
        colorByGraphId={{}}
        activeGraphId={null}
      />,
    );

    const minimap = screen.getByTestId('minimap');
    expect(minimap).toHaveAttribute('data-pannable', 'true');
    expect(minimap).toHaveAttribute('data-zoomable', 'true');
  });

  /**
   * The key panel presses nothing, so it takes no pointer over the canvas.
   *
   * `.react-flow__panel` carries no `pointer-events` rule of its own (React
   * Flow's `style.css` sets only `position`, `z-index` and `margin`), so a
   * Panel swallows every gesture over its box. This one holds no control —
   * the identity is read-only and the key is a list — and it sits in the
   * corner a Resource's resize control lives in, which is the harm
   * `command-dock.css`'s bottom-edge offset already names. The two truncated
   * names are the exception and take the pointer back, because their `title`
   * is the only place a clipped name can be read.
   */
  it('lets the canvas take every pointer the key panel does not need', () => {
    render(
      <GraphHud
        spaceTitle="A Space with a very long name indeed"
        mapTitle="A Map with a very long name indeed"
        graphs={[{ id: uuid('00000000-0000-4000-8000-000000000010'), title: 'Only', edges: [] }]}
        colorByGraphId={{}}
        activeGraphId={null}
      />,
    );

    expect(screen.getByTestId('panel')).toHaveStyle({ pointerEvents: 'none' });
    for (const name of [screen.getByTestId('hud-space'), screen.getByTestId('hud-map')]) {
      expect(name).toHaveClass('pointer-events-auto');
    }
  });

  /**
   * A clipped name is still readable, and a screen reader is told which is which.
   *
   * `truncate` ellipsises inside a 200px panel and the Command Dock's header
   * clips the same two names, so without the `title` there is nowhere left on
   * the surface to read a long one. The visible glyphs are decoration, so the
   * words that say Space and Map have to be supplied for the reader that
   * cannot see them.
   */
  it('names each identity row and keeps a clipped title readable', () => {
    render(
      <GraphHud
        spaceTitle="Atlas"
        mapTitle="Overview"
        graphs={[{ id: uuid('00000000-0000-4000-8000-000000000010'), title: 'Only', edges: [] }]}
        colorByGraphId={{}}
        activeGraphId={null}
      />,
    );

    expect(screen.getByTestId('hud-space')).toHaveAttribute('title', 'Atlas');
    expect(screen.getByTestId('hud-map')).toHaveAttribute('title', 'Overview');
    const identity = screen.getByTestId('canvas-identity');
    expect(within(identity).getByText('Space')).toHaveClass('sr-only');
    expect(within(identity).getByText('Map')).toHaveClass('sr-only');
  });

  /**
   * Both identity glyphs are drawn at one size, in one box.
   *
   * `MapIcon` had no size and drew at 16 inside the same 14px box the
   * 13px Space cube sits in, so the two rows had different glyph heights and
   * different optical centres. Lucide sets no `preserveAspectRatio`, so SVG's
   * default letterboxed the glyph rather than distorting it — which is why this
   * reads the declared size rather than a rendered box jsdom does not lay out.
   */
  it('draws both identity glyphs at the same size', () => {
    const { container } = render(
      <GraphHud
        spaceTitle="Atlas"
        mapTitle="Overview"
        graphs={[{ id: uuid('00000000-0000-4000-8000-000000000010'), title: 'Only', edges: [] }]}
        colorByGraphId={{}}
        activeGraphId={null}
      />,
    );

    const space = container.querySelector('[data-icon="space"]');
    const map = container.querySelector('.lucide-layout-grid');
    expect(space).toHaveAttribute('width', '13');
    expect(space).toHaveAttribute('height', '13');
    expect(map).toHaveAttribute('width', '13');
    expect(map).toHaveAttribute('height', '13');
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
        mapTitle="Overview"
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
        mapTitle="Overview"
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

import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import { GraphHud } from '../src/GraphHud';
import { uuid } from './uuid';

/** The canvas size the mocked React Flow store reports; a desktop unless a test says otherwise. */
const canvas = vi.hoisted(() => ({
  size: { width: 1280, height: 800 },
  listeners: new Set<() => void>(),
}));

const resizeCanvas = (width: number, height: number) =>
  act(() => {
    canvas.size = { width, height };
    for (const listener of canvas.listeners) listener();
  });

beforeEach(() => {
  canvas.size = { width: 1280, height: 800 };
});

vi.mock('@xyflow/react', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useStore: <T,>(selector: (state: { width: number; height: number }) => T): T =>
      useSyncExternalStore(
        (listener) => {
          canvas.listeners.add(listener);
          return () => canvas.listeners.delete(listener);
        },
        () => selector(canvas.size),
      ),
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
  };
});

describe('GraphHud', () => {
  it('draws a Graph key attached above a sibling minimap', () => {
    const activeGraphId = uuid('00000000-0000-4000-8000-000000000010');
    const { container } = render(
      <GraphHud
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
    expect(container).toHaveTextContent('Primary');
    expect(container).toHaveTextContent('Alternate');
  });

  /**
   * The minimap pans and zooms the canvas.
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
   * The key panel takes no pointer over the canvas, bar its one control.
   *
   * `.react-flow__panel` carries no `pointer-events` rule of its own (React
   * Flow's `style.css` sets only `position`, `z-index` and `margin`), so a
   * Panel swallows every gesture over its box — and this one sits in the
   * corner a Resource's resize control lives in, which is the harm
   * `command-dock.css`'s bottom-edge offset already names. The key is a list,
   * so it hands them back; the disclosure that hides it takes them again.
   */
  it('lets the canvas take every pointer the key panel does not need', () => {
    render(
      <GraphHud
        graphs={[{ id: uuid('00000000-0000-4000-8000-000000000010'), title: 'Only', edges: [] }]}
        colorByGraphId={{}}
        activeGraphId={null}
      />,
    );

    expect(screen.getByTestId('panel')).toHaveStyle({ pointerEvents: 'none' });
    expect(screen.getByRole('button', { name: 'Graph overview' })).toHaveClass(
      'pointer-events-auto',
    );
  });

  /**
   * The HUD names neither the Space nor the Map: the Command Dock already does,
   * and a second copy in the corner said nothing the reader did not have.
   */
  it('names neither the Space nor the Map', () => {
    const { container } = render(
      <GraphHud
        graphs={[{ id: uuid('00000000-0000-4000-8000-000000000010'), title: 'Only', edges: [] }]}
        colorByGraphId={{}}
        activeGraphId={null}
      />,
    );

    expect(container.querySelector('[data-icon="space"]')).toBeNull();
    expect(container.querySelector('.lucide-layout-grid')).toBeNull();
  });

  /**
   * On a canvas with room for it, the overview starts shown, and its toggle
   * hides the key and the minimap together and shows them again.
   */
  it('starts shown on a roomy canvas, and its toggle hides and shows it', () => {
    render(
      <GraphHud
        graphs={[{ id: uuid('00000000-0000-4000-8000-000000000010'), title: 'Only', edges: [] }]}
        colorByGraphId={{}}
        activeGraphId={null}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Graph overview' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('graph-legend')).toBeInTheDocument();
    expect(screen.getByTestId('minimap')).toBeInTheDocument();

    // Open, the toggle is a bare chevron: nothing in the panel reads as its title.
    expect(toggle).toHaveTextContent('');
    expect(toggle.querySelector('.lucide-route')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('graph-legend')).not.toBeInTheDocument();
    // Closed, it shows what it holds as two glyphs and no words.
    expect(toggle).toHaveTextContent('');
    expect(toggle.querySelector('.lucide-route')).not.toBeNull();
    expect(toggle.querySelector('.lucide-layout-grid')).not.toBeNull();
    expect(screen.queryByTestId('minimap')).not.toBeInTheDocument();
    expect(screen.getByTestId('panel')).toHaveStyle({ marginBottom: '15px' });

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('minimap')).toBeInTheDocument();
  });

  /**
   * On a phone the overview would cover the canvas it describes, so there it
   * starts hidden behind its toggle — and the reader's own choice outlasts a
   * later change of size, such as turning the phone.
   */
  it('starts hidden on a small canvas, and keeps the reader’s choice across a resize', () => {
    canvas.size = { width: 390, height: 844 };
    render(
      <GraphHud
        graphs={[{ id: uuid('00000000-0000-4000-8000-000000000010'), title: 'Only', edges: [] }]}
        colorByGraphId={{}}
        activeGraphId={null}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Graph overview' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('minimap')).not.toBeInTheDocument();

    // Short as well as narrow: a phone on its side.
    resizeCanvas(844, 390);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    resizeCanvas(1280, 800);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    resizeCanvas(390, 844);
    resizeCanvas(1280, 800);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  /**
   * The key's own two claims: the stripe is the *resolved* colour, and the
   * Active Graph is the one that is not dimmed.
   *
   * The projection's answer outranks the Graph's own `color`, which is what
   * `graphColor` decides — so a stripe here disagreeing with that answer would
   * mean the seam had been bypassed.
   */
  it('resolves each stripe through the shared Graph colour seam and dims the rest', () => {
    const activeGraphId = uuid('00000000-0000-4000-8000-000000000010');
    const otherGraphId = uuid('00000000-0000-4000-8000-000000000011');
    render(
      <GraphHud
        graphs={[
          { id: activeGraphId, title: 'Primary', color: '#1f77b4', edges: [] },
          { id: otherGraphId, title: 'Alternate', color: '#f4a259', edges: [] },
        ]}
        colorByGraphId={{ [activeGraphId]: '#123456' }}
        activeGraphId={activeGraphId}
      />,
    );

    const key = screen.getByTestId('graph-legend');
    const active = within(key).getByText('Primary').closest('li');
    const inactive = within(key).getByText('Alternate').closest('li');
    expect(active).toHaveAttribute('data-active', 'true');
    expect(active).toHaveStyle({ opacity: '1' });
    // The projection's colour, not the Graph's own — `graphColor`'s precedence.
    expect(active?.querySelector('[data-slot="graph-legend-mark-line"]')).toHaveAttribute(
      'stroke',
      '#123456',
    );
    expect(inactive).toHaveAttribute('data-active', 'false');
    expect(inactive).toHaveStyle({ opacity: '0.5' });
    expect(inactive?.querySelector('[data-slot="graph-legend-mark-line"]')).toHaveAttribute(
      'stroke',
      '#f4a259',
    );
  });

  /**
   * Each key row ends in its own Graph's head shape, read off the Graph the
   * key is handed, and a Graph that stores none draws the default arrow — so
   * a Map whose Graphs share a colour for some reader still tells them apart.
   */
  it('ends each row’s mark in its Graph’s head shape, `arrow` where none is stored', () => {
    render(
      <GraphHud
        graphs={[
          { id: uuid('00000000-0000-4000-8000-000000000010'), title: 'Plain', edges: [] },
          {
            id: uuid('00000000-0000-4000-8000-000000000011'),
            title: 'Dotted',
            headShape: 'dot',
            edges: [],
          },
          {
            id: uuid('00000000-0000-4000-8000-000000000012'),
            title: 'Veed',
            headShape: 'vee',
            edges: [],
          },
        ]}
        colorByGraphId={{}}
        activeGraphId={null}
      />,
    );

    const key = screen.getByTestId('graph-legend');
    const headShapeOf = (title: string) =>
      within(key)
        .getByText(title)
        .closest('li')
        ?.querySelector('[data-slot="graph-legend-mark"] [data-slot="graph-head-shape"]')
        ?.getAttribute('data-head-shape');
    expect(headShapeOf('Plain')).toBe('arrow');
    expect(headShapeOf('Dotted')).toBe('dot');
    expect(headShapeOf('Veed')).toBe('vee');
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
      />,
    );

    expect(within(screen.getByTestId('graph-legend')).getByRole('list')).toHaveAttribute(
      'role',
      'list',
    );
  });
});

import { createRef, type ReactElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLOW_SPACE_VIEW_ID, GRID_SPACE_VIEW_ID, uuidSchema } from '@project/core';
import { PersistenceIndicator, SidebarProvider, SidebarTrigger } from '@project/ui';
import type { CanvasRenderer } from '../src/canvas-renderers';
import { SpaceSidebar, type SpaceSidebarProps } from '../src/components/SpaceSidebar';

const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000020');

beforeAll(() => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
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

/**
 * Which side of the Sidebar's breakpoint this test is on.
 *
 * `useIsMobile` reads `matchMedia` on every render, and `vitest.setup.ts` stubs
 * jsdom's missing one as a query that never matches. A mobile test replaces that
 * stub and puts the desktop one back afterwards rather than unstubbing, because
 * the globals `beforeAll` installed above have to survive it.
 */
const stubViewport = (mobile: boolean): void => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: mobile,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
};

/** The sidebar reads its open state from the primitive's provider, as production does. */
const draw = (element: ReactElement) => render(<SidebarProvider>{element}</SidebarProvider>);

/**
 * The rows, written out here rather than derived from a Space.
 *
 * `canvasRenderers` owns the derivation and `canvas-renderers.test.ts` owns testing
 * it. What is left for this file is what the sidebar *draws*, and a test of a
 * list should not need a Space to state it. They are named constants so a test
 * can say which row it expects pressed by naming the same value it listed —
 * which is convenience here, not the contract: the sidebar matches by
 * `canvasRendererKey`, and the test below hands it an equal row it never listed.
 */
const FLOW: CanvasRenderer = { kind: 'computed', selection: FLOW_SPACE_VIEW_ID, title: 'Flow' };
const GRID: CanvasRenderer = { kind: 'computed', selection: GRID_SPACE_VIEW_ID, title: 'Grid' };
const LAYOUT: CanvasRenderer = {
  kind: 'authored',
  selection: LAYOUT_ID,
  title: 'Layout 1',
};

const settledProps = (): SpaceSidebarProps => ({
  spaceTitle: 'Space',
  canvas: {
    renderers: { computed: [FLOW, GRID], authored: [] },
    current: FLOW,
    onSelect: vi.fn(),
  },
  graph: {
    graphs: [],
    colorByGraphId: {},
    activeGraphId: null,
    onActivate: vi.fn(),
    onPresent: vi.fn(),
    onExitPresenting: vi.fn(),
  },
  addCard: {
    onAddCard: vi.fn(),
    onAddAlias: vi.fn(),
    keyShortcut: 'C',
    menuTriggerRef: createRef<HTMLButtonElement>(),
  },
  persistence: {
    control: <PersistenceIndicator state="settled" />,
    state: 'settled',
    acknowledgedRevision: 4n,
  },
});

const withLayout = (props: SpaceSidebarProps): SpaceSidebarProps => ({
  ...props,
  canvas: { ...props.canvas, renderers: { ...props.canvas.renderers, authored: [LAYOUT] } },
});

describe('SpaceSidebar', () => {
  it('renders the persistent Sidebar commands and forwards Card creation', () => {
    const props = settledProps();
    draw(<SpaceSidebar {...props} />);

    expect(screen.getByTestId('space-title')).toHaveTextContent(/^Space$/);
    expect(screen.getByRole('button', { name: 'Flow' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Present' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Add Card' }));
    expect(props.addCard.onAddCard).toHaveBeenCalledOnce();
    expect(screen.getByTestId('persistence-status')).toHaveAttribute('data-revision', '4');
  });

  it('offers distinct canonical and contextual copy commands for a selected Card', () => {
    const props: SpaceSidebarProps = {
      ...settledProps(),
      cardLinks: {
        title: 'Start here',
        onCopyCanonical: vi.fn(),
        onCopyContextual: vi.fn(),
      },
    };
    draw(<SpaceSidebar {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy link to Start here' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy link in this Space View' }));

    expect(props.cardLinks?.onCopyCanonical).toHaveBeenCalledOnce();
    expect(props.cardLinks?.onCopyContextual).toHaveBeenCalledOnce();
  });

  it('reveals an addressed Card outside the selected Layout in the Cards collection', () => {
    const props: SpaceSidebarProps = {
      ...settledProps(),
      cardsCollection: {
        cards: [{ id: CARD_A, title: 'Outside the Layout' }],
        revealedCardId: CARD_A,
      },
    };
    draw(<SpaceSidebar {...props} />);

    expect(screen.getByText('Cards', { exact: true })).toBeVisible();
    expect(screen.getByText('Outside the Layout').closest('[data-card-id]')).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  /**
   * The whole of ADR 0053's first claim, asserted as one state: every computed
   * View and every authored Layout is a row of one list, exactly one is pressed,
   * and no row anywhere says `None`.
   */
  it('draws one exclusive canvas choice over Views and Layouts', () => {
    const base = withLayout(settledProps());
    const props: SpaceSidebarProps = {
      ...base,
      canvas: { ...base.canvas, current: LAYOUT },
    };
    draw(<SpaceSidebar {...props} />);

    const pressed = screen
      .getAllByTestId('canvas-renderer')
      .filter((renderer) => renderer.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveTextContent('Layout 1');
    expect(screen.getByRole('button', { name: 'Flow' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('None')).not.toBeInTheDocument();
  });

  /**
   * The pressed row is decided by the one identity rule, not by object identity.
   *
   * `canvasRenderers` mints a fresh authored row per call, so a caller listing
   * from one call and taking its current row from a second hands in two equal
   * values that are not the same object — see `canvas-renderers.test.ts`. A
   * `===` test drew that as a Layout list with nothing pressed: no throw, and
   * nothing in the type to catch it. `canvasRendererKey` is the rule the row
   * keys and `data-renderer` already carry, so the sidebar now asks the one
   * question it answers everywhere else.
   */
  it('presses an equal row that a second derivation built', () => {
    const base = withLayout(settledProps());
    const rebuilt: CanvasRenderer = {
      kind: 'authored',
      selection: LAYOUT_ID,
      title: 'Layout 1',
    };
    expect(rebuilt).not.toBe(LAYOUT);

    draw(<SpaceSidebar {...base} canvas={{ ...base.canvas, current: rebuilt }} />);

    const pressed = screen
      .getAllByTestId('canvas-renderer')
      .filter((renderer) => renderer.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveAttribute('data-renderer', LAYOUT_ID);
  });

  it('forwards the selection', () => {
    const props = withLayout(settledProps());
    draw(<SpaceSidebar {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Grid' }));
    expect(props.canvas.onSelect).toHaveBeenCalledWith(GRID_SPACE_VIEW_ID);

    fireEvent.click(screen.getByRole('button', { name: 'Layout 1' }));
    expect(props.canvas.onSelect).toHaveBeenCalledWith(LAYOUT_ID);
  });

  /** A Space authors its first Layout by editing a View (ADR 0025), so this is how it opens. */
  it('says a Space owns no Layout yet rather than offering an empty value', () => {
    draw(<SpaceSidebar {...settledProps()} />);

    expect(screen.getByTestId('no-authored-layouts')).toBeVisible();
    expect(screen.getByTestId('no-graphs')).toBeVisible();
  });

  it('activates a Graph and colours its glyph from the resolved colour', () => {
    const base = settledProps();
    const props: SpaceSidebarProps = {
      ...base,
      graph: {
        ...base.graph,
        graphs: [{ id: GRAPH_ID, title: 'Authored', color: '#123456', edges: [] }],
        activeGraphId: GRAPH_ID,
      },
    };
    draw(<SpaceSidebar {...props} />);

    const choice = screen.getByTestId('graph-choice');
    expect(choice).toHaveAttribute('aria-pressed', 'true');
    expect(choice.querySelector('svg')).toHaveAttribute('stroke', '#123456');

    fireEvent.click(choice);
    expect(props.graph.onActivate).toHaveBeenCalledWith(GRAPH_ID);
  });

  it('offers distinct canonical and Space View copy commands for the Active Graph', () => {
    const base = settledProps();
    const props: SpaceSidebarProps = {
      ...base,
      graph: {
        ...base.graph,
        graphs: [{ id: GRAPH_ID, title: 'Authored', color: '#123456', edges: [] }],
        activeGraphId: GRAPH_ID,
        links: {
          onCopyCanonical: vi.fn(),
          onCopyContextual: vi.fn(),
        },
      },
    };
    draw(<SpaceSidebar {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy link to Authored' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Copy link to Authored in this Space View' }),
    );

    expect(props.graph.links?.onCopyCanonical).toHaveBeenCalledWith(GRAPH_ID);
    expect(props.graph.links?.onCopyContextual).toHaveBeenCalledWith(GRAPH_ID);
  });

  /**
   * A Layout is created with its initial Active Graph empty (ADR 0040), so this
   * is the state every conversion out of a View leaves behind until the author
   * draws an Edge. `graphStartCard` has no answer for it, so `present()` would
   * return having changed nothing — the control must say so rather than accept a
   * click and do nothing.
   */
  it('cannot present an active Graph that holds no Edges', () => {
    const base = settledProps();
    const props: SpaceSidebarProps = {
      ...base,
      graph: {
        ...base.graph,
        graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraphId: GRAPH_ID,
      },
    };
    draw(<SpaceSidebar {...props} />);

    const present = screen.getByRole('button', { name: 'Present Graph 1' });
    expect(present).toBeDisabled();
    fireEvent.click(present);
    expect(props.graph.onPresent).not.toHaveBeenCalled();
  });

  /**
   * Presenting draws the active Card's content in place of the Card, so a live
   * content editor cannot survive it and its draft would go without one of
   * ADR 0064's four exits being spent. The control says so rather than taking
   * the click.
   */
  it('cannot present over a live content edit', () => {
    const base = settledProps();
    const props: SpaceSidebarProps = {
      ...base,
      graph: {
        ...base.graph,
        graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [{ from: CARD_A, to: CARD_B }] }],
        activeGraphId: GRAPH_ID,
        canPresent: false,
      },
    };
    draw(<SpaceSidebar {...props} />);

    const present = screen.getByRole('button', { name: 'Present Graph 1' });
    expect(present).toBeDisabled();
    fireEvent.click(present);
    expect(props.graph.onPresent).not.toHaveBeenCalled();
  });

  it('exits presenting through the Overview action', () => {
    const base = settledProps();
    const props: SpaceSidebarProps = {
      ...base,
      graph: {
        ...base.graph,
        graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [{ from: CARD_A, to: CARD_B }] }],
        activeGraphId: GRAPH_ID,
        presenting: true,
      },
    };
    draw(<SpaceSidebar {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));

    expect(props.graph.onExitPresenting).toHaveBeenCalledOnce();
    expect(props.graph.onPresent).not.toHaveBeenCalled();
  });

  it('names and colours Present with the active Graph', () => {
    const base = settledProps();
    const props: SpaceSidebarProps = {
      ...base,
      graph: {
        ...base.graph,
        graphs: [
          {
            id: GRAPH_ID,
            title: 'Authored',
            color: '#123456',
            edges: [{ from: CARD_A, to: CARD_B }],
          },
        ],
        activeGraphId: GRAPH_ID,
      },
    };
    draw(<SpaceSidebar {...props} />);

    const present = screen.getByRole('button', { name: 'Present Authored' });
    expect(present).toBeEnabled();
    expect(present.querySelector('svg')).toHaveAttribute('stroke', '#123456');
  });

  /**
   * Below the primitive's breakpoint the sidebar is a modal Sheet over the
   * canvas, and every command in it acts on the canvas.
   *
   * Add Card and Add Alias are the sharp end: each opens an editor on the
   * canvas, which a Dialog's focus trap will not let receive focus while the
   * sheet is still up. The rest would simply leave the author reading the
   * sidebar instead of the result. `mobile-sidebar.spec.ts` proves the focus
   * half in a real browser; this proves the rule for every command.
   */
  describe('as a mobile Sheet', () => {
    beforeEach(() => stubViewport(true));
    afterEach(() => stubViewport(false));

    const openSheet = (props: SpaceSidebarProps) => {
      render(
        <SidebarProvider>
          <SpaceSidebar {...props} />
          <SidebarTrigger />
        </SidebarProvider>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
      expect(screen.getByTestId('space-title')).toBeVisible();
    };

    const dismissed = () =>
      waitFor(() => expect(screen.queryByTestId('space-title')).not.toBeInTheDocument());

    it('dismisses itself when Card creation opens an editor on the canvas', async () => {
      const props = settledProps();
      openSheet(props);

      fireEvent.click(screen.getByRole('button', { name: 'Add Card' }));

      expect(props.addCard.onAddCard).toHaveBeenCalledOnce();
      await dismissed();
    });

    it('dismisses itself when a canvas choice changes what is drawing', async () => {
      const props = withLayout(settledProps());
      openSheet(props);

      fireEvent.click(screen.getByRole('button', { name: 'Layout 1' }));

      expect(props.canvas.onSelect).toHaveBeenCalledOnce();
      await dismissed();
    });

    it('dismisses itself when a Graph is activated', async () => {
      const base = settledProps();
      const props: SpaceSidebarProps = {
        ...base,
        graph: {
          ...base.graph,
          graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [{ from: CARD_A, to: CARD_B }] }],
          activeGraphId: null,
        },
      };
      openSheet(props);

      fireEvent.click(screen.getByRole('button', { name: 'Graph 1' }));

      expect(props.graph.onActivate).toHaveBeenCalledWith(GRAPH_ID);
      await dismissed();
    });

    it('dismisses itself when presenting begins', async () => {
      const base = settledProps();
      const props: SpaceSidebarProps = {
        ...base,
        graph: {
          ...base.graph,
          graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [{ from: CARD_A, to: CARD_B }] }],
          activeGraphId: GRAPH_ID,
        },
      };
      openSheet(props);

      fireEvent.click(screen.getByRole('button', { name: 'Present Graph 1' }));

      expect(props.graph.onPresent).toHaveBeenCalledOnce();
      await dismissed();
    });
  });

  /** Status is not a command, so it sits outside every list rather than inside one. */
  it('keeps persistence feedback out of the choice lists', () => {
    const props = withLayout(settledProps());
    const { rerender } = draw(<SpaceSidebar {...props} />);

    expect(screen.queryByRole('button', { name: 'Changes saved' })).not.toBeInTheDocument();

    rerender(
      <SidebarProvider>
        <SpaceSidebar
          {...props}
          persistence={{
            control: <PersistenceIndicator state="pending" />,
            state: 'pending',
            acknowledgedRevision: 4n,
          }}
        />
      </SidebarProvider>,
    );
    const saving = screen.getByRole('button', { name: 'Saving changes' });
    for (const renderer of screen.getAllByTestId('canvas-renderer')) {
      expect(renderer).not.toContainElement(saving);
    }
  });
});

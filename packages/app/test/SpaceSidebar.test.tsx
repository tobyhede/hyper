import { createRef, useState, type ReactElement } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { uuidSchema, type Layout } from '@project/core';
import { PersistenceIndicator, SidebarProvider, SidebarTrigger } from '@project/ui';
import {
  SelectedLayoutName,
  SpaceSidebar,
  type SpaceChromeTitleEdit,
  type SpaceSidebarProps,
} from '../src/components/SpaceSidebar';

const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000020');
const OTHER_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');

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
 * The Layouts, written out here rather than loaded from a Space.
 *
 * What is left for this file is what the sidebar *draws*, and a test of a list
 * should not need a Space to state it. They are named constants so a test can
 * say which row it expects pressed by naming the same value it listed — which
 * is convenience here, not the contract: the sidebar matches by **Layout id**,
 * and the test below hands it an equal Layout it never listed.
 */
const layout = (id: typeof LAYOUT_ID, title: string): Layout => ({
  id,
  title,
  kind: 'positioned',
  positions: {},
  graphs: [],
});
const LAYOUT_ONE = layout(LAYOUT_ID, 'Layout 1');
const LAYOUT_TWO = layout(OTHER_LAYOUT_ID, 'Layout 2');
const LAYOUT = layout(LAYOUT_ID, 'Layout 1');

const settledProps = (): SpaceSidebarProps => ({
  spaceTitle: 'Space',
  canvas: {
    layouts: [LAYOUT_ONE, LAYOUT_TWO],
    selected: LAYOUT_ONE,
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
  createLayout: { refusal: null, onCreate: vi.fn() },
  persistence: {
    control: <PersistenceIndicator state="settled" />,
    state: 'settled',
    acknowledgedRevision: 4n,
  },
});

const withLayout = (props: SpaceSidebarProps): SpaceSidebarProps => ({
  ...props,
  canvas: { ...props.canvas, layouts: [LAYOUT] },
});

describe('SpaceSidebar', () => {
  it('coordinates one Layout draft between its active row and Layout label', () => {
    function Fixture() {
      const [edit, setEdit] = useState<{ draft: string; error: string | null } | null>(null);
      const titleEdit: SpaceChromeTitleEdit = {
        subject: edit === null ? null : { kind: 'layout', id: LAYOUT_ID },
        surface: edit === null ? null : 'sidebar',
        draft: edit?.draft ?? '',
        error: edit?.error ?? null,
        onBegin: (_subject, title) => setEdit({ draft: title, error: null }),
        onDraftChange: (draft) =>
          setEdit((current) => (current === null ? null : { ...current, draft })),
        onErrorChange: (error) =>
          setEdit((current) => (current === null ? null : { ...current, error })),
        onComplete: (_subject, title) =>
          title.trim() === '' ? 'A Layout title is required.' : null,
        onCancel: () => setEdit(null),
        onReturnFocus: () => undefined,
      };
      const base = withLayout(settledProps());
      const props = { ...base, canvas: { ...base.canvas, current: LAYOUT } };
      return (
        <>
          <SpaceSidebar {...props} titleEdit={titleEdit} />
          <SelectedLayoutName layout={LAYOUT} titleEdit={titleEdit} />
        </>
      );
    }

    draw(<Fixture />);
    fireEvent.click(screen.getByRole('button', { name: 'Layout 1', pressed: true }));
    const row = screen.getByRole('textbox', { name: 'Layout name' });
    fireEvent.change(row, { target: { value: 'Workshop' } });
    expect(screen.getByTestId('selected-canvas')).toHaveTextContent('Workshop');
    // One draft, so the header mirrors it rather than offering a second way in:
    // beginning again from the header would reset the draft to the committed
    // title and discard what has been typed.
    expect(screen.queryByRole('button', { name: /^Edit Layout/ })).not.toBeInTheDocument();
    fireEvent.change(row, { target: { value: '' } });
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent('A Layout title is required.');
  });

  /**
   * A covered Sidebar is located by `data-layout`, because an open pane marks
   * the root `inert` and the row leaves the accessibility tree
   * (`docs/agents/ui.md`). A row that sheds that hook while its own rename is
   * live is unreachable by role and by attribute at the same time.
   */
  it('keeps a Layout row addressable while its rename is live', () => {
    function Fixture() {
      const [draft, setDraft] = useState<string | null>(null);
      const titleEdit: SpaceChromeTitleEdit = {
        subject: draft === null ? null : { kind: 'layout', id: LAYOUT_ID },
        surface: draft === null ? null : 'sidebar',
        draft: draft ?? '',
        error: null,
        onBegin: (_subject, title) => setDraft(title),
        onDraftChange: setDraft,
        onErrorChange: () => undefined,
        onComplete: () => null,
        onCancel: () => setDraft(null),
        onReturnFocus: () => undefined,
      };
      const base = withLayout(settledProps());
      const props = { ...base, canvas: { ...base.canvas, current: LAYOUT } };
      return <SpaceSidebar {...props} titleEdit={titleEdit} />;
    }

    draw(<Fixture />);
    const before = screen.getAllByTestId('layout-row').length;
    fireEvent.click(screen.getByRole('button', { name: 'Layout 1', pressed: true }));

    expect(screen.getByRole('textbox', { name: 'Layout name' })).toBeVisible();
    expect(screen.getAllByTestId('layout-row')).toHaveLength(before);
    expect(document.querySelector(`[data-layout="${LAYOUT_ID}"]`)).toBeInTheDocument();
  });

  it('names the Layout as plain text when no title edit is offered', () => {
    draw(<SelectedLayoutName layout={LAYOUT} />);

    expect(screen.getByTestId('selected-canvas')).toHaveTextContent('Layout 1');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders the persistent Sidebar commands and forwards Card creation', () => {
    const props = settledProps();
    draw(<SpaceSidebar {...props} />);

    expect(screen.getByTestId('space-title')).toHaveTextContent(/^Space$/);
    expect(screen.getByRole('button', { name: 'Layout 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Present' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Add Card' }));
    expect(props.addCard.onAddCard).toHaveBeenCalledOnce();
    expect(screen.getByTestId('persistence-status')).toHaveAttribute('data-revision', '4');
  });

  it('offers Add Layout beside Card creation for every selected canvas', () => {
    const onCreate = vi.fn();
    const computed = settledProps();
    const { unmount } = draw(
      <SpaceSidebar {...computed} createLayout={{ refusal: null, onCreate }} />,
    );

    expect(screen.getByRole('button', { name: 'Add Card' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Add Layout' }));
    expect(onCreate).toHaveBeenCalledOnce();
    unmount();

    const authored = withLayout(settledProps());
    draw(<SpaceSidebar {...authored} canvas={{ ...authored.canvas, selected: LAYOUT }} />);
    expect(screen.getByRole('button', { name: 'Add Layout' })).toBeVisible();
  });

  it("opens a row's entity-actions menu from its trailing icon, not only from a right click", async () => {
    const onSelect = vi.fn();
    const props: SpaceSidebarProps = {
      ...withLayout(settledProps()),
      entityActions: () => [[], [{ id: 'copy', label: 'Copy link', onSelect }], []],
    };
    draw(<SpaceSidebar {...props} />);

    // The icon is a real tab stop and the only path that does not need a
    // pointer, so it is the one that has to work: ADR 0052's parity aside, the
    // right click is explicitly an accelerator over it (`.scratch/link-ux`).
    const trigger = screen.getByRole('button', { name: 'Actions for Layout Layout 1' });
    fireEvent.click(trigger);

    const item = await screen.findByRole('menuitem', { name: 'Copy link' });
    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('does not expose entity actions when every supplied group is empty', () => {
    const props: SpaceSidebarProps = {
      ...withLayout(settledProps()),
      entityActions: () => [[], []],
    };
    draw(<SpaceSidebar {...props} />);

    expect(
      screen.queryByRole('button', { name: 'Actions for Layout Layout 1' }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="entity-actions"]')).not.toBeInTheDocument();
  });

  it('does not expose a context menu while a row title is being edited', () => {
    const titleEdit: SpaceChromeTitleEdit = {
      subject: { kind: 'layout', id: LAYOUT_ID },
      surface: 'sidebar',
      draft: 'Layout 1',
      error: null,
      onBegin: vi.fn(),
      onDraftChange: vi.fn(),
      onErrorChange: vi.fn(),
      onComplete: vi.fn(() => null),
      onCancel: vi.fn(),
      onReturnFocus: vi.fn(),
    };
    const base = withLayout(settledProps());
    const props: SpaceSidebarProps = {
      ...base,
      canvas: { ...base.canvas, selected: LAYOUT },
      titleEdit,
      entityActions: () => [[{ id: 'rename', label: 'Rename', onSelect: vi.fn() }]],
    };
    draw(<SpaceSidebar {...props} />);

    const editor = screen.getByRole('textbox', { name: 'Layout name' });
    expect(editor).toBeVisible();
    expect(editor.closest('[data-slot="entity-actions"]')).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Copy link in this Layout' }));

    expect(props.cardLinks?.onCopyCanonical).toHaveBeenCalledOnce();
    expect(props.cardLinks?.onCopyContextual).toHaveBeenCalledOnce();
  });

  /**
   * A refused whole-Space Delete stays on the confirmation that asked for it.
   *
   * The dialog is the only surface with the question on it, so a refusal that
   * dismisses it has nowhere left to be read. Base UI closes on the action's
   * click unless the handler says otherwise, and `preventDefault` is not how it
   * is said — `mergeProps` reads `baseUIHandlerPrevented`, never
   * `defaultPrevented`.
   */
  it('keeps a refused Delete on the confirmation that asked for it', async () => {
    const props: SpaceSidebarProps = {
      ...settledProps(),
      cardLinks: {
        title: 'Start here',
        onCopyCanonical: vi.fn(),
        onCopyContextual: vi.fn(),
        onDelete: () => 'Retarget or delete the Aliases of this Card first: Alias 1.',
      },
    };
    draw(<SpaceSidebar {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Card Start here' }));
    const confirmation = await screen.findByRole('alertdialog', {
      name: 'Delete Card Start here?',
    });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Delete Card' }));

    expect(await within(confirmation).findByRole('alert')).toHaveTextContent(
      'Retarget or delete the Aliases of this Card first: Alias 1.',
    );
    expect(confirmation).toBeVisible();
  });

  /**
   * Every authored Layout is a row of one list, exactly one is pressed, and no
   * row says `None`.
   */
  it('draws one exclusive canvas choice over Layouts', () => {
    const base = settledProps();
    const props: SpaceSidebarProps = {
      ...base,
      canvas: { ...base.canvas, selected: LAYOUT },
    };
    draw(<SpaceSidebar {...props} />);

    const pressed = screen
      .getAllByTestId('layout-row')
      .filter((row) => row.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveTextContent('Layout 1');
    expect(screen.getByRole('button', { name: 'Layout 2' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.queryByText('None')).not.toBeInTheDocument();
  });

  /**
   * The pressed row is decided by Layout id, not by object identity.
   *
   * A caller that lists one Space's Layouts and takes its selected Layout from
   * a second value of equal shape hands in two Layouts that are equal and not
   * the same object. A `===` test drew that as a Layout list with nothing
   * pressed: no throw, and nothing in the type to catch it. The id is what the
   * row keys and `data-layout` already carry, so the sidebar asks the one
   * question it answers everywhere else.
   */
  it('presses an equal Layout that a second value described', () => {
    const base = withLayout(settledProps());
    const rebuilt = layout(LAYOUT_ID, 'Layout 1');
    expect(rebuilt).not.toBe(LAYOUT);

    draw(<SpaceSidebar {...base} canvas={{ ...base.canvas, selected: rebuilt }} />);

    const pressed = screen
      .getAllByTestId('layout-row')
      .filter((row) => row.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveAttribute('data-layout', LAYOUT_ID);
  });

  it('forwards the selection', () => {
    const props = settledProps();
    draw(<SpaceSidebar {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Layout 2' }));
    expect(props.canvas.onSelect).toHaveBeenCalledWith(OTHER_LAYOUT_ID);

    fireEvent.click(screen.getByRole('button', { name: 'Layout 1' }));
    expect(props.canvas.onSelect).toHaveBeenCalledWith(LAYOUT_ID);
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

  it('offers distinct canonical and Layout copy commands for the Active Graph', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Copy link to Authored in this Layout' }));

    expect(props.graph.links?.onCopyCanonical).toHaveBeenCalledWith(GRAPH_ID);
    expect(props.graph.links?.onCopyContextual).toHaveBeenCalledWith(GRAPH_ID);
  });

  /** An empty Active Graph cannot begin presenting. */
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

    const present = screen.getByRole('button', { name: 'Present' });
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

    const present = screen.getByRole('button', { name: 'Present' });
    expect(present).toBeDisabled();
    fireEvent.click(present);
    expect(props.graph.onPresent).not.toHaveBeenCalled();
  });

  it('exits through the presentation action', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));

    expect(props.graph.onExitPresenting).toHaveBeenCalledOnce();
    expect(props.graph.onPresent).not.toHaveBeenCalled();
  });

  it('colours Present with the active Graph', () => {
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

    const present = screen.getByRole('button', { name: 'Present' });
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

    it('dismisses itself when a Card is deleted from the Space', async () => {
      const onDelete = vi.fn(() => null);
      const props: SpaceSidebarProps = {
        ...settledProps(),
        cardLinks: {
          title: 'Start here',
          onCopyCanonical: vi.fn(),
          onCopyContextual: vi.fn(),
          onDelete,
        },
      };
      openSheet(props);

      fireEvent.click(screen.getByRole('button', { name: 'Delete Card Start here' }));
      const confirmation = await screen.findByRole('alertdialog', {
        name: 'Delete Card Start here?',
      });
      fireEvent.click(within(confirmation).getByRole('button', { name: 'Delete Card' }));

      expect(onDelete).toHaveBeenCalledOnce();
      await dismissed();
    });

    /** The other half of the rule above: a refusal has nowhere to be read but
        the dialog, and dismissing the sheet under it takes that away. */
    it('stays open when a Delete is refused', async () => {
      const props: SpaceSidebarProps = {
        ...settledProps(),
        cardLinks: {
          title: 'Start here',
          onCopyCanonical: vi.fn(),
          onCopyContextual: vi.fn(),
          onDelete: () => 'This Card is no longer part of the Space.',
        },
      };
      openSheet(props);

      fireEvent.click(screen.getByRole('button', { name: 'Delete Card Start here' }));
      const confirmation = await screen.findByRole('alertdialog', {
        name: 'Delete Card Start here?',
      });
      fireEvent.click(within(confirmation).getByRole('button', { name: 'Delete Card' }));

      expect(await within(confirmation).findByRole('alert')).toHaveTextContent(
        'This Card is no longer part of the Space.',
      );
      expect(screen.getByTestId('space-title')).toBeVisible();
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

    it.each([
      {
        name: 'the canonical Card link is copied',
        button: 'Copy link to Start here',
        callback: 'canonical' as const,
      },
      {
        name: 'the contextual Card link is copied',
        button: 'Copy link in this Layout',
        callback: 'contextual' as const,
      },
    ])('dismisses itself when $name', async ({ button, callback }) => {
      const onCopyCanonical = vi.fn();
      const onCopyContextual = vi.fn();
      const props: SpaceSidebarProps = {
        ...settledProps(),
        cardLinks: {
          title: 'Start here',
          onCopyCanonical,
          onCopyContextual,
        },
      };
      openSheet(props);

      fireEvent.click(screen.getByRole('button', { name: button }));

      const expected = callback === 'canonical' ? onCopyCanonical : onCopyContextual;
      const other = callback === 'canonical' ? onCopyContextual : onCopyCanonical;
      expect(expected).toHaveBeenCalledOnce();
      expect(other).not.toHaveBeenCalled();
      await dismissed();
    });

    it.each([
      {
        name: 'the canonical Graph link is copied',
        button: 'Copy link to Graph 1',
        callback: 'canonical' as const,
      },
      {
        name: 'the contextual Graph link is copied',
        button: 'Copy link to Graph 1 in this Layout',
        callback: 'contextual' as const,
      },
    ])('dismisses itself when $name', async ({ button, callback }) => {
      const onCopyCanonical = vi.fn();
      const onCopyContextual = vi.fn();
      const base = settledProps();
      const props: SpaceSidebarProps = {
        ...base,
        graph: {
          ...base.graph,
          graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
          activeGraphId: GRAPH_ID,
          links: { onCopyCanonical, onCopyContextual },
        },
      };
      openSheet(props);

      fireEvent.click(screen.getByRole('button', { name: button }));

      const expected = callback === 'canonical' ? onCopyCanonical : onCopyContextual;
      const other = callback === 'canonical' ? onCopyContextual : onCopyCanonical;
      expect(expected).toHaveBeenCalledOnce();
      expect(expected).toHaveBeenCalledWith(GRAPH_ID);
      expect(other).not.toHaveBeenCalled();
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

      fireEvent.click(screen.getByRole('button', { name: 'Present' }));

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
    for (const row of screen.getAllByTestId('layout-row')) {
      expect(row).not.toContainElement(saving);
    }
  });
});

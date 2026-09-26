import '@testing-library/jest-dom/vitest';
import { type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  SpaceResourceSelectors,
  ResourceRailActions,
  type SpaceResourceSelectorsProps,
} from '../src';

/**
 * Base UI's menu positions itself by measuring, and jsdom ships no pointer
 * capture. Both are reached before a Space Resource's selector can open at all.
 * The clusters are toolbar groups; production mounts them inside ResourceRailActions.
 */
beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
});

/**
 * A menu item's own label, past a Map/Graph list item's checked-radio
 * indicator.
 *
 * `DropdownMenuRadioItem`'s checked indicator is an un-hidden `span` wrapping
 * Base UI's own `aria-hidden` checkmark `span`, mounted only on the chosen
 * item — so a selector that allowed any nested `span` would read the
 * checkmark's empty label on that one item and nothing on the rest. Excluding
 * `aria-hidden` at both levels makes the whole indicator invisible to this
 * selector, checked or not, and falls back to the item's own `textContent`
 * where neither level matches (`MapMenuActions` and `GraphMenuActions`
 * draw their icon as a bare child with no wrapping `span` at all).
 */
const menuItemLabels = (menu: HTMLElement): readonly string[] =>
  Array.from(menu.querySelectorAll('[role="menuitemradio"], [role="menuitem"]')).map((item) =>
    (
      item.querySelector(':scope > span:not([aria-hidden]) > span:not([aria-hidden])')
        ?.textContent ?? item.textContent
    ).trim(),
  );

const mount = (props: SpaceResourceSelectorsProps, extra?: ReactNode) =>
  render(
    <>
      <ResourceRailActions aria-label="Resource rail">
        <SpaceResourceSelectors {...props} />
      </ResourceRailActions>
      {extra}
    </>,
  );

const clusters = (
  over: Partial<SpaceResourceSelectorsProps> = {},
): SpaceResourceSelectorsProps => ({
  maps: [
    { id: 'l1', title: 'Collection 1' },
    { id: 'l2', title: 'Collection 2' },
  ],
  graphs: [{ id: 'g1', title: 'Long', color: '#1f77b4' }],
  mapId: 'l1',
  graphId: 'g1',
  onMapChange: vi.fn(),
  onGraphChange: vi.fn(),
  onReport: vi.fn(),
  ...over,
});

describe('SpaceResourceSelectors', () => {
  it('keeps focus on the destination when a context rename completes on blur', async () => {
    const onRename = vi.fn(() => null);
    mount(
      clusters({
        mapCommands: {
          onRename,
          onCreate: () => Promise.resolve(false),
          onDelete: () => Promise.resolve(),
          onCopyLink: () => Promise.resolve(null),
        },
      }),
      <button>Destination</button>,
    );
    fireEvent.click(screen.getByTestId('space-resource-map'));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
      await Promise.resolve();
    });
    const editor = screen.getByRole('textbox', { name: 'Map name' });
    expect(editor).toHaveFocus();
    fireEvent.change(editor, { target: { value: 'New title' } });
    const destination = screen.getByRole('button', { name: 'Destination' });
    act(() => destination.focus());
    expect(onRename).toHaveBeenCalledWith('New title');
    expect(screen.queryByRole('textbox', { name: 'Map name' })).not.toBeInTheDocument();
    expect(destination).toHaveFocus();
  });

  it('offers both selectors seeded with the Resource’s own selections', () => {
    mount(clusters());

    expect(screen.getByRole('button', { name: 'Map: Collection 1' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Graph: Long' })).toBeEnabled();
    expect(screen.getByTestId('space-resource-map')).toHaveTextContent('Collection 1');
    expect(screen.getByTestId('space-resource-graph')).toHaveTextContent('Long');
  });

  it('publishes a chosen Map without selecting it itself', () => {
    const onMapChange = vi.fn();
    mount(clusters({ onMapChange }));

    fireEvent.click(screen.getByTestId('space-resource-map'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Collection 2' }));

    expect(onMapChange).toHaveBeenCalledWith('l2');
    expect(screen.getByTestId('space-resource-map')).toHaveTextContent('Collection 1');
  });

  it('releases busy when creating a Map rejects', async () => {
    let rejectCreate: () => void = () => undefined;
    mount(
      clusters({
        mapCommands: {
          onRename: () => null,
          onCreate: () =>
            new Promise<boolean>((_, reject) => {
              rejectCreate = () => {
                reject(new Error('persist failed'));
              };
            }),
          onDelete: () => Promise.resolve(),
          onCopyLink: () => Promise.resolve(null),
        },
      }),
    );
    fireEvent.click(screen.getByTestId('space-resource-map'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Map' }));
    expect(screen.getByRole('button', { name: 'Map: Collection 1' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await act(async () => {
      rejectCreate();
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Map: Collection 1' })).toBeEnabled();
  });

  it('releases busy when deleting a Map rejects', async () => {
    let rejectDelete: () => void = () => undefined;
    mount(
      clusters({
        mapCommands: {
          onRename: () => null,
          onCreate: () => Promise.resolve(false),
          onDelete: () =>
            new Promise<void>((_, reject) => {
              rejectDelete = () => {
                reject(new Error('persist failed'));
              };
            }),
          onCopyLink: () => Promise.resolve(null),
        },
      }),
    );
    fireEvent.click(screen.getByTestId('space-resource-map'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Collection 1' }));
    expect(screen.getByRole('button', { name: 'Map: Collection 1' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await act(async () => {
      rejectDelete();
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Map: Collection 1' })).toBeEnabled();
  });

  /**
   * A Map command is one field, its press or `null`, so the row is drawn
   * unavailable from the same answer that would invoke it.
   */
  it('draws each Map command the application withholds as unavailable', () => {
    mount(
      clusters({
        mapCommands: {
          onRename: null,
          onCreate: null,
          onDelete: null,
          onCopyLink: () => Promise.resolve(null),
        },
      }),
    );
    fireEvent.click(screen.getByTestId('space-resource-map'));

    for (const name of ['New Map', 'Rename', 'Delete Collection 1']) {
      expect(screen.getByRole('menuitem', { name })).toHaveAttribute('aria-disabled', 'true');
    }
    expect(screen.getByRole('menuitem', { name: 'Copy link to Map' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  /**
   * A Map or Graph creation's refusal is the containing canvas's notice, so
   * the rail reports no sentence of its own for either; a Map creation
   * answers only whether the caret went on.
   */
  it('reports no sentence of its own for a Map or a Graph creation', async () => {
    const onReport = vi.fn();
    mount(
      clusters({
        onReport,
        mapCommands: {
          onRename: () => null,
          onCreate: () => Promise.resolve(false),
          onDelete: () => Promise.resolve(),
          onCopyLink: () => Promise.resolve(null),
        },
        graphCommands: {
          onRename: () => null,
          onCreate: () => Promise.resolve(),
          onDelete: () => Promise.resolve(null),
          onCopyLink: () => Promise.resolve(null),
          deleteDisabled: false,
          color: '#1f77b4',
          colors: [{ color: '#1f77b4', label: 'Blue' }],
          onRecolor: () => null,
        },
      }),
    );
    fireEvent.click(screen.getByTestId('space-resource-map'));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'New Map' }));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('space-resource-graph')).toBeEnabled());
    expect(onReport).toHaveBeenLastCalledWith(null);

    fireEvent.click(screen.getByTestId('space-resource-graph'));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'New Graph' }));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('space-resource-graph')).toBeEnabled());
    expect(onReport).toHaveBeenLastCalledWith(null);
    expect(onReport).not.toHaveBeenCalledWith(expect.any(String));
  });

  it('draws a selection the target no longer holds as unavailable', () => {
    mount(clusters({ mapId: null, graphs: [], graphId: null }));

    const map = screen.getByTestId('space-resource-map');
    expect(map).toBeEnabled();
    expect(map).toHaveTextContent('No Map');
    const graph = screen.getByTestId('space-resource-graph');
    expect(graph).toHaveAttribute('aria-disabled', 'true');
    expect(graph).toHaveTextContent('No Graph');
  });

  /**
   * This Resource's Map and Graph menus match the Dock's own grouping
   * grammar: the direct
   * children of the popup alternate group/separator, one separator between
   * each group, and the items inside read in the documented order.
   */
  const topLevelRoles = (menu: HTMLElement): readonly (string | null)[] =>
    Array.from(menu.children).map((child) => child.getAttribute('role'));

  it('groups the Map menu into New Map, Rename with Copy link, then Delete', () => {
    mount(
      clusters({
        mapCommands: {
          onRename: () => null,
          onCreate: () => Promise.resolve(false),
          onDelete: () => Promise.resolve(),
          onCopyLink: () => Promise.resolve(null),
        },
      }),
    );
    fireEvent.click(screen.getByTestId('space-resource-map'));
    const menu = screen.getByRole('menu');

    expect(topLevelRoles(menu)).toEqual([
      'group',
      'separator',
      'group',
      'separator',
      'group',
      'separator',
      'group',
    ]);
    expect(menuItemLabels(menu)).toEqual([
      'Collection 1',
      'Collection 2',
      'New Map',
      'Rename',
      'Copy link to Map',
      'Delete Collection 1',
    ]);
    expect(screen.queryByText(/Copy permanent link/)).not.toBeInTheDocument();
  });

  it('groups the Graph menu into New Graph, Colour… with Rename and Copy link, then Delete', () => {
    mount(
      clusters({
        graphCommands: {
          onRename: () => null,
          onCreate: () => Promise.resolve(),
          onDelete: () => Promise.resolve(null),
          onCopyLink: () => Promise.resolve(null),
          deleteDisabled: false,
          color: '#1f77b4',
          colors: [{ color: '#1f77b4', label: 'Blue' }],
          onRecolor: () => null,
        },
      }),
    );
    fireEvent.click(screen.getByTestId('space-resource-graph'));
    const menu = screen.getByRole('menu');

    expect(topLevelRoles(menu)).toEqual([
      'group',
      'separator',
      'group',
      'separator',
      'group',
      'separator',
      'group',
    ]);
    expect(menuItemLabels(menu)).toEqual([
      'Long',
      'New Graph',
      'Colour…',
      'Rename',
      'Copy link to Graph',
      'Delete Long',
    ]);
    expect(screen.queryByText(/Copy permanent link/)).not.toBeInTheDocument();
  });

  /**
   * A Graph row says which colour its Edges are drawn in with the same line
   * the canvas HUD's key draws, and no Graph glyph: the list is already a list
   * of Graphs, so a glyph on every row said nothing the caption does not.
   */
  it('marks each Graph row with a line in that Graph’s colour and no glyph', () => {
    mount(
      clusters({
        graphs: [
          { id: 'g1', title: 'Long', color: '#1f77b4' },
          { id: 'g2', title: 'Short', color: '#ff7f0e' },
        ],
      }),
    );
    fireEvent.click(screen.getByTestId('space-resource-graph'));
    const rows = screen.getAllByRole('menuitemradio');

    expect(rows).toHaveLength(2);
    const lines = rows.map((row) => row.querySelector('[data-slot="graph-color-line"]'));
    expect(lines[0]).toHaveStyle({ backgroundColor: '#1f77b4' });
    expect(lines[1]).toHaveStyle({ backgroundColor: '#ff7f0e' });
    // The unchosen row draws nothing else; the chosen one draws only the
    // radio indicator the menu marks the chosen member with.
    expect(rows[1]?.querySelector('svg')).toBeNull();
  });

  it('leaves the Map rows unmarked', () => {
    mount(clusters());
    fireEvent.click(screen.getByTestId('space-resource-map'));

    for (const row of screen.getAllByRole('menuitemradio'))
      expect(row.querySelector('[data-slot="graph-color-line"]')).toBeNull();
  });
});

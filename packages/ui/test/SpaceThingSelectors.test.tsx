import '@testing-library/jest-dom/vitest';
import { type ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SpaceThingSelectors, ThingRailActions, type SpaceThingSelectorsProps } from '../src';

/**
 * Base UI's menu positions itself by measuring, and jsdom ships no pointer
 * capture. Both are reached before a Space Thing's selector can open at all.
 * The clusters are toolbar groups; production mounts them inside ThingRailActions.
 */
beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
});

/**
 * A menu item's own label, past a Diagram/Graph list item's checked-radio
 * indicator.
 *
 * `DropdownMenuRadioItem`'s checked indicator is an un-hidden `span` wrapping
 * Base UI's own `aria-hidden` checkmark `span`, mounted only on the chosen
 * item — so a selector that allowed any nested `span` would read the
 * checkmark's empty label on that one item and nothing on the rest. Excluding
 * `aria-hidden` at both levels makes the whole indicator invisible to this
 * selector, checked or not, and falls back to the item's own `textContent`
 * where neither level matches (`DiagramMenuActions` and `GraphMenuActions`
 * draw their icon as a bare child with no wrapping `span` at all).
 */
const menuItemLabels = (menu: HTMLElement): readonly string[] =>
  Array.from(menu.querySelectorAll('[role="menuitemradio"], [role="menuitem"]')).map((item) =>
    (
      item.querySelector(':scope > span:not([aria-hidden]) > span:not([aria-hidden])')
        ?.textContent ?? item.textContent
    ).trim(),
  );

const mount = (props: SpaceThingSelectorsProps, extra?: ReactNode) =>
  render(
    <>
      <ThingRailActions aria-label="Thing rail">
        <SpaceThingSelectors {...props} />
      </ThingRailActions>
      {extra}
    </>,
  );

const clusters = (over: Partial<SpaceThingSelectorsProps> = {}): SpaceThingSelectorsProps => ({
  diagrams: [
    { id: 'l1', title: 'Collection 1' },
    { id: 'l2', title: 'Collection 2' },
  ],
  graphs: [{ id: 'g1', title: 'Long' }],
  diagramId: 'l1',
  graphId: 'g1',
  onDiagramChange: vi.fn(),
  onGraphChange: vi.fn(),
  onReport: vi.fn(),
  ...over,
});

describe('SpaceThingSelectors', () => {
  it('keeps focus on the destination when a context rename completes on blur', async () => {
    const onRename = vi.fn(() => null);
    mount(
      clusters({
        diagramCommands: {
          onRename,
          onCreate: () => Promise.resolve(null),
          onDelete: () => Promise.resolve(null),
          onCopyLink: () => Promise.resolve(null),
          deleteDisabled: false,
        },
      }),
      <button>Destination</button>,
    );
    fireEvent.click(screen.getByTestId('space-thing-diagram'));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
      await Promise.resolve();
    });
    const editor = screen.getByRole('textbox', { name: 'Diagram name' });
    expect(editor).toHaveFocus();
    fireEvent.change(editor, { target: { value: 'New title' } });
    const destination = screen.getByRole('button', { name: 'Destination' });
    act(() => destination.focus());
    expect(onRename).toHaveBeenCalledWith('New title');
    expect(screen.queryByRole('textbox', { name: 'Diagram name' })).not.toBeInTheDocument();
    expect(destination).toHaveFocus();
  });

  it('offers both selectors seeded with the Thing’s own selections', () => {
    mount(clusters());

    expect(screen.getByRole('button', { name: 'Diagram: Collection 1' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Graph: Long' })).toBeEnabled();
    expect(screen.getByTestId('space-thing-diagram')).toHaveTextContent('Collection 1');
    expect(screen.getByTestId('space-thing-graph')).toHaveTextContent('Long');
  });

  it('publishes a chosen Diagram without selecting it itself', () => {
    const onDiagramChange = vi.fn();
    mount(clusters({ onDiagramChange }));

    fireEvent.click(screen.getByTestId('space-thing-diagram'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Collection 2' }));

    expect(onDiagramChange).toHaveBeenCalledWith('l2');
    expect(screen.getByTestId('space-thing-diagram')).toHaveTextContent('Collection 1');
  });

  it('releases busy when creating a Diagram rejects', async () => {
    let rejectCreate: () => void = () => undefined;
    mount(
      clusters({
        diagramCommands: {
          onRename: () => null,
          onCreate: () =>
            new Promise<string | null>((_, reject) => {
              rejectCreate = () => {
                reject(new Error('persist failed'));
              };
            }),
          onDelete: () => Promise.resolve(null),
          onCopyLink: () => Promise.resolve(null),
          deleteDisabled: false,
        },
      }),
    );
    fireEvent.click(screen.getByTestId('space-thing-diagram'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Diagram' }));
    expect(screen.getByRole('button', { name: 'Diagram: Collection 1' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await act(async () => {
      rejectCreate();
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Diagram: Collection 1' })).toBeEnabled();
  });

  it('releases busy when deleting a Diagram rejects', async () => {
    let rejectDelete: () => void = () => undefined;
    mount(
      clusters({
        diagramCommands: {
          onRename: () => null,
          onCreate: () => Promise.resolve(null),
          onDelete: () =>
            new Promise<string | null>((_, reject) => {
              rejectDelete = () => {
                reject(new Error('persist failed'));
              };
            }),
          onCopyLink: () => Promise.resolve(null),
          deleteDisabled: false,
        },
      }),
    );
    fireEvent.click(screen.getByTestId('space-thing-diagram'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Collection 1' }));
    expect(screen.getByRole('button', { name: 'Diagram: Collection 1' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await act(async () => {
      rejectDelete();
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Diagram: Collection 1' })).toBeEnabled();
  });

  it('draws a selection the target no longer holds as unavailable', () => {
    mount(clusters({ diagramId: null, graphs: [], graphId: null }));

    const diagram = screen.getByTestId('space-thing-diagram');
    expect(diagram).toBeEnabled();
    expect(diagram).toHaveTextContent('No Diagram');
    const graph = screen.getByTestId('space-thing-graph');
    expect(graph).toHaveAttribute('aria-disabled', 'true');
    expect(graph).toHaveTextContent('No Graph');
  });

  /**
   * This Thing's Diagram and Graph menus match the Dock's own grouping
   * grammar (`.scratch/dock-menu-reorganisation/issues/01`): the direct
   * children of the popup alternate group/separator, one separator between
   * each group, and the items inside read in the documented order.
   */
  const topLevelRoles = (menu: HTMLElement): readonly (string | null)[] =>
    Array.from(menu.children).map((child) => child.getAttribute('role'));

  it('groups the Diagram menu into New Diagram, Rename with Copy link, then Delete', () => {
    mount(
      clusters({
        diagramCommands: {
          onRename: () => null,
          onCreate: () => Promise.resolve(null),
          onDelete: () => Promise.resolve(null),
          onCopyLink: () => Promise.resolve(null),
          deleteDisabled: false,
        },
      }),
    );
    fireEvent.click(screen.getByTestId('space-thing-diagram'));
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
      'New Diagram',
      'Rename',
      'Copy link to Diagram',
      'Delete Collection 1',
    ]);
    expect(screen.queryByText(/Copy permanent link/)).not.toBeInTheDocument();
  });

  it('groups the Graph menu into Colour…, New Graph, Rename with Copy link, then Delete', () => {
    mount(
      clusters({
        graphCommands: {
          onRename: () => null,
          onCreate: () => Promise.resolve(null),
          onDelete: () => Promise.resolve(null),
          onCopyLink: () => Promise.resolve(null),
          deleteDisabled: false,
          color: '#1f77b4',
          colors: [{ color: '#1f77b4', label: 'Blue' }],
          onRecolor: () => null,
        },
      }),
    );
    fireEvent.click(screen.getByTestId('space-thing-graph'));
    const menu = screen.getByRole('menu');

    expect(topLevelRoles(menu)).toEqual([
      'group',
      'separator',
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
      'Colour…',
      'New Graph',
      'Rename',
      'Copy link to Graph',
      'Delete Long',
    ]);
    expect(screen.queryByText(/Copy permanent link/)).not.toBeInTheDocument();
  });
});

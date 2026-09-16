import '@testing-library/jest-dom/vitest';
import { type ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ThingRailActions } from '@project/ui';
import { SpaceThingRailClusters } from '../src/SpaceThingRailClusters';
import type { SpaceThingRailClustersProps } from '../src/space-thing-rail';

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

const mount = (props: SpaceThingRailClustersProps, extra?: ReactNode) =>
  render(
    <>
      <ThingRailActions aria-label="Thing rail">
        <SpaceThingRailClusters {...props} />
      </ThingRailActions>
      {extra}
    </>,
  );

const clusters = (
  over: Partial<SpaceThingRailClustersProps> = {},
): SpaceThingRailClustersProps => ({
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

describe('SpaceThingRailClusters', () => {
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

  it('draws a selection the target no longer holds as unavailable', () => {
    mount(clusters({ diagramId: null, graphs: [], graphId: null }));

    const diagram = screen.getByTestId('space-thing-diagram');
    expect(diagram).toBeEnabled();
    expect(diagram).toHaveTextContent('No Diagram');
    const graph = screen.getByTestId('space-thing-graph');
    expect(graph).toHaveAttribute('aria-disabled', 'true');
    expect(graph).toHaveTextContent('No Graph');
  });
});

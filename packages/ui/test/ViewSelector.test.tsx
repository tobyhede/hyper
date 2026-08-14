import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ViewSelector } from '../src/index';

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

describe('ViewSelector', () => {
  it('names the current Algorithmic View and offers only the shipped Views', async () => {
    const onValueChange = vi.fn();
    render(<ViewSelector value="flow" active onValueChange={onValueChange} />);

    const trigger = screen.getByRole('combobox', { name: 'Choose view' });
    expect(trigger).toHaveAttribute('title', 'Choose view');
    expect(trigger).toHaveTextContent('Flow');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    expect(await screen.findByText('Views · computed')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Flow' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Grid' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'By name' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Tree' })).not.toBeInTheDocument();
    // The list is portalled outside the toolbar, so its own marker must keep
    // React Flow's document-level delete shortcut from treating it as canvas UI.
    expect(screen.getByRole('listbox').parentElement).toHaveClass('nokey');

    const grid = screen.getByRole('option', { name: 'Grid' });
    fireEvent.pointerDown(grid, { pointerType: 'mouse' });
    fireEvent.click(grid);
    expect(onValueChange).toHaveBeenCalledWith('grid');
  });

  it('keeps the remembered View label without marking it active while a Layout draws', () => {
    render(<ViewSelector value="flow" active={false} onValueChange={() => undefined} />);
    const trigger = screen.getByRole('combobox', { name: 'Choose view' });
    expect(trigger).toHaveTextContent('Flow');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    expect(screen.getByRole('option', { name: 'Flow' }).querySelectorAll('svg')).toHaveLength(1);
  });
});

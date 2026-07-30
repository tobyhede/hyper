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
    render(<ViewSelector value="graph" active onValueChange={onValueChange} />);

    const trigger = screen.getByRole('combobox', { name: 'Choose view' });
    expect(trigger).toHaveAttribute('title', 'Choose view');
    expect(trigger).toHaveTextContent('Graph');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    expect(await screen.findByText('Views · computed')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Graph' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Grid' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'By name' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Tree' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: 'Grid' }));
    expect(onValueChange).toHaveBeenCalledWith('grid');
  });

  it('keeps the remembered View label without marking it active while a Layout draws', () => {
    render(<ViewSelector value="graph" active={false} onValueChange={() => undefined} />);
    const trigger = screen.getByRole('combobox', { name: 'Choose view' });
    expect(trigger).toHaveTextContent('Graph');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    expect(screen.getByRole('option', { name: 'Graph' }).querySelectorAll('svg')).toHaveLength(1);
  });
});

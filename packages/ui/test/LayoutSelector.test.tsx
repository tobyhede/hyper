import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema, type Layout } from '@project/core';
import { LayoutSelector } from '../src/index';

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

/**
 * Two Layouts, each owning the initial empty Graph a Layout is created with
 * (ADR 0040). The selector reads only `id` and `title`; the Graphs are here
 * because a Layout that owns none is not a Layout, not because this component
 * has anything to say about them.
 */
const layouts: readonly Layout[] = [
  {
    id: uuidSchema.parse('11111111-1111-4111-8111-111111111111'),
    title: 'Workshop',
    kind: 'positioned',
    positions: {},
    graphs: [
      {
        id: uuidSchema.parse('11111111-1111-4111-8111-1111111111a1'),
        title: 'Graph 1',
        edges: [],
      },
    ],
  },
  {
    id: uuidSchema.parse('22222222-2222-4222-8222-222222222222'),
    title: 'Overview',
    kind: 'positioned',
    positions: {},
    graphs: [
      {
        id: uuidSchema.parse('22222222-2222-4222-8222-2222222222a2'),
        title: 'Graph 1',
        edges: [],
      },
    ],
  },
];

describe('LayoutSelector', () => {
  it('stays controlled when the first conversion gives a Space its Layout', () => {
    // Before an author's first edit a Space has no Layout, so Base UI's
    // controlled value is null; conversion moves it to an id (ADR 0025).
    const warnings: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((first: unknown) => {
      warnings.push(String(first));
    });

    const { rerender } = render(
      <LayoutSelector layouts={[]} value={null} active={false} onValueChange={vi.fn()} />,
    );
    rerender(
      <LayoutSelector layouts={layouts} value={layouts[0]!.id} active onValueChange={vi.fn()} />,
    );

    expect(warnings).toEqual([]);
    expect(screen.getByRole('combobox', { name: 'Choose layout' })).toHaveTextContent('Workshop');
  });

  it('lists authored Layouts in their authored order', () => {
    const onValueChange = vi.fn();
    render(
      <LayoutSelector
        layouts={layouts}
        value={null}
        active={false}
        onValueChange={onValueChange}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Choose layout' });
    expect(trigger).toHaveAttribute('title', 'Choose layout · None');
    expect(trigger).toHaveTextContent('None');
    expect(screen.queryByTestId('layout-live-indicator')).not.toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const listbox = screen.getByRole('listbox');
    expect(
      within(listbox)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Workshop', 'Overview']);

    const overview = within(listbox).getByRole('option', { name: 'Overview' });
    fireEvent.pointerDown(overview, { pointerType: 'mouse' });
    fireEvent.click(overview);
    expect(onValueChange).toHaveBeenCalledWith(layouts[1]?.id);
  });

  it('shows the accent dot only while a Layout is the live renderer', () => {
    const { rerender } = render(
      <LayoutSelector
        layouts={layouts}
        value={layouts[0]?.id ?? null}
        active={true}
        onValueChange={() => undefined}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Choose layout' })).toHaveTextContent('Workshop');
    expect(screen.getByTestId('layout-live-indicator')).toBeInTheDocument();

    rerender(
      <LayoutSelector
        layouts={layouts}
        value={layouts[0]?.id ?? null}
        active={false}
        onValueChange={() => undefined}
      />,
    );
    expect(screen.queryByTestId('layout-live-indicator')).not.toBeInTheDocument();
  });
});

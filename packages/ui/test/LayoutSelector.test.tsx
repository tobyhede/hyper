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

const CARD_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');

/**
 * A layout owns at least one graph (ADR 0040), so the smallest one the selector
 * can be handed carries a graph over one member. The selector reads neither —
 * it lists titles — but the type is the aggregate's and is not relaxed for it.
 */
const layouts: readonly Layout[] = [
  {
    id: uuidSchema.parse('11111111-1111-4111-8111-111111111111'),
    title: 'Workshop',
    kind: 'positioned',
    positions: { [CARD_ID]: { x: 0, y: 0 } },
    graphs: [
      {
        id: uuidSchema.parse('44444444-4444-4444-8444-444444444444'),
        title: 'Workshop graph',
        edges: [{ from: CARD_ID, to: CARD_ID }],
      },
    ],
  },
  {
    id: uuidSchema.parse('22222222-2222-4222-8222-222222222222'),
    title: 'Overview',
    kind: 'positioned',
    positions: { [CARD_ID]: { x: 0, y: 0 } },
    graphs: [
      {
        id: uuidSchema.parse('55555555-5555-4555-8555-555555555555'),
        title: 'Overview graph',
        edges: [{ from: CARD_ID, to: CARD_ID }],
      },
    ],
  },
];

describe('LayoutSelector', () => {
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
    expect(trigger).toHaveAttribute('title', 'Choose layout');
    expect(trigger).toHaveTextContent('None');
    expect(screen.queryByTestId('layout-live-indicator')).not.toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const listbox = screen.getByRole('listbox');
    expect(
      within(listbox)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Workshop', 'Overview']);

    fireEvent.click(within(listbox).getByRole('option', { name: 'Overview' }));
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

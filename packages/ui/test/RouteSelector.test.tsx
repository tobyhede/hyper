import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type Route } from '@project/core';
import { RouteSelector } from '../src/index';

const routes: readonly Route[] = [
  {
    id: uuidSchema.parse('11111111-1111-4111-8111-111111111111'),
    title: 'Long route',
    color: '#6ea8fe',
    edges: [],
  },
  {
    id: uuidSchema.parse('22222222-2222-4222-8222-222222222222'),
    title: 'Short route',
    color: '#f4a259',
    edges: [],
  },
];

describe('RouteSelector', () => {
  it('joins the active Route selector to the route-coloured Present action', () => {
    const onPresent = vi.fn();
    render(
      <RouteSelector
        routes={routes}
        activeRouteId={routes[1]?.id ?? null}
        onActivate={() => undefined}
        onPresent={onPresent}
      />,
    );

    const group = screen.getByRole('group', { name: 'Route controls' });
    const trigger = screen.getByRole('combobox', { name: 'Active route' });
    const present = screen.getByRole('button', { name: 'Present this route' });

    expect(group).toContainElement(trigger);
    expect(group).toContainElement(present);
    expect(trigger).toHaveAttribute('title', 'Active route');
    expect(trigger).toHaveTextContent('Short route');
    expect(trigger.querySelector('svg')).toHaveAttribute('stroke', '#f4a259');
    expect(present).toHaveAttribute('title', 'Present this route');
    expect(present.querySelector('svg')).toHaveAttribute('fill', '#f4a259');

    fireEvent.click(present);
    expect(onPresent).toHaveBeenCalledOnce();
  });

  it('disables Present when there is no active Route', () => {
    render(
      <RouteSelector
        routes={routes}
        activeRouteId={null}
        onActivate={() => undefined}
        onPresent={() => undefined}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Active route' })).toHaveTextContent('None');
    expect(screen.getByRole('button', { name: 'Present this route' })).toBeDisabled();
  });
});

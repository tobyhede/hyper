import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { uuidSchema, type Route } from '@project/core';
import { RouteSelector, type RouteSelectorProps } from '../src/index';

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

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
  it('requires an exit action for every presenting state', () => {
    expectTypeOf<RouteSelectorProps['onExitPresenting']>().toEqualTypeOf<() => void>();
  });

  it('joins the active Route selector to the route-coloured Present action', () => {
    const onPresent = vi.fn();
    render(
      <RouteSelector
        routes={routes}
        activeRouteId={routes[1]?.id ?? null}
        onActivate={() => undefined}
        onPresent={onPresent}
        onExitPresenting={() => undefined}
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
        onExitPresenting={() => undefined}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Active route' })).toHaveTextContent('None');
    expect(screen.getByRole('button', { name: 'Present this route' })).toBeDisabled();
  });

  it('activates the chosen Route', () => {
    const onActivate = vi.fn();
    render(
      <RouteSelector
        routes={routes}
        activeRouteId={routes[1]?.id ?? null}
        onActivate={onActivate}
        onPresent={() => undefined}
        onExitPresenting={() => undefined}
      />,
    );

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Active route' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: /Long route/ }));

    expect(onActivate).toHaveBeenCalledOnce();
    expect(onActivate).toHaveBeenCalledWith(routes[0]?.id);
  });

  it('exits presenting through the Overview action', () => {
    const onExitPresenting = vi.fn();
    const onPresent = vi.fn();
    render(
      <RouteSelector
        routes={routes}
        activeRouteId={routes[1]?.id ?? null}
        onActivate={() => undefined}
        onPresent={onPresent}
        presenting
        onExitPresenting={onExitPresenting}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Return to overview' }));

    expect(onExitPresenting).toHaveBeenCalledOnce();
    expect(onPresent).not.toHaveBeenCalled();
  });
});

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type Route } from '@project/core';
import { RouteLegend } from '../src/index';

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
    edges: [],
  },
];

describe('RouteLegend', () => {
  it('renders the Route HUD key with stripes and dims non-active Routes', () => {
    render(
      <RouteLegend
        routes={routes}
        colorByRouteId={{ [routes[0]!.id]: '#123456' }}
        activeRouteId={routes[0]!.id}
      />,
    );

    const key = screen.getByTestId('route-legend');
    expect(within(key).getByText('Routes')).toBeInTheDocument();

    const active = within(key).getByText('Long route').closest('li');
    const inactive = within(key).getByText('Short route').closest('li');
    expect(active).toHaveStyle({ opacity: '1' });
    expect(active?.querySelector('[aria-hidden="true"]')).toHaveStyle({ background: '#123456' });
    expect(inactive).toHaveStyle({ opacity: '0.5' });
    expect(inactive?.querySelector('[aria-hidden="true"]')).toHaveStyle({ background: '#8a94a6' });
  });
});

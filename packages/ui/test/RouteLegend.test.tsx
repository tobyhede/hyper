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

  // `list-none` sets `list-style: none`, which makes Safari/VoiceOver drop list
  // semantics and stop announcing the route count. The explicit role restores it.
  //
  // Asserted as an attribute rather than through `getByRole('list')` on purpose:
  // jsdom maps `<ul>` to the list role from the tag alone and never applies the
  // Safari quirk, so a role query passes with or without the fix and would prove
  // nothing. The attribute is the whole deliverable here.
  it('keeps list semantics despite the unstyled list', () => {
    render(<RouteLegend routes={routes} colorByRouteId={{}} />);

    expect(within(screen.getByTestId('route-legend')).getByRole('list')).toHaveAttribute(
      'role',
      'list',
    );
  });
});

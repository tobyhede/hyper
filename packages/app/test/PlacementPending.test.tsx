import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlacementPending } from '../src/components/PlacementPending';

/**
 * The canvas while its strategy is still arranging Cards. `canvasContent`
 * deciding to show it is pinned a seam lower in `placement-rendering.test.tsx`;
 * this test covers only the status the pending branch renders.
 */
describe('pending placement', () => {
  it('announces that the strategy is arranging Cards', () => {
    render(<PlacementPending />);

    expect(screen.getByRole('status')).toHaveTextContent('Arranging…');
  });
});

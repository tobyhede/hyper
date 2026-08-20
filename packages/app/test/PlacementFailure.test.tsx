import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlacementFailure } from '../src/components/PlacementFailure';

/**
 * The one canvas state a Space cannot be authored out of: no strategy produced
 * positions, so there is no graph to fall back to and the message is all the
 * author has to go on. `canvasContent` deciding to show it is pinned a seam
 * lower in `placement-rendering.test.tsx`; this is the panel it decides to draw.
 */
describe('a placement failure', () => {
  it('announces itself, carrying what the strategy said', () => {
    render(<PlacementFailure error={new Error('No position for Card A')} />);

    expect(screen.getByRole('alert')).toHaveTextContent('No position for Card A');
  });

  /**
   * The detail is bounded at 40vh and scrolls, so a failure naming every
   * unresolved id at once does not push the panel off the canvas. That makes it
   * a scroll region a keyboard-only reader has to be able to enter and, having
   * entered, to know what they are in — hence the tab stop and the name
   * together. Neither is visible, so both regress in silence.
   */
  it('gives the bounded detail a tab stop and a name to reach it by', () => {
    render(<PlacementFailure error={new Error('No position for Card A')} />);

    const detail = screen.getByRole('region', { name: 'Placement failure detail' });
    detail.focus();

    expect(detail).toHaveFocus();
    expect(detail).toHaveTextContent('No position for Card A');
  });

  /**
   * A strategy's message says which Card it could not place; it does not say
   * that the canvas is empty for that reason. The heading is the only thing
   * that does, so the panel is not the raw message under an alert role — and
   * it stays a real heading, reachable by heading navigation, not just visible
   * text.
   */
  it('frames the failure rather than handing over the strategy message alone', () => {
    render(<PlacementFailure error={new Error('No position for Card A')} />);

    const heading = screen.getByRole('heading', { name: 'Unable to arrange this view' });

    expect(heading).toBeVisible();
    expect(heading).not.toHaveTextContent('No position for Card A');
  });
});

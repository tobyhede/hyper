import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PresentingChromeFixture } from '../stories/support/PresentingChromeFixture';
import { deepDiveSpace } from '../stories/support/spaces';

/**
 * The presenting story fixture composes **production** Navigation, so the state
 * a Ladle spec clicks its way into is Navigation's own: the moves, the selected
 * branch and the Traversal history (ADR 0052).
 *
 * What this pins is that the fixture keeps none of it. A harness that seeded a
 * selected index or a history of its own would draw the same catalogue and prove
 * nothing about the chrome the application ships — and the failure would only
 * show up as a Ladle spec passing for the wrong reason.
 */
describe('the presenting story fixture', () => {
  it('opens presenting the Graph the Space declares', () => {
    render(<PresentingChromeFixture />);

    expect(screen.getByTestId('presenting-chrome')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Go to How it works' })).toBeVisible();
  });

  /**
   * A sink is where a traversal arrives rather than a Graph a story can author, so
   * the opening `advances` are production moves and the history behind them is
   * Navigation's — which is what Back then has something to undo.
   */
  it('traverses to a sink through Navigation and keeps the history that got there', () => {
    render(<PresentingChromeFixture advances={2} />);

    expect(screen.getByTestId('presenting-end')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('button', { name: 'Go to Wrap up' })).toBeVisible();
  });

  it('holds no selection of its own: choosing a branch republishes Navigation', () => {
    render(<PresentingChromeFixture space={deepDiveSpace} />);
    expect(screen.getByRole('button', { name: 'Go to Read path' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Choose Failure modes' }));

    expect(screen.getByRole('button', { name: 'Go to Failure modes' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Choose Read path' })).toBeVisible();
  });

  /** The production global keys, bound by the fixture so a story can prove them. */
  it('binds the production Traversal keys while a traversal is on', () => {
    render(<PresentingChromeFixture />);

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Go to Wrap up' })).toBeVisible();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByTestId('presenting-chrome')).toBeNull();
  });
});

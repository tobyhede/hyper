import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PresentingChrome } from '../src/components/PresentingChrome';

describe('PresentingChrome', () => {
  it('names a sink as the end of the active Graph', () => {
    render(
      <PresentingChrome
        moves={[]}
        canRetreat={false}
        onSelect={() => undefined}
        onAdvance={() => undefined}
        onExit={() => undefined}
      />,
    );

    expect(screen.getByTestId('presenting-end')).toHaveTextContent(/^End of Graph$/);
  });
});

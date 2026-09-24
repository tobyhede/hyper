import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GraphColorLine } from '../src/index';

describe('GraphColorLine', () => {
  /**
   * A colour key, never a name: whatever it sits beside carries the Graph's
   * title, so the line is hidden from assistive technology rather than read
   * as an unlabelled image.
   */
  it('draws the colour it is given as a decorative line', () => {
    const { container } = render(<GraphColorLine color="#35d6c3" />);
    const line = container.querySelector('[data-slot="graph-color-line"]');

    expect(line).not.toBeNull();
    expect(line).toHaveAttribute('aria-hidden', 'true');
    expect(line).toHaveStyle({ backgroundColor: '#35d6c3' });
  });

  it('draws one line per Graph, each in its own colour', () => {
    const { container } = render(
      <>
        <GraphColorLine color="#1f77b4" />
        <GraphColorLine color="#ff7f0e" />
      </>,
    );
    const lines = container.querySelectorAll('[data-slot="graph-color-line"]');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveStyle({ backgroundColor: '#1f77b4' });
    expect(lines[1]).toHaveStyle({ backgroundColor: '#ff7f0e' });
  });
});

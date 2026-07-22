import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardRenderer } from '../src/index';

describe('CardRenderer', () => {
  it('renders the title and the Markdown source verbatim', () => {
    const markdown = 'A paragraph with **bold** text.\n\n- item one\n- item two';
    const { container } = render(<CardRenderer title="Hello" markdown={markdown} />);

    expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
    // The source is shown as-is: the `**bold**` markers survive and no <strong>
    // is produced — opening a card is view-source, not a rendered read (ADR 0011).
    expect(container.querySelector('.card__source')?.textContent).toBe(markdown);
    expect(container.querySelector('strong')).toBeNull();
  });

  it('does not parse Markdown tables — the pipes are shown literally', () => {
    const markdown = '| A | B |\n| - | - |\n| 1 | 2 |';
    const { container } = render(<CardRenderer title="T" markdown={markdown} />);

    expect(container.querySelector('table')).toBeNull();
    expect(container.querySelector('.card__source')?.textContent).toBe(markdown);
  });
});

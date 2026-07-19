import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardRenderer } from '../src/index';

describe('CardRenderer', () => {
  it('renders the title and markdown body', () => {
    render(
      <CardRenderer
        title="Hello"
        markdown={'A paragraph with **bold** text.\n\n- item one\n- item two'}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
    expect(screen.getByText('bold')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders markdown tables via remark-gfm', () => {
    render(<CardRenderer title="T" markdown={'| A | B |\n| - | - |\n| 1 | 2 |'} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CanvasCard } from '../src';

describe('CanvasCard', () => {
  it('presents every visual state through one reusable Card interface', () => {
    const { rerender } = render(
      <CanvasCard kind="markdown" state="rest" title="Strategies" graphColor="#ffc53d" />,
    );

    const card = screen.getByRole('article', { name: 'Strategies' });
    expect(card).toHaveAttribute('data-kind', 'markdown');
    expect(card).toHaveAttribute('data-state', 'rest');

    rerender(
      <CanvasCard kind="markdown" state="selected-hover" title="Strategies" graphColor="#ffc53d" />,
    );
    expect(card).toHaveAttribute('data-state', 'selected-hover');
  });

  it('makes Alias a kind treatment while preserving the shared state behavior', () => {
    render(
      <CanvasCard
        kind="alias"
        state="editing"
        title="Opening"
        graphColor="#35d6c3"
        titleEditor={<input aria-label="Card title" defaultValue="Opening" />}
        handles={<span data-testid="real-handles" />}
      />,
    );

    const card = screen.getByRole('article', { name: 'Opening' });
    expect(card).toHaveAttribute('data-kind', 'alias');
    expect(card).toHaveAttribute('data-state', 'editing');
    expect(screen.getByRole('textbox', { name: 'Card title' })).toBeVisible();
    expect(screen.getByTestId('real-handles')).toBeVisible();
    expect(screen.queryByText(/alias of/i)).not.toBeInTheDocument();
  });

  it("shows the target Card's title beneath an Alias's own title", () => {
    render(
      <CanvasCard
        kind="alias"
        state="rest"
        title="Opening, again"
        aliasOf="Opening"
        graphColor="#35d6c3"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Opening, again' })).toBeVisible();
    expect(screen.getByTestId('alias-marker')).toHaveTextContent('Opening');
  });
});

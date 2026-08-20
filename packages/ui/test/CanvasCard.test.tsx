import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CanvasCard } from '../src';

describe('CanvasCard', () => {
  it('presents Card kind and interaction state through one shared interface', () => {
    const { rerender } = render(
      <CanvasCard kind="markdown" state="rest" title="Strategies" graphColor="#ffc53d" />,
    );

    const card = screen.getByRole('article', { name: 'Strategies' });
    expect(card).toHaveAttribute('data-kind', 'markdown');
    expect(card).toHaveAttribute('data-state', 'rest');

    rerender(
      <CanvasCard kind="alias" state="selected-hover" title="Opening" graphColor="#35d6c3" />,
    );
    expect(card).toHaveAttribute('data-kind', 'alias');
    expect(card).toHaveAttribute('data-state', 'selected-hover');
    expect(screen.getByRole('img', { name: 'Alias' })).toBeVisible();
  });

  it('accepts the adapter-owned title editor and actions without recreating them', () => {
    render(
      <CanvasCard
        kind="markdown"
        state="editing"
        title="Strategies"
        graphColor="#ffc53d"
        titleEditor={<input aria-label="Card title" defaultValue="Strategies" />}
        actions={<button type="button">Connect</button>}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Card title' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeVisible();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});

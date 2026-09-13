import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Toolbar, ToolbarButton } from '../src';

describe('ToolbarButton', () => {
  it('owns one 16px icon box across named and icon-only commands', () => {
    render(
      <Toolbar aria-label="Commands">
        <ToolbarButton size="compact">
          <svg width="14" height="14" aria-hidden="true" />
          Named
        </ToolbarButton>
        <ToolbarButton aria-label="Icon only">
          <svg width="14" height="14" aria-hidden="true" />
        </ToolbarButton>
      </Toolbar>,
    );

    for (const button of [
      screen.getByRole('button', { name: 'Named' }),
      screen.getByRole('button', { name: 'Icon only' }),
    ]) {
      expect(button).toHaveClass("[&_svg:not([class*='size-'])]:size-4");
      expect(button.className).not.toContain("[&_svg:not([class*='size-'])]:size-3.5");
    }
  });
});

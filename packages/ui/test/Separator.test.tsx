import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Separator } from '../src/index';

describe('Separator', () => {
  it('sizes from the orientation attribute emitted by Base UI', () => {
    render(<Separator orientation="vertical" />);

    const separator = screen.getByRole('separator');
    expect(separator).toHaveAttribute('data-orientation', 'vertical');
    expect(separator.className).toContain('data-[orientation=vertical]:w-px');
    expect(separator.className).toContain('data-[orientation=vertical]:self-stretch');
  });
});

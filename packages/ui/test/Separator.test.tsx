import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Separator } from '../src/index';

describe('Separator', () => {
  it('exposes its vertical orientation accessibly', () => {
    render(<Separator orientation="vertical" />);

    const separator = screen.getByRole('separator');
    expect(separator).toHaveAttribute('data-orientation', 'vertical');
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
  });

  /** A rule between two full-height regions still runs their full height. */
  it('stretches a vertical rule by default', () => {
    render(<Separator orientation="vertical" />);

    expect(screen.getByRole('separator').className).toContain(
      'data-[orientation=vertical]:self-stretch',
    );
  });

  /**
   * `align="center"` is what a command strip needs, and it has to *replace*
   * the stretch rather than sit beside it: both compile to a class plus an
   * attribute selector, so two of them on one element leaves source order
   * deciding. `cn` is `twMerge(clsx(...))`, which resolves the pair — this
   * holds it to resolving in the direction the variant asks for.
   */
  it('centres a vertical rule on request, and drops the stretch that would fight it', () => {
    render(<Separator orientation="vertical" align="center" />);

    const { className } = screen.getByRole('separator');
    expect(className).toContain('data-[orientation=vertical]:self-center');
    expect(className).not.toContain('data-[orientation=vertical]:self-stretch');
  });

  /** A caller's own class still wins over the variant it names. */
  it('lets a caller override the alignment the variant chose', () => {
    render(
      <Separator
        orientation="vertical"
        className="data-[orientation=vertical]:self-center"
        align="stretch"
      />,
    );

    const { className } = screen.getByRole('separator');
    expect(className).toContain('data-[orientation=vertical]:self-center');
    expect(className).not.toContain('data-[orientation=vertical]:self-stretch');
  });
});

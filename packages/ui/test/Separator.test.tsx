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

  /**
   * A centred rule has to bring its own height. The base string sizes a
   * vertical rule on one axis only — `w-px` — and leaves the height to the
   * flex line, which is exactly what `align="center"` stops doing. Without a
   * height of its own a centred rule is zero-tall and simply not drawn, so the
   * variant that removes the stretch owes a replacement.
   */
  it('gives a centred vertical rule a height of its own', () => {
    render(<Separator orientation="vertical" align="center" />);

    expect(screen.getByRole('separator').className).toContain('h-4');
  });

  /**
   * The default height is for the axis that lost its stretch. A horizontal
   * rule is `h-px` by an attribute-qualified rule, so a plain `h-4` reaching
   * it would be settled by specificity rather than by this component.
   */
  it('leaves a horizontal rule unsized when it is the centred one', () => {
    render(<Separator orientation="horizontal" align="center" />);

    expect(screen.getByRole('separator').className).not.toContain('h-4');
  });

  /** The default is a default: a call site that wants its own height keeps it. */
  it('lets a caller override the height a centred vertical rule defaults to', () => {
    render(<Separator orientation="vertical" align="center" className="h-5" />);

    const { className } = screen.getByRole('separator');
    expect(className).toContain('h-5');
    expect(className).not.toContain('h-4');
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

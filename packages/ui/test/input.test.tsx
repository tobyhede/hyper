import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from '../src/index';

describe('Input', () => {
  it('draws the standing field at the default size', () => {
    render(<Input aria-label="Title" />);

    const { className } = screen.getByRole('textbox', { name: 'Title' });
    expect(className).toContain('h-8');
    expect(className).toContain('rounded-lg');
  });

  /**
   * The field a command surface carries — a Sidebar row's title editor, a
   * list's filter. It was open-coded identically in two places before it was a
   * size, which is what a third copy would have made a third chance to
   * disagree.
   */
  it('draws the compact field a command surface carries', () => {
    render(<Input size="compact" aria-label="Filter" />);

    const { className } = screen.getByRole('textbox', { name: 'Filter' });
    expect(className).toContain('h-7');
    expect(className).toContain('rounded-md');
    expect(className).toContain('px-2');
    expect(className).toContain('py-0');
    expect(className).toContain('text-sm');
  });

  /**
   * The size replaces the default rather than layering over it: `cn` is
   * `twMerge(clsx(...))`, so the utilities the two sizes disagree on cannot
   * both survive and leave source order deciding which height applies.
   */
  it('leaves no trace of the default size on a compact field', () => {
    render(<Input size="compact" aria-label="Filter" />);

    const { className } = screen.getByRole('textbox', { name: 'Filter' });
    expect(className).not.toContain('h-8');
    expect(className).not.toContain('rounded-lg');
    expect(className).not.toContain('text-base');
  });

  it('still lets a caller override what the size chose', () => {
    render(<Input size="compact" className="h-9" aria-label="Filter" />);

    const { className } = screen.getByRole('textbox', { name: 'Filter' });
    expect(className).toContain('h-9');
    expect(className).not.toContain('h-7');
  });
});

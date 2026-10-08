import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Stage } from '../src/index';

describe('Stage', () => {
  it('draws its content in a named, focusable scroll region and its chrome outside it', () => {
    render(
      <Stage label="Presented Resource" contentKey="a" chrome={<button type="button">Next</button>}>
        <p>Content</p>
      </Stage>,
    );

    const body = screen.getByRole('region', { name: 'Presented Resource' });
    expect(body).toHaveTextContent('Content');
    // Focusable, so Page Up and Page Down reach it from the keyboard.
    expect(body).toHaveAttribute('tabindex', '0');
    expect(body).not.toContainElement(screen.getByRole('button', { name: 'Next' }));
  });

  it('starts new content at its top, keeping the scroll region and its focus', () => {
    const { rerender } = render(
      <Stage label="Presented Resource" contentKey="a" chrome={null}>
        <p>First</p>
      </Stage>,
    );
    const body = screen.getByRole('region', { name: 'Presented Resource' });
    body.focus();
    body.scrollTop = 120;

    rerender(
      <Stage label="Presented Resource" contentKey="a" chrome={null}>
        <p>First, redrawn</p>
      </Stage>,
    );
    expect(body.scrollTop).toBe(120);

    rerender(
      <Stage label="Presented Resource" contentKey="b" chrome={null}>
        <p>Second</p>
      </Stage>,
    );
    expect(screen.getByRole('region', { name: 'Presented Resource' })).toBe(body);
    expect(body.scrollTop).toBe(0);
    expect(body).toHaveFocus();
  });
});

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * This marker makes the primitive boundary observable without asserting Base
 * UI's private DOM implementation. The wrapper must delegate to the installed
 * primitive, not reproduce a native button locally.
 */
vi.mock('@base-ui/react/button', () => ({
  Button: forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
    function ObservedBaseButton(props, ref) {
      return <button ref={ref} data-testid="base-ui-button" {...props} />;
    },
  ),
}));

import { Button } from '../src/Button';

describe('Button', () => {
  it('delegates its native button rendering to the Base UI primitive', () => {
    render(<Button>Action</Button>);

    expect(screen.getByRole('button', { name: 'Action' })).toHaveAttribute(
      'data-testid',
      'base-ui-button',
    );
  });

  it('preserves the shared default type while allowing forms to opt into submit', () => {
    render(
      <form>
        <Button>Plain action</Button>
        <Button type="submit">Submit</Button>
      </form>,
    );

    expect(screen.getByRole('button', { name: 'Plain action' })).toHaveAttribute('type', 'button');
    expect(screen.getByRole('button', { name: 'Submit' })).toHaveAttribute('type', 'submit');
  });

  it('preserves variants, caller layout classes, disabled activation, and a button ref', () => {
    const onClick = vi.fn();
    const ref = { current: null as HTMLButtonElement | null };
    render(
      <>
        <Button variant="default" className="caller-layout">
          Primary
        </Button>
        <Button variant="destructive">Delete</Button>
        <Button ref={ref} disabled onClick={onClick}>
          Disabled
        </Button>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Primary' })).toHaveClass(
      'bg-primary',
      'caller-layout',
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('border-destructive');
    const disabled = screen.getByRole('button', { name: 'Disabled' });
    expect(disabled).toBeDisabled();
    fireEvent.click(disabled);
    expect(onClick).not.toHaveBeenCalled();
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('keeps a visible keyboard focus indicator in every variant', () => {
    render(<Button>Focusable</Button>);

    expect(screen.getByRole('button', { name: 'Focusable' })).toHaveClass(
      'focus-visible:outline-2',
      'focus-visible:outline-offset-2',
      'focus-visible:outline-ring',
    );
  });
});

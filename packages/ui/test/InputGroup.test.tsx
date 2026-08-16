import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../src/components/input-group';

describe('InputGroupAddon', () => {
  it('composes a caller click handler with its input-focus behavior', () => {
    const onClick = vi.fn();
    render(
      <InputGroup>
        <InputGroupAddon onClick={onClick}>Label</InputGroupAddon>
        <InputGroupInput aria-label="Value" />
      </InputGroup>,
    );

    fireEvent.click(screen.getByText('Label'));

    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole('textbox', { name: 'Value' })).toHaveFocus();
  });

  it('respects a caller that prevents the default focus behavior', () => {
    render(
      <InputGroup>
        <InputGroupAddon onClick={(event) => event.preventDefault()}>Label</InputGroupAddon>
        <InputGroupInput aria-label="Value" />
      </InputGroup>,
    );

    fireEvent.click(screen.getByText('Label'));

    expect(screen.getByRole('textbox', { name: 'Value' })).not.toHaveFocus();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogTitle } from '../src/index';

describe('AlertDialogAction', () => {
  it('asks the dialog primitive to close after activation', () => {
    const onOpenChange = vi.fn();
    render(
      <AlertDialog defaultOpen onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogTitle>Confirm</AlertDialogTitle>
          <AlertDialogAction>Continue</AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  });
});

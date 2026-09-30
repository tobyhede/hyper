import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeleteConfirmation } from '../src/components/DeleteConfirmation';
import type { DeleteQuestionWords } from '../src/delete-confirmation';

const MAP: DeleteQuestionWords = {
  subject: { kind: 'map', name: 'Overview' },
  from: 'Space',
  description: 'Permanently deletes the Map.',
};

function ask(
  words: DeleteQuestionWords,
  {
    deleting = false,
    onConfirm = () => undefined,
    onDismiss = () => undefined,
  }: {
    readonly deleting?: boolean;
    readonly onConfirm?: () => void;
    readonly onDismiss?: () => void;
  } = {},
) {
  return render(
    <DeleteConfirmation
      {...words}
      deleting={deleting}
      onConfirm={onConfirm}
      onDismiss={onDismiss}
    />,
  );
}

describe('the delete confirmation', () => {
  it('asks about any subject by the name and scope it is given', () => {
    ask(MAP);

    const question = screen.getByRole('alertdialog', { name: 'Delete Overview From Space?' });
    expect(question).toHaveTextContent('Permanently deletes the Map.');
    expect(within(question).getByRole('button', { name: 'Delete' })).toBeVisible();
    expect(within(question).getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  it('asks about the subject alone when it names nothing it is deleted from', () => {
    ask({
      subject: { kind: 'edge', name: '3 Edges' },
      from: null,
      description: 'Permanently deletes the Edges from their Graph.',
    });

    expect(screen.getByRole('alertdialog', { name: 'Delete 3 Edges?' })).toBeVisible();
  });

  it('answers Delete with the deletion and Cancel with a dismissal', () => {
    const onConfirm = vi.fn();
    const onDismiss = vi.fn();
    ask(MAP, { onConfirm, onDismiss });

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('withholds both exits and Escape while the deletion runs', async () => {
    const onDismiss = vi.fn();
    ask(MAP, { deleting: true, onDismiss });

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
      await Promise.resolve();
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

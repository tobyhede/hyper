import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema, type Card } from '@project/core';
import { NewAlias } from '../src/components/NewAlias';

/**
 * The Alias creation pane on its own, for the one thing the full-app tests
 * cannot reach.
 *
 * A refused creation needs the Space to have changed under an open pane — the
 * picker only ever offers eligible non-Alias Cards, so nothing an author does
 * to this surface can produce a refusal from it. The message's *lifetime* is
 * still this component's contract, and it is the half that was wrong.
 */

const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');

const targets: readonly Card[] = [
  { id: TARGET_ID, title: 'A', kind: 'markdown', body: 'A source' },
];

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
});

describe('NewAlias', () => {
  /**
   * A refusal describes the attempt that produced it. Editing either field
   * begins a different one, so the message stops describing anything on screen
   * — the same rule the occurrence rename already follows when Escape restores
   * its draft.
   */
  it('reports that a refusal is stale when the title changes', () => {
    const staleRefusal = vi.fn();
    render(
      <NewAlias
        targets={targets}
        refusal={{ code: 'alias-target-not-found', targetId: TARGET_ID }}
        onCreate={() => undefined}
        onCancel={() => undefined}
        onRefusalStale={staleRefusal}
      />,
    );
    expect(screen.getByRole('alert')).toBeVisible();

    fireEvent.change(screen.getByTestId('new-alias-title'), { target: { value: 'Recap' } });

    expect(staleRefusal).toHaveBeenCalledTimes(1);
  });

  it('reports it for the Target search too, which is the other way to retry', () => {
    const staleRefusal = vi.fn();
    render(
      <NewAlias
        targets={targets}
        refusal={{ code: 'alias-target-not-found', targetId: TARGET_ID }}
        onCreate={() => undefined}
        onCancel={() => undefined}
        onRefusalStale={staleRefusal}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Target' }), { target: { value: 'A' } });

    expect(staleRefusal).toHaveBeenCalled();
  });

  it('attaches a Target refusal to the Target field', () => {
    render(
      <NewAlias
        targets={targets}
        refusal={{ code: 'alias-target-not-found', targetId: TARGET_ID }}
        onCreate={() => undefined}
        onCancel={() => undefined}
        onRefusalStale={() => undefined}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('That Target is no longer part of the Space.');
    expect(alert.closest('.card-pane__fields')).not.toBeNull();
    expect(screen.getByRole('combobox', { name: 'Target' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('says nothing while there is no refusal to go stale', () => {
    const staleRefusal = vi.fn();
    render(
      <NewAlias
        targets={targets}
        refusal={null}
        onCreate={() => undefined}
        onCancel={() => undefined}
        onRefusalStale={staleRefusal}
      />,
    );

    fireEvent.change(screen.getByTestId('new-alias-title'), { target: { value: 'Recap' } });

    expect(staleRefusal).not.toHaveBeenCalled();
  });
});

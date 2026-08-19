import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema, type CardId } from '@project/core';
import { OpenCard } from '../src/components/OpenCard';

const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const OTHER_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

const markdown = (over: { body?: string } = {}) => ({
  id: CARD_ID,
  title: 'A',
  kind: 'markdown' as const,
  body: over.body ?? '**A** source',
});

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

describe('the opened Card', () => {
  it('keeps all content fields pending until Done', () => {
    const onComplete = vi.fn(() => null);
    render(<OpenCard card={markdown()} onComplete={onComplete} onCancel={vi.fn()} />);

    expect(screen.queryByRole('textbox', { name: 'Description' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Renamed A' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source' }), {
      target: { value: 'New body' },
    });

    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onComplete).toHaveBeenCalledWith({
      id: CARD_ID,
      title: 'Renamed A',
      kind: 'markdown',
      body: 'New body',
    });
  });

  it('cancels every pending field on Escape', () => {
    const onComplete = vi.fn(() => null);
    const onCancel = vi.fn();
    render(<OpenCard card={markdown()} onComplete={onComplete} onCancel={onCancel} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source' }), {
      target: { value: 'abandoned' },
    });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Markdown source' }), { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('marks the field a title validation error is about, and only that field', () => {
    const onComplete = vi.fn(() => null);
    render(<OpenCard card={markdown()} onComplete={onComplete} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('A Card title is required.');
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAttribute('aria-invalid', 'true');
  });

  /**
   * A schema error that belongs to neither field on this form is unattributed
   * — it goes to the form-level slot beside the actions.
   *
   * **No author can reach this through the fields**, and that is the honest
   * shape of the test rather than a gap in it. `markdownCardSchema` has four
   * paths: `title` and `body` are the two the fields write, `kind` is a
   * literal this module supplies, `body` is `z.string()` and a `<textarea>` has
   * nothing else to give it. `id` is the last, and it comes from the Card the
   * pane was opened on — so handing the pane a malformed one is the one way to
   * make the real validation fail off both fields, with no mock in it. A loaded
   * Space cannot produce that Card; the misattribution it exposes is real for
   * every path this list grows by.
   */
  it('surfaces an error belonging to no field in the shared dialog alert', () => {
    const onComplete = vi.fn(() => null);
    render(
      <OpenCard
        card={{ ...markdown(), id: 'not-a-uuid' as CardId }}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onComplete).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('The Card could not be completed.');
    expect(alert).toHaveAttribute('id', 'open-card-error');
    expect(alert).toHaveTextContent('Couldn’t save changes');
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAttribute('aria-invalid', 'false');
  });

  it('authors only Alias metadata in one Done', () => {
    const onEdit = vi.fn(() => null);
    const onCancel = vi.fn();
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        occurrence={{
          targets: [markdown(), { ...markdown(), id: OTHER_CARD_ID, title: 'B' }],
          onEdit,
        }}
        onCancel={onCancel}
      />,
    );

    expect(screen.queryByRole('textbox', { name: /Markdown source/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Recap' },
    });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Target' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(screen.getByRole('option', { name: /B/ }));
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onEdit).toHaveBeenCalledWith({ title: 'Recap', target: OTHER_CARD_ID });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('trims an Alias title before the authoring refusal boundary', () => {
    const onEdit = vi.fn(() => ({ code: 'card-title-required' }) as const);
    const onCancel = vi.fn();
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        occurrence={{ targets: [markdown()], onEdit }}
        onCancel={onCancel}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onEdit).toHaveBeenCalledWith({ title: '', target: CARD_ID });
    expect(screen.getByRole('alert')).toHaveTextContent('A Card title is required.');
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAttribute('aria-invalid', 'true');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('keeps an Alias draft open and attaches a Target refusal to its field', () => {
    const onCancel = vi.fn();
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        occurrence={{
          targets: [],
          onEdit: () => ({ code: 'alias-target-not-found', targetId: CARD_ID }),
        }}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'That Target is no longer part of the Space.',
    );
    expect(screen.getByRole('combobox', { name: 'Target' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('the opened Card as a dialog', () => {
  it('is named for its one edit subject and takes focus on its intended field', async () => {
    render(<OpenCard card={markdown()} onComplete={vi.fn(() => null)} onCancel={vi.fn()} />);

    expect(screen.getByRole('dialog')).toHaveAccessibleName('A');
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus());
  });

  it('uses Base UI modal containment rather than a local Tab handler', () => {
    render(<OpenCard card={markdown()} onComplete={vi.fn(() => null)} onCancel={vi.fn()} />);
    expect(screen.getByRole('dialog').closest('[data-base-ui-portal]')).not.toBeNull();
  });
});

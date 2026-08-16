import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema, type CardId } from '@project/core';
import { OpenCard } from '../src/components/OpenCard';

const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const OTHER_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const GRAPH_COLOR = '#ffc53d';

const markdown = (over: { title?: string; description?: string; body?: string } = {}) => ({
  id: CARD_ID,
  title: over.title ?? 'A',
  ...(over.description === undefined ? {} : { description: over.description }),
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
  it('keeps the title and Markdown pending until Ok while preserving description metadata', () => {
    const onComplete = vi.fn(() => null);
    render(
      <OpenCard
        card={markdown({ description: 'Existing caption' })}
        graphColor={GRAPH_COLOR}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Renamed A' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source' }), {
      target: { value: 'New body' },
    });

    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Description' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ok' }));

    expect(onComplete).toHaveBeenCalledWith({
      id: CARD_ID,
      title: 'Renamed A',
      description: 'Existing caption',
      kind: 'markdown',
      body: 'New body',
    });
  });

  it('cancels every pending field on Escape', () => {
    const onComplete = vi.fn(() => null);
    const onCancel = vi.fn();
    render(
      <OpenCard
        card={markdown()}
        graphColor={GRAPH_COLOR}
        onComplete={onComplete}
        onCancel={onCancel}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source' }), {
      target: { value: 'abandoned' },
    });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Markdown source' }), { key: 'Escape' });

    expect(screen.getByRole('alertdialog', { name: 'Discard Markdown changes?' })).toBeVisible();
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('marks the field a title refusal is about, and only that field', () => {
    const onComplete = vi.fn(() => null);
    render(
      <OpenCard
        card={markdown()}
        graphColor={GRAPH_COLOR}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ok' }));

    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('A Card title is required.');
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('textbox', { name: 'Description' })).not.toBeInTheDocument();
  });

  it('moves Enter from the title into Markdown and commits the form with Command-Enter', () => {
    const onComplete = vi.fn(() => null);
    const onCancel = vi.fn();
    render(
      <OpenCard
        card={markdown()}
        graphColor={GRAPH_COLOR}
        onComplete={onComplete}
        onCancel={onCancel}
      />,
    );

    const title = screen.getByRole('textbox', { name: 'Title' });
    const body = screen.getByRole('textbox', { name: 'Markdown source' });
    title.focus();
    fireEvent.keyDown(title, { key: 'Enter' });
    expect(body).toHaveFocus();

    fireEvent.change(body, { target: { value: 'Committed from the keyboard' } });
    fireEvent.keyDown(body, { key: 'Enter', metaKey: true });
    expect(onComplete).toHaveBeenCalledWith({
      id: CARD_ID,
      title: 'A',
      kind: 'markdown',
      body: 'Committed from the keyboard',
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  /**
   * A schema refusal that belongs to neither field on this form is unattributed
   * — it goes to the form-level slot beside the actions, not onto Description,
   * which was where every issue off the two named paths landed.
   *
   * **No author can reach this through the fields**, and that is the honest
   * shape of the test rather than a gap in it. `markdownCardSchema` has five
   * paths: `title` and `description` are the two the fields write, `kind` is a
   * literal this module supplies, `body` is `z.string()` and a `<textarea>` has
   * nothing else to give it. `id` is the last, and it comes from the Card the
   * pane was opened on — so handing the pane a malformed one is the one way to
   * make the real validation fail off both fields, with no mock in it. A loaded
   * Space cannot produce that Card; the misattribution it exposes is real for
   * every path this list grows by.
   */
  it('surfaces a refusal belonging to no field beside the actions', () => {
    const onComplete = vi.fn(() => null);
    render(
      <OpenCard
        card={{ ...markdown(), id: 'not-a-uuid' as CardId }}
        graphColor={GRAPH_COLOR}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ok' }));

    expect(onComplete).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('The Card could not be completed.');
    expect(alert).toHaveAttribute('id', 'open-card-refusal');
    expect(screen.queryByRole('textbox', { name: 'Description' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAttribute('aria-invalid', 'false');
  });

  it('authors only Alias metadata in one Done', () => {
    const onEdit = vi.fn(() => null);
    const onCancel = vi.fn();
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        graphColor={GRAPH_COLOR}
        occurrence={{
          targets: [markdown(), { ...markdown(), id: OTHER_CARD_ID, title: 'B' }],
          onEdit,
        }}
        onCancel={onCancel}
      />,
    );

    expect(screen.queryByRole('textbox', { name: /Description/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Markdown source/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Recap' },
    });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Target Card' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(screen.getByRole('option', { name: /B/ }));
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ok' }));

    expect(onEdit).toHaveBeenCalledWith({ title: 'Recap', target: OTHER_CARD_ID });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('trims an Alias title before the authoring refusal boundary', () => {
    const onEdit = vi.fn(() => 'An Alias title is required.');
    const onCancel = vi.fn();
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        graphColor={GRAPH_COLOR}
        occurrence={{ targets: [markdown()], onEdit }}
        onCancel={onCancel}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ok' }));

    expect(onEdit).toHaveBeenCalledWith({ title: '', target: CARD_ID });
    expect(screen.getByRole('alert')).toHaveTextContent('An Alias title is required.');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('moves Enter from an Alias title to its Target and commits with Control-Enter', () => {
    const onEdit = vi.fn(() => null);
    const onCancel = vi.fn();
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        graphColor={GRAPH_COLOR}
        occurrence={{ targets: [markdown()], onEdit }}
        onCancel={onCancel}
      />,
    );

    const title = screen.getByRole('textbox', { name: 'Title' });
    const target = screen.getByRole('combobox', { name: 'Target Card' });
    title.focus();
    fireEvent.keyDown(title, { key: 'Enter' });
    expect(target).toHaveFocus();

    fireEvent.keyDown(target, { key: 'Enter', ctrlKey: true });
    expect(onEdit).toHaveBeenCalledWith({ title: 'A again', target: CARD_ID });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('keeps an Alias draft open when the edit is refused', () => {
    const onCancel = vi.fn();
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        graphColor={GRAPH_COLOR}
        occurrence={{ targets: [], onEdit: () => 'This Alias could not be completed.' }}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ok' }));

    expect(screen.getByRole('alert')).toHaveTextContent('This Alias could not be completed.');
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('the opened Card as a dialog', () => {
  it('is named for its one edit subject and takes focus on its intended field', async () => {
    render(
      <OpenCard
        card={markdown()}
        graphColor={GRAPH_COLOR}
        onComplete={vi.fn(() => null)}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Edit A');
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Markdown source' })).toHaveFocus(),
    );
  });

  it('focuses the title when the Card still has its generated default name', async () => {
    render(
      <OpenCard
        card={markdown({ title: 'Card 1' })}
        graphColor={GRAPH_COLOR}
        onComplete={vi.fn(() => null)}
        onCancel={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus());
  });

  it('focuses the Target combobox when an Alias editor opens', async () => {
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        graphColor={GRAPH_COLOR}
        occurrence={{ targets: [markdown()], onEdit: vi.fn(() => null) }}
        onCancel={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Target Card' })).toHaveFocus(),
    );
  });

  it('uses Base UI modal containment rather than a local Tab handler', () => {
    render(
      <OpenCard
        card={markdown()}
        graphColor={GRAPH_COLOR}
        onComplete={vi.fn(() => null)}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog').closest('[data-base-ui-portal]')).not.toBeNull();
  });
});

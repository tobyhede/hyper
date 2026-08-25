import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type CardId } from '@project/core';
import { GRAPH_PALETTE } from '../src/colors';
import { OpenCard } from '../src/components/OpenCard';

const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const OTHER_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

const markdown = (id: CardId = CARD_ID, title = 'A') => ({
  id,
  title,
  kind: 'markdown' as const,
  body: `**${title}** source`,
});

/** The ids a field points assistive technology at, in the order it names them. */
const described = (field: HTMLElement): readonly string[] =>
  (field.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);

describe('the Alias metadata editor', () => {
  it('authors only Alias metadata in one Done', () => {
    const onEdit = vi.fn(() => null);
    const onCancel = vi.fn();
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        occurrence={{
          targets: [markdown(), markdown(OTHER_CARD_ID, 'B')],
          onEdit,
        }}
        onCancel={onCancel}
      />,
    );

    expect(screen.queryByRole('textbox', { name: /Markdown source/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Recap' },
    });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Target' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: /B/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onEdit).toHaveBeenCalledWith({ title: 'Recap', target: OTHER_CARD_ID });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('keeps a refused draft open and attaches each refusal to its owner', () => {
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

    const target = screen.getByRole('combobox', { name: 'Target' });
    expect(target).toHaveAttribute('aria-invalid', 'true');
    expect(described(target)).toContain('open-alias-target-error');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('trims a title and presents title and form refusals in their distinct channels', () => {
    const onEdit = vi.fn(() => ({ code: 'card-title-required' }) as const);
    const { rerender } = render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        occurrence={{ targets: [markdown()], onEdit }}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onEdit).toHaveBeenCalledWith({ title: '', target: CARD_ID });
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAccessibleDescription(
      'A Card title is required.',
    );

    rerender(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        occurrence={{ targets: [markdown()], onEdit: () => ({ code: 'layout-not-found' }) }}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'A again' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This Layout is no longer part of the Space.',
    );
  });

  it('opens on its Target picker and uses the normal graph colour fallback', async () => {
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        occurrence={{ targets: [markdown()], onEdit: vi.fn(() => null) }}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toHaveAccessibleName('A again');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Target' })).toHaveFocus());
    expect(document.body.querySelector('.card-editor')?.getAttribute('style')).toContain(
      `--card-editor-graph: ${GRAPH_PALETTE[0]}`,
    );
  });
});

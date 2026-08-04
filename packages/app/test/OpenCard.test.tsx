import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import { OpenCard } from '../src/components/OpenCard';

const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');

describe('OpenCard Markdown authoring', () => {
  it('keeps reading as the default and enters an explicit source editor without a title field', () => {
    render(
      <OpenCard
        title="A"
        content={{
          id: CARD_ID,
          title: 'A',
          description: 'Where every route begins',
          kind: 'markdown',
          body: '**A** source',
        }}
        onComplete={vi.fn()}
        footer={<button type="button">Close</button>}
      />,
    );

    expect(screen.getByText('**A** source')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Markdown source' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Card' }));

    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'A' })).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Card title' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue(
      'Where every route begins',
    );
    expect(screen.getByRole('textbox', { name: 'Markdown source' })).toHaveValue('**A** source');
  });

  it('keeps invalid description and cancelled Markdown local, then completes one valid Card value', () => {
    const onComplete = vi.fn();
    render(
      <OpenCard
        title="A"
        content={{ id: CARD_ID, title: 'A', kind: 'markdown', body: '**A** source' }}
        onComplete={onComplete}
        footer={<button type="button">Close</button>}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Card' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
      target: { value: 'x'.repeat(121) },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source' }), {
      target: { value: 'draft' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('alert')).toHaveTextContent('at most 120');
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('**A** source')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit Card' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Card' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source' }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onComplete).toHaveBeenCalledWith({
      id: CARD_ID,
      title: 'A',
      kind: 'markdown',
      body: '',
    });
  });

  /**
   * A description an author has emptied is *absent*, not an invisible run of
   * spaces. The stored key is what every reader keys off — the node draws a
   * `card-description` paragraph for any truthy value — so a blank one leaves a
   * caption that occupies space and says nothing, and no field is left to clear.
   */
  it('removes a description the author blanked rather than storing the blank', () => {
    const onComplete = vi.fn();
    render(
      <OpenCard
        title="A"
        content={{ id: CARD_ID, title: 'A', description: 'Original', kind: 'markdown', body: 'A' }}
        onComplete={onComplete}
        footer={<button type="button">Close</button>}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Card' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onComplete).toHaveBeenCalledWith({
      id: CARD_ID,
      title: 'A',
      kind: 'markdown',
      body: 'A',
    });
  });

  it('stores a description without the whitespace surrounding it', () => {
    const onComplete = vi.fn();
    render(
      <OpenCard
        title="A"
        content={{ id: CARD_ID, title: 'A', kind: 'markdown', body: 'A' }}
        onComplete={onComplete}
        footer={<button type="button">Close</button>}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Card' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
      target: { value: '  Where every route begins  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onComplete).toHaveBeenCalledWith({
      id: CARD_ID,
      title: 'A',
      description: 'Where every route begins',
      kind: 'markdown',
      body: 'A',
    });
  });

  it('links validation to the description and completes an unchanged Card', () => {
    const onComplete = vi.fn();
    render(
      <OpenCard
        title="A"
        content={{ id: CARD_ID, title: 'A', description: 'Original', kind: 'markdown', body: 'A' }}
        onComplete={onComplete}
        footer={<button type="button">Close</button>}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Card' }));
    const description = screen.getByRole('textbox', { name: 'Description' });
    fireEvent.change(description, { target: { value: 'x'.repeat(121) } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(description).toHaveAttribute('aria-invalid', 'true');
    expect(description).toHaveAccessibleDescription(/at most 120/i);
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.change(description, { target: { value: 'Original' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onComplete).toHaveBeenCalledWith({
      id: CARD_ID,
      title: 'A',
      description: 'Original',
      kind: 'markdown',
      body: 'A',
    });
  });
});

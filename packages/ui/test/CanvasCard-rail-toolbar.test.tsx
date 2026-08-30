import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasCard } from '../src';

/**
 * The Card rail's keyboard contract (ADR 0073).
 *
 * These assert what the roving-tabindex toolbar buys and what a plain group of
 * buttons could not: one tab stop for a rail however many commands it carries,
 * arrow traversal inside it, and an unavailable command that is still reachable.
 *
 * They also assert the rail's two groups, which are what stops "whose command
 * is this?" being answered by where a control happens to have been typed.
 */

const railActions = () => screen.getByTestId('canvas-card-actions');
const railButtons = () => Array.from(railActions().querySelectorAll('button'));
const tabStops = () => railButtons().filter((button) => button.tabIndex === 0);

const openMarkdownCard = () =>
  render(
    <CanvasCard
      front={{
        kind: 'markdown',
        source: 'Markdown',
        open: true,
        onOpenChange: vi.fn(),
        onBeginEdit: vi.fn(),
      }}
      state="rest"
      title="A"
      graphColor="#ffc53d"
    />,
  );

describe('the Card rail is one toolbar', () => {
  it("names the Card it commands, so its controls are heard as that Card's", () => {
    openMarkdownCard();

    const toolbar = screen.getByRole('toolbar', { name: 'Card A' });
    expect(toolbar).toBe(railActions());
    expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');
  });

  it('costs one tab stop however many commands it carries', () => {
    const { rerender } = openMarkdownCard();

    expect(railButtons()).toHaveLength(2);
    expect(tabStops()).toHaveLength(1);

    // The same rail, running a content edit: Save, Cancel and an unavailable
    // Close. Three controls, still one tab stop — which is the whole argument,
    // because a canvas draws many Cards and each one has a rail.
    rerender(
      <CanvasCard
        front={{
          kind: 'markdown',
          source: 'Markdown',
          open: true,
          onOpenChange: vi.fn(),
          onBeginEdit: vi.fn(),
          editor: { onComplete: vi.fn(), onEnd: vi.fn() },
        }}
        state="rest"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    expect(railButtons()).toHaveLength(3);
    expect(tabStops()).toHaveLength(1);
  });

  it('moves between its commands on the arrow keys', async () => {
    openMarkdownCard();

    const edit = screen.getByRole('button', { name: 'Edit Card A' });
    const close = screen.getByRole('button', { name: 'Close Card A' });

    edit.focus();
    expect(edit).toHaveFocus();

    fireEvent.keyDown(edit, { key: 'ArrowRight' });
    await waitFor(() => expect(close).toHaveFocus());

    fireEvent.keyDown(close, { key: 'ArrowLeft' });
    await waitFor(() => expect(edit).toHaveFocus());
  });

  it('keeps an unavailable command reachable, and refuses to run it', async () => {
    const onOpenChange = vi.fn();
    render(
      <CanvasCard
        front={{
          kind: 'markdown',
          source: 'Markdown',
          open: true,
          onOpenChange,
          onBeginEdit: vi.fn(),
          editor: { onComplete: vi.fn(), onEnd: vi.fn() },
        }}
        state="rest"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    const save = screen.getByRole('button', { name: 'Save Card A' });
    const close = screen.getByRole('button', { name: 'Close Card A' });
    expect(close).toHaveAttribute('aria-disabled', 'true');

    // Two arrows from Save, past Cancel, and the unavailable Close still
    // answers. A toolbar skips an item that is disabled *and* not focusable
    // when disabled; this one is focusable, so it stays in the order — which
    // is precisely what the native `disabled` property took away.
    const cancel = screen.getByRole('button', { name: 'Cancel editing Card A' });
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus());
    save.focus();
    fireEvent.keyDown(save, { key: 'ArrowRight' });
    await waitFor(() => expect(cancel).toHaveFocus());

    fireEvent.keyDown(cancel, { key: 'ArrowRight' });
    await waitFor(() => expect(close).toHaveFocus());

    fireEvent.click(close);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('keeps an arrow pressed on the rail off the canvas behind it', async () => {
    const onKeyDown = vi.fn();
    render(
      <div onKeyDown={onKeyDown}>
        <CanvasCard
          front={{
            kind: 'markdown',
            source: 'Markdown',
            open: true,
            onOpenChange: vi.fn(),
            onBeginEdit: vi.fn(),
          }}
          state="rest"
          title="A"
          graphColor="#ffc53d"
        />
      </div>,
    );

    const edit = screen.getByRole('button', { name: 'Edit Card A' });
    const close = screen.getByRole('button', { name: 'Close Card A' });
    edit.focus();
    fireEvent.keyDown(edit, { key: 'ArrowRight' });
    await waitFor(() => expect(close).toHaveFocus());

    // The toolbar handled it, and nothing above the Card saw it. React Flow
    // subscribes its own keys around the canvas this Card is drawn on.
    expect(close).toHaveFocus();
    expect(onKeyDown).not.toHaveBeenCalled();
  });
});

const kindGroup = (name: string) => within(railActions()).getByRole('group', { name });
const sharedGroup = () => within(railActions()).getByRole('group', { name: 'Card commands' });

describe('the rail says whose command each one is', () => {
  it("puts a kind's own command in that kind's group", () => {
    openMarkdownCard();

    const edit = screen.getByRole('button', { name: 'Edit Card A' });
    expect(kindGroup('Markdown Card commands')).toContainElement(edit);
    expect(sharedGroup()).not.toContainElement(edit);
  });

  it('puts Open and Close in the shared group, because every Card has them', () => {
    openMarkdownCard();

    const close = screen.getByRole('button', { name: 'Close Card A' });
    expect(sharedGroup()).toContainElement(close);
    // Kind commands lead and shared commands trail, so Close is in the same
    // place whatever kind of Card the rail is drawn on.
    const groups = within(railActions()).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'Markdown Card commands',
      'Card commands',
    ]);
  });

  it("keeps the shared group while an edit replaces the kind's own commands", () => {
    render(
      <CanvasCard
        front={{
          kind: 'markdown',
          source: 'Markdown',
          open: true,
          onOpenChange: vi.fn(),
          onBeginEdit: vi.fn(),
          editor: { onComplete: vi.fn(), onEnd: vi.fn() },
        }}
        state="rest"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    // Save and Cancel are the Markdown front's two ends and belong with Edit,
    // which they replaced. Close is unavailable but still the Card's.
    const markdown = kindGroup('Markdown Card commands');
    expect(within(markdown).getByRole('button', { name: 'Save Card A' })).toBeInTheDocument();
    expect(
      within(markdown).getByRole('button', { name: 'Cancel editing Card A' }),
    ).toBeInTheDocument();
    expect(sharedGroup()).toContainElement(screen.getByRole('button', { name: 'Close Card A' }));
  });

  it('draws no shared group for a Card that has no shared command', () => {
    render(
      <CanvasCard
        front={{ kind: 'alias', aliasOf: 'B', onOpen: vi.fn() }}
        state="rest"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    // ADR 0070 makes Alias Open the shared Layout-owned operation: it expands
    // the Card and renders its immutable Target's content read-only. Until that
    // contract is built, this fixture exercises the superseded Alias front,
    // whose lone command belongs to its kind group.
    const groups = within(railActions()).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(['Alias commands']);
    expect(groups[0]).toContainElement(screen.getByRole('button', { name: 'Open Card A' }));
  });

  it('groups the commands without dividing the keyboard', async () => {
    openMarkdownCard();

    const edit = screen.getByRole('button', { name: 'Edit Card A' });
    const close = screen.getByRole('button', { name: 'Close Card A' });
    expect(kindGroup('Markdown Card commands')).toContainElement(edit);
    expect(sharedGroup()).toContainElement(close);

    // One arrow crosses the group boundary, because the roving tabindex is the
    // toolbar root's and a group is semantics rather than a second composite.
    edit.focus();
    fireEvent.keyDown(edit, { key: 'ArrowRight' });
    await waitFor(() => expect(close).toHaveFocus());
    expect(tabStops()).toHaveLength(1);
  });
});

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasThing } from '../src';

/**
 * The Thing rail's keyboard contract (ADR 0073).
 *
 * These assert what the roving-tabindex toolbar buys and what a plain group of
 * buttons could not: one tab stop for a rail however many commands it carries,
 * arrow traversal inside it, and an unavailable command that is still reachable.
 *
 * They also assert the rail's two groups, which are what stops "whose command
 * is this?" being answered by where a control happens to have been typed.
 */

const railActions = () => screen.getByTestId('canvas-thing-actions');
const railButtons = () => Array.from(railActions().querySelectorAll('button'));
const tabStops = () => railButtons().filter((button) => button.tabIndex === 0);

const openMarkdownThing = () =>
  render(
    <CanvasThing
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

describe('the Thing rail is one toolbar', () => {
  it("names the Thing it commands, so its controls are heard as that Thing's", () => {
    openMarkdownThing();

    const toolbar = screen.getByRole('toolbar', { name: 'Thing A' });
    expect(toolbar).toBe(railActions());
    expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');
  });

  it('costs one tab stop however many commands it carries', () => {
    const { rerender } = openMarkdownThing();

    expect(railButtons()).toHaveLength(2);
    expect(tabStops()).toHaveLength(1);

    // The same rail, running a content edit: Save, Cancel and an unavailable
    // Close. Three controls, still one tab stop — which is the whole argument,
    // because a canvas draws many Things and each one has a rail.
    rerender(
      <CanvasThing
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
    openMarkdownThing();

    const edit = screen.getByRole('button', { name: 'Edit Thing A' });
    const close = screen.getByRole('button', { name: 'Close Thing A' });

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
      <CanvasThing
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

    const save = screen.getByRole('button', { name: 'Save Thing A' });
    const close = screen.getByRole('button', { name: 'Close Thing A' });
    expect(close).toHaveAttribute('aria-disabled', 'true');

    // Two arrows from Save, past Cancel, and the unavailable Close still
    // answers. A toolbar skips an item that is disabled *and* not focusable
    // when disabled; this one is focusable, so it stays in the order — which
    // is precisely what the native `disabled` property took away.
    const cancel = screen.getByRole('button', { name: 'Cancel editing Thing A' });
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
        <CanvasThing
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

    const edit = screen.getByRole('button', { name: 'Edit Thing A' });
    const close = screen.getByRole('button', { name: 'Close Thing A' });
    edit.focus();
    fireEvent.keyDown(edit, { key: 'ArrowRight' });
    await waitFor(() => expect(close).toHaveFocus());

    // The toolbar handled it, and nothing above the Thing saw it. React Flow
    // subscribes its own keys around the canvas this Thing is drawn on.
    expect(close).toHaveFocus();
    expect(onKeyDown).not.toHaveBeenCalled();
  });
});

const kindGroup = (name: string) => within(railActions()).getByRole('group', { name });
const sharedGroup = () => within(railActions()).getByRole('group', { name: 'Thing commands' });

describe('the rail says whose command each one is', () => {
  it("puts a kind's own command in that kind's group", () => {
    openMarkdownThing();

    const edit = screen.getByRole('button', { name: 'Edit Thing A' });
    expect(kindGroup('Markdown Thing commands')).toContainElement(edit);
    expect(sharedGroup()).not.toContainElement(edit);
  });

  it('puts Open and Close in the shared group, because every Thing has them', () => {
    openMarkdownThing();

    const close = screen.getByRole('button', { name: 'Close Thing A' });
    expect(sharedGroup()).toContainElement(close);
    // Open and Close trail the rail, so Close is in the same place whatever
    // kind of Thing it is drawn on.
    const groups = within(railActions()).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'Markdown Thing commands',
      'Thing commands',
    ]);
  });

  it("keeps the shared group while an edit replaces the kind's own commands", () => {
    render(
      <CanvasThing
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
    // which they replaced. Close is unavailable but still the Thing's.
    const markdown = kindGroup('Markdown Thing commands');
    expect(within(markdown).getByRole('button', { name: 'Save Thing A' })).toBeInTheDocument();
    expect(
      within(markdown).getByRole('button', { name: 'Cancel editing Thing A' }),
    ).toBeInTheDocument();
    expect(sharedGroup()).toContainElement(screen.getByRole('button', { name: 'Close Thing A' }));
  });

  it('draws Alias Open in the shared Thing command group', () => {
    render(
      <CanvasThing
        front={{
          kind: 'alias',
          source: '',
          open: false,
          onOpenChange: () => 'completed',
        }}
        state="rest"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    const groups = within(railActions()).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(['Thing commands']);
    expect(groups[0]).toContainElement(screen.getByRole('button', { name: 'Open Thing A' }));
  });

  it('groups the commands without dividing the keyboard', async () => {
    openMarkdownThing();

    const edit = screen.getByRole('button', { name: 'Edit Thing A' });
    const close = screen.getByRole('button', { name: 'Close Thing A' });
    expect(kindGroup('Markdown Thing commands')).toContainElement(edit);
    expect(sharedGroup()).toContainElement(close);

    // One arrow crosses the group boundary, because the roving tabindex is the
    // toolbar root's and a group is semantics rather than a second composite.
    edit.focus();
    fireEvent.keyDown(edit, { key: 'ArrowRight' });
    await waitFor(() => expect(close).toHaveFocus());
    expect(tabStops()).toHaveLength(1);
  });
});

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasResource } from '../src';

/**
 * The Resource rail's keyboard contract (ADR 0073).
 *
 * These assert what the roving-tabindex toolbar buys and what a plain group of
 * buttons could not: one tab stop for a rail however many commands it carries,
 * arrow traversal inside it, and an unavailable command that is still reachable.
 *
 * They also assert the rail's two groups, which are what stops "whose command
 * is this?" being answered by where a control happens to have been typed.
 */

const railActions = () => screen.getByTestId('canvas-resource-actions');
const railButtons = () => Array.from(railActions().querySelectorAll('button'));
const tabStops = () => railButtons().filter((button) => button.tabIndex === 0);

const openMarkdownResource = () =>
  render(
    <CanvasResource
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

describe('the Resource rail is one toolbar', () => {
  it("names the Resource it commands, so its controls are heard as that Resource's", () => {
    openMarkdownResource();

    const toolbar = screen.getByRole('toolbar', { name: 'Resource A' });
    expect(toolbar).toContainElement(railActions());
    expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');
  });

  it('costs one tab stop however many commands it carries', () => {
    const { rerender } = openMarkdownResource();

    expect(railButtons()).toHaveLength(2);
    expect(tabStops()).toHaveLength(1);

    // The same rail, running a content edit: Save, Cancel and an unavailable
    // Close. Three controls, still one tab stop — which is the whole argument,
    // because a canvas draws many Resources and each one has a rail.
    rerender(
      <CanvasResource
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
    openMarkdownResource();

    const edit = screen.getByRole('button', { name: 'Edit Resource A' });
    const close = screen.getByRole('button', { name: 'Close Resource A' });

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
      <CanvasResource
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

    const save = screen.getByRole('button', { name: 'Save Resource A' });
    const close = screen.getByRole('button', { name: 'Close Resource A' });
    expect(close).toHaveAttribute('aria-disabled', 'true');

    // Two arrows from Save, past Cancel, and the unavailable Close still
    // answers. A toolbar skips an item that is disabled *and* not focusable
    // when disabled; this one is focusable, so it stays in the order — which
    // is precisely what the native `disabled` property took away.
    const cancel = screen.getByRole('button', { name: 'Cancel editing Resource A' });
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
        <CanvasResource
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

    const edit = screen.getByRole('button', { name: 'Edit Resource A' });
    const close = screen.getByRole('button', { name: 'Close Resource A' });
    edit.focus();
    fireEvent.keyDown(edit, { key: 'ArrowRight' });
    await waitFor(() => expect(close).toHaveFocus());

    // The toolbar handled it, and nothing above the Resource saw it. React Flow
    // subscribes its own keys around the canvas this Resource is drawn on.
    expect(close).toHaveFocus();
    expect(onKeyDown).not.toHaveBeenCalled();
  });
});

const kindGroup = (name: string) => within(railActions()).getByRole('group', { name });
const sharedGroup = () => within(railActions()).getByRole('group', { name: 'Resource commands' });

describe('the rail says whose command each one is', () => {
  it("puts a kind's own command in that kind's group", () => {
    openMarkdownResource();

    const edit = screen.getByRole('button', { name: 'Edit Resource A' });
    expect(kindGroup('Markdown Resource commands')).toContainElement(edit);
    expect(sharedGroup()).not.toContainElement(edit);
  });

  it('puts Open and Close in the shared group, because every Resource has them', () => {
    openMarkdownResource();

    const close = screen.getByRole('button', { name: 'Close Resource A' });
    expect(sharedGroup()).toContainElement(close);
    // Open and Close trail the rail, so Close is in the same place whatever
    // kind of Resource it is drawn on.
    const groups = within(railActions()).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'Markdown Resource commands',
      'Resource commands',
    ]);
  });

  it("keeps the shared group while an edit replaces the kind's own commands", () => {
    render(
      <CanvasResource
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
    // which they replace while editing. Close is unavailable but still the Resource's.
    const markdown = kindGroup('Markdown Resource commands');
    expect(within(markdown).getByRole('button', { name: 'Save Resource A' })).toBeInTheDocument();
    expect(
      within(markdown).getByRole('button', { name: 'Cancel editing Resource A' }),
    ).toBeInTheDocument();
    expect(sharedGroup()).toContainElement(
      screen.getByRole('button', { name: 'Close Resource A' }),
    );
  });

  it('draws Reference Resource Open in the shared Resource command group', () => {
    render(
      <CanvasResource
        front={{
          kind: 'reference',
          target: { kind: 'markdown', source: '' },
          open: false,
          onOpenChange: () => 'completed',
        }}
        state="rest"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    const groups = within(railActions()).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(['Resource commands']);
    expect(groups[0]).toContainElement(screen.getByRole('button', { name: 'Open Resource A' }));
  });

  it('groups the commands without dividing the keyboard', async () => {
    openMarkdownResource();

    const edit = screen.getByRole('button', { name: 'Edit Resource A' });
    const close = screen.getByRole('button', { name: 'Close Resource A' });
    expect(kindGroup('Markdown Resource commands')).toContainElement(edit);
    expect(sharedGroup()).toContainElement(close);

    // One arrow crosses the group boundary, because the roving tabindex is the
    // toolbar root's and a group is semantics rather than a second composite.
    edit.focus();
    fireEvent.keyDown(edit, { key: 'ArrowRight' });
    await waitFor(() => expect(close).toHaveFocus());
    expect(tabStops()).toHaveLength(1);
  });
});

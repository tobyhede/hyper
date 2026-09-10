import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../src/components/context-menu';

/**
 * Base UI's menu positions itself through Floating UI, which measures. jsdom
 * ships neither `ResizeObserver` nor pointer capture, and both are reached
 * before the menu can open at all.
 */
beforeAll(() => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
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

describe('ContextMenuItem', () => {
  /**
   * **The same decision as `DropdownMenuItem`'s, held by the same kind of test.**
   *
   * `components/context-menu.tsx:9-13` says in its own words that the styling
   * mirrors the dropdown "so a menu reads the same whether it opened from an
   * icon or from a right click". A destructive row is ink at rest and red where
   * the reader is, and both registry defaults were dropped from both files in
   * one change (`.scratch/command-dock/issues/07`).
   *
   * Only the dropdown got the test that holds them gone, so the next
   * `shadcn add context-menu` could restore red-at-rest on every right-click
   * Delete in the product with `verify` green — half a settled decision undone
   * silently. Mirroring reads as duplication and is not: the ratchet is per
   * file, because the class list it guards is.
   */
  it('paints a destructive item only where the reader is, and lets its glyph follow', () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger>Right click me</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem variant="destructive">Delete</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Right click me'));

    const item = screen.getByRole('menuitem', { name: 'Delete' });
    expect(item).toHaveAttribute('data-variant', 'destructive');
    expect(item.className).toContain('data-[variant=destructive]:focus:text-destructive');
    expect(item.className).not.toContain('data-[variant=destructive]:text-destructive');
    expect(item.className).not.toContain('data-[variant=destructive]:*:[svg]:text-destructive');
  });
});

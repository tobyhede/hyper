import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../src/components/dropdown-menu';

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

afterAll(() => vi.unstubAllGlobals());

describe('DropdownMenu', () => {
  /**
   * React Flow's live Space-key pan activation subscription reaches a
   * portalled popup, so the popup must carry its own exclusion marker
   * (docs/agents/ui.md).
   */
  it('excludes its portalled popup from Space-key canvas panning', () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Item</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(screen.getByRole('menu').closest('.nokey')).not.toBeNull();
  });
});

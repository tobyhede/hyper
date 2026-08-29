import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../src/index';

/**
 * Base UI's positioner measures, and jsdom ships neither pointer capture nor
 * `scrollIntoView`; both are reached before the list can open at all.
 */
beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

type ContentProps = Parameters<typeof SelectContent>[0];

function openList(content: Partial<ContentProps> = {}): HTMLElement {
  render(
    <Select value="a" onValueChange={vi.fn()}>
      <SelectTrigger aria-label="Pick">
        <SelectValue />
      </SelectTrigger>
      <SelectContent {...content}>
        <SelectItem value="a">Alpha</SelectItem>
        <SelectItem value="b">Beta</SelectItem>
      </SelectContent>
    </Select>,
  );
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Pick' }), { key: 'ArrowDown' });

  // The positioner is the only element the wrapper marks `z-50`; it is the part
  // that carries `data-side`, and its inline style is what placement produces.
  const positioner = document.querySelector('.z-50');
  if (!(positioner instanceof HTMLElement)) {
    throw new Error('the Select positioner did not render');
  }
  return positioner;
}

describe('SelectContent placement', () => {
  it('does not carry a canvas key marker without a production consumer', () => {
    openList();

    expect(screen.getByRole('combobox', { name: 'Pick' })).not.toHaveClass('nokey');
    expect(screen.getByRole('listbox').closest('.nokey')).toBeNull();
  });

  /**
   * Base UI's `alignItemWithTrigger` defaults to `true` and this wrapper keeps
   * that default, as shadcn's own `base-nova` select does. While it is active
   * `SelectPositioner` sets `renderedSide = 'none'` and replaces the computed
   * positioner styles with a constant `{ position: 'fixed' }`, so no `side`,
   * `sideOffset` or offset arithmetic reaches the DOM — the list is drawn over
   * the trigger with the selected item on it. `data-side="none"` is that state
   * read back off the element.
   */
  it('stays item-aligned by default, which is what makes sideOffset inert', () => {
    const positioner = openList({ align: 'start', sideOffset: 24 });

    expect(positioner).toHaveAttribute('data-side', 'none');
    expect(positioner.style.position).toBe('fixed');
    expect(positioner.style.top).toBe('');
    expect(positioner.style.left).toBe('');
  });

  /**
   * The escape hatch is the reason the placement props are honest rather than
   * decorative: a consumer that turns item-alignment off gets Base UI's ordinary
   * anchored positioning, and `align`/`sideOffset` then decide where the list
   * lands. Pinned so the prop cannot be dropped from the wrapper again, which
   * would leave the type promising placement the primitive's default forbids.
   */
  it('hands placement back to the consumer when item-alignment is turned off', () => {
    const positioner = openList({ alignItemWithTrigger: false, align: 'start', sideOffset: 24 });

    expect(positioner).toHaveAttribute('data-side', 'bottom');
    expect(positioner).toHaveAttribute('data-align', 'start');
    expect(positioner.style.top).not.toBe('');
    expect(positioner.style.left).not.toBe('');
  });
});

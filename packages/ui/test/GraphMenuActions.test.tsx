import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, GraphMenuActions } from '../src';

beforeAll(() => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
});

afterAll(() => vi.unstubAllGlobals());

const mount = (editsDisabled: boolean) => {
  render(
    <DropdownMenu>
      <DropdownMenuTrigger>Graph</DropdownMenuTrigger>
      <DropdownMenuContent>
        <GraphMenuActions
          title="Long"
          renameItem={null}
          editsDisabled={editsDisabled}
          deleteDisabled={false}
          color="#1f77b4"
          colors={[{ color: '#1f77b4', label: 'Blue' }]}
          onRecolor={() => undefined}
          headShape="diamond"
          onChangeHeadShape={() => undefined}
          onCreate={() => undefined}
          onCopyLink={() => undefined}
          onDelete={() => undefined}
        />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Graph' }));
};

describe('GraphMenuActions', () => {
  it('draws Shape… directly under Colour…, its trigger showing the current head shape', () => {
    mount(false);
    const labels = screen.getAllByRole('menuitem').map((item) => item.textContent.trim());
    expect(labels.indexOf('Shape…')).toBe(labels.indexOf('Colour…') + 1);
    const headShapeItem = screen.getByRole('menuitem', { name: 'Shape…' });
    expect(headShapeItem.querySelector('[data-slot="graph-head-shape"]')).toHaveAttribute(
      'data-head-shape',
      'diamond',
    );
    expect(headShapeItem.querySelector('[data-slot="graph-head-shape"]')).toHaveAttribute(
      'fill',
      '#1f77b4',
    );
  });

  it.each([true, false])('withdraws Shape… exactly when Colour… is (%s)', (editsDisabled) => {
    mount(editsDisabled);
    const disabledOf = (name: string) =>
      screen.getByRole('menuitem', { name }).getAttribute('aria-disabled') === 'true';
    expect(disabledOf('Colour…')).toBe(editsDisabled);
    expect(disabledOf('Shape…')).toBe(editsDisabled);
  });
});

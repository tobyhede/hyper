import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, GraphMenuActions } from '../src';

beforeAll(() => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
});

afterAll(() => vi.unstubAllGlobals());

const COLORS = [
  { color: '#1f77b4', label: 'Blue' },
  { color: '#ff7f0e', label: 'Orange' },
  { color: '#2ca02c', label: 'Green' },
];

const mount = (
  editsDisabled: boolean,
  { onRecolor = vi.fn(), onChangeHeadShape = vi.fn() } = {},
) => {
  // A withdrawn command has no press: the menu draws `null` unavailable.
  const pressOrNull = <Press,>(press: Press) => (editsDisabled ? null : press);
  render(
    <DropdownMenu>
      <DropdownMenuTrigger>Graph</DropdownMenuTrigger>
      <DropdownMenuContent>
        <GraphMenuActions
          title="Long"
          renameItem={null}
          color="#1f77b4"
          colors={COLORS}
          onRecolor={pressOrNull(onRecolor)}
          headShape="diamond"
          onChangeHeadShape={pressOrNull(onChangeHeadShape)}
          onCreate={() => undefined}
          onCopyLink={() => undefined}
          onDelete={() => undefined}
        />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Graph' }));
  return { onRecolor, onChangeHeadShape };
};

/** Open one of the Graph menu's submenus and answer the choice group it discloses. */
const openChoices = async (trigger: string, group: string) => {
  fireEvent.click(screen.getByRole('menuitem', { name: trigger }));
  return screen.findByRole('group', { name: group });
};

const checkedNames = (group: HTMLElement) =>
  within(group)
    .getAllByRole('menuitemradio')
    .filter((item) => item.getAttribute('aria-checked') === 'true')
    .map((item) => item.getAttribute('aria-label'));

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

  it.each([true, false])('draws Shape… unavailable when it has no press (%s)', (editsDisabled) => {
    mount(editsDisabled);
    const disabledOf = (name: string) =>
      screen.getByRole('menuitem', { name }).getAttribute('aria-disabled') === 'true';
    expect(disabledOf('Colour…')).toBe(editsDisabled);
    expect(disabledOf('Shape…')).toBe(editsDisabled);
  });

  it('offers every palette colour as a menu radio item, the current one checked', async () => {
    mount(false);
    const group = await openChoices('Colour…', 'Graph colour');
    expect(
      within(group)
        .getAllByRole('menuitemradio')
        .map((item) => item.getAttribute('aria-label')),
    ).toEqual(['Blue', 'Orange', 'Green']);
    expect(checkedNames(group)).toEqual(['Blue']);
  });

  it('offers the four head shapes as menu radio items, the current one checked', async () => {
    mount(false);
    const group = await openChoices('Shape…', 'Graph head shape');
    expect(
      within(group)
        .getAllByRole('menuitemradio')
        .map((item) => item.getAttribute('aria-label')),
    ).toEqual(['Arrow', 'Vee', 'Dot', 'Diamond']);
    expect(checkedNames(group)).toEqual(['Diamond']);
    const items = within(group).getAllByRole('menuitemradio');
    for (const [index, headShape] of ['arrow', 'vee', 'dot', 'diamond'].entries()) {
      const glyph = items[index]?.querySelector('[data-slot="graph-head-shape"]');
      expect(glyph).toHaveAttribute('data-head-shape', headShape);
      expect(glyph).toHaveAttribute('fill', '#1f77b4');
    }
  });

  it('moves the highlight with the arrows without choosing, and chooses on Enter', async () => {
    const { onRecolor } = mount(false);
    const group = await openChoices('Colour…', 'Graph colour');
    const swatch = (name: string) => within(group).getByRole('menuitemradio', { name });
    act(() => swatch('Blue').focus());

    fireEvent.keyDown(swatch('Blue'), { key: 'ArrowDown' });
    await waitFor(() => expect(swatch('Orange')).toHaveFocus());
    fireEvent.keyDown(swatch('Orange'), { key: 'ArrowDown' });
    await waitFor(() => expect(swatch('Green')).toHaveFocus());
    expect(onRecolor).not.toHaveBeenCalled();

    fireEvent.keyDown(swatch('Green'), { key: 'Enter' });
    expect(onRecolor).toHaveBeenCalledTimes(1);
    expect(onRecolor).toHaveBeenCalledWith('#2ca02c');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('highlights a choice by typing its name, without choosing', async () => {
    const { onChangeHeadShape } = mount(false);
    const group = await openChoices('Shape…', 'Graph head shape');
    const swatch = (name: string) => within(group).getByRole('menuitemradio', { name });
    act(() => swatch('Arrow').focus());

    fireEvent.keyDown(swatch('Arrow'), { key: 'd' });

    await waitFor(() => expect(swatch('Dot')).toHaveFocus());
    expect(onChangeHeadShape).not.toHaveBeenCalled();
  });

  it('closes Shape… onto its trigger on ArrowLeft, choosing nothing', async () => {
    const { onChangeHeadShape } = mount(false);
    const group = await openChoices('Shape…', 'Graph head shape');
    const vee = within(group).getByRole('menuitemradio', { name: 'Vee' });
    act(() => vee.focus());

    fireEvent.keyDown(vee, { key: 'ArrowLeft' });

    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Graph head shape' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('menuitem', { name: 'Shape…' })).toHaveFocus();
    expect(onChangeHeadShape).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import { expectMenuGroups, menuRows } from './menu-assertions';

const menuOf = (html: string): HTMLElement => {
  const menu = document.createElement('div');
  menu.innerHTML = html;
  return menu;
};

describe('expectMenuGroups', () => {
  it('reads one separator between each pair of groups, in document order', () => {
    const menu = menuOf(`
      <div role="menuitem">Create Reference</div>
      <hr role="separator" />
      <div role="menuitem">Copy link to Thing</div>
      <hr role="separator" />
      <div role="menuitem">Remove from Diagram</div>
    `);

    expectMenuGroups(menu, [['Create Reference'], ['Copy link to Thing'], ['Remove from Diagram']]);
  });

  it('rejects a matching separator count sitting in the wrong place', () => {
    const menu = menuOf(`
      <div role="menuitem">A</div>
      <div role="menuitem">B</div>
      <hr role="separator" />
      <div role="menuitem">C</div>
      <hr role="separator" />
    `);

    expect(menuRows(menu)).toEqual(['A', 'B', 'separator', 'C', 'separator']);
    expect(() => expectMenuGroups(menu, [['A'], ['B'], ['C']])).toThrow();
  });
});

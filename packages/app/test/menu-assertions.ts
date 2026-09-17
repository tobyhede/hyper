import { within } from '@testing-library/react';
import { expect } from 'vitest';

/**
 * A menu item's own label, past its optional leading icon column and a
 * Diagram/Graph list item's own checked-radio indicator.
 *
 * `EntityActionItems` (the Thing and Space Thing actions menu) draws an icon
 * in an `aria-hidden` column ahead of a label wrapper — and an icon that is
 * itself a `ThingKindIcon` (Create Reference's) nests a second `span`, so a bare
 * `span > span` selector reads that empty glyph wrapper instead of the label
 * past it; each wrapper this selector matches must itself carry no
 * `aria-hidden`, so it lands on the label rather than a possible trailing
 * description row.
 *
 * `DropdownMenuRadioItem` (the Diagram/Graph list) needs the same exclusion
 * for a different reason: its checked indicator is an un-hidden `span`
 * wrapping Base UI's own `aria-hidden` checkmark `span`, mounted only on the
 * chosen item — so a selector that allowed any nested `span` would read the
 * checkmark's empty label on that one item and nothing on the rest. Excluding
 * `aria-hidden` at both levels makes the whole indicator invisible to this
 * selector, checked or not.
 *
 * `DiagramMenuActions` and `GraphMenuActions` (the Diagram and Graph command
 * lists) draw their icon as a bare child with no wrapping `span` at all, so
 * the selector matches nothing there — this falls back to the item's own
 * `textContent`, which is exactly what those two already draw: an icon with
 * no text content followed by the label as a bare text node.
 */
export const menuItemLabel = (item: Element): string =>
  (
    item.querySelector(':scope > span:not([aria-hidden]) > span:not([aria-hidden])')?.textContent ??
    item.textContent
  ).trim();

/** Every item's label, in document order, matched by role rather than by menu family. */
export const menuItemLabels = (menu: HTMLElement): readonly string[] =>
  Array.from(menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')).map(menuItemLabel);

/**
 * Assert a menu's items read as the given groups, in order, with exactly one
 * separator between each pair of groups — the one grouping grammar every
 * entity, Diagram, Graph and Space menu in this product now shares
 * (`.scratch/dock-menu-reorganisation/`). The Playwright counterpart of this
 * assertion is `expectMenuGroups` in `packages/app/e2e/graph.ts`.
 */
export function expectMenuGroups(menu: HTMLElement, groups: readonly (readonly string[])[]): void {
  expect(menuItemLabels(menu)).toEqual(groups.flat());
  expect(within(menu).queryAllByRole('separator')).toHaveLength(Math.max(groups.length - 1, 0));
}

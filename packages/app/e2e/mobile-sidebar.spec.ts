import { expect, test, type Page } from './fixtures';
import { currentCanvas, nodeByTitle, settled, sidebar } from './graph';

/**
 * The workspace chrome below the Sidebar's breakpoint, where it is a modal
 * Sheet drawn *over* the canvas rather than beside it.
 *
 * That changes what a command in it has to do. The Sheet is a Base UI Dialog:
 * it traps focus and marks everything behind it inert, so a command whose
 * result is on the canvas — a Card whose title editor opens under the caret, a
 * pane, a presentation — leaves the author looking at the sheet, and for the
 * two that open an editor the editor cannot take focus at all. Every one of
 * them dismisses the sheet first (ADR 0053).
 *
 * 390x844 is a phone. The suite's own project is a desktop, so this file is the
 * only place the Sheet branch is exercised at all.
 */
test.use({ viewport: { width: 390, height: 844 } });

/** The same surface as the desktop one, drawn through the primitive's Sheet. */
const sheet = (page: Page) => sidebar(page);

async function openMobileSidebar(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
  await expect(sheet(page)).toHaveAttribute('data-mobile', 'true');
  await expect(sheet(page)).toBeVisible();
}

test('Add Card from the mobile sidebar names the new Card on the canvas', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await openMobileSidebar(page);
  await page.getByTestId('add-card').click();

  await expect(sheet(page)).toHaveCount(0);
  const title = page.getByRole('textbox', { name: 'Card title' });
  await expect(title).toBeFocused();
  await expect(title).toHaveValue('Card 1');
});

test('Add Alias from the mobile sidebar opens the Target picker', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await openMobileSidebar(page);
  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Alias' }).click();

  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Target' })).toBeFocused();
});

test('choosing a canvas or a Graph closes the mobile sidebar', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await openMobileSidebar(page);
  await page.getByRole('button', { name: 'Collection 1', exact: true }).click();

  await expect(sheet(page)).toHaveCount(0);
  await expect(currentCanvas(page)).toContainText('Collection 1');

  await openMobileSidebar(page);
  await page.getByRole('button', { name: 'Mid', exact: true }).click();

  await expect(sheet(page)).toHaveCount(0);
});

test('Present from the mobile sidebar leaves the presentation reachable', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await openMobileSidebar(page);
  await page.getByTestId('present-button').click();

  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();

  // The presentation is driven from the canvas, so the keyboard has to reach it
  // rather than a trap over it.
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.react-flow__node.rf-card-node--active')).toHaveCount(1);
});

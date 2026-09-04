import { expect, test, type Page } from './fixtures';
import { nodeByTitle, selectedCanvas, settled, sidebar } from './graph';

/**
 * The app's chrome below the Sidebar's breakpoint, where it is a modal
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

test(
  'Add Layout from the mobile sidebar selects an empty authored Layout',
  { tag: '@parity:mobile-space-sidebar-adds-empty-layout' },
  async ({ page }) => {
    await page.goto('/');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await settled(page);

    await openMobileSidebar(page);
    await page.getByRole('button', { name: 'Add Layout' }).click();

    await expect(sheet(page)).toHaveCount(0);
    await expect(selectedCanvas(page)).toContainText('Layout 1');
    await expect(page.getByRole('dialog', { name: 'Cards' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Cards' })).toHaveCount(0);
    await openMobileSidebar(page);
    await expect(sheet(page).getByTestId('persistence-status')).toHaveAttribute(
      'data-revision',
      '1',
    );
    await sheet(page).getByRole('button', { name: 'Actions for Layout Layout 1' }).click();
    await page.getByRole('menuitem', { name: 'Delete Layout' }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(selectedCanvas(page)).toContainText('Collection 1');
  },
);

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
  await page.getByRole('button', { name: 'Collection 2', exact: true }).click();

  await expect(sheet(page)).toHaveCount(0);
  await expect(selectedCanvas(page)).toContainText('Collection 2');

  await openMobileSidebar(page);
  await page.getByRole('button', { name: 'Collection 1', exact: true }).click();
  await expect(sheet(page)).toHaveCount(0);

  await openMobileSidebar(page);
  await page.getByRole('button', { name: 'Mid', exact: true }).click();

  await expect(sheet(page)).toHaveCount(0);
});

test('Delete on a mobile Sidebar control leaves the selected Card on the canvas', async ({
  page,
}) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await card.click();

  await openMobileSidebar(page);
  const renderer = page.getByRole('button', { name: 'Collection 1', exact: true });
  await renderer.focus();
  await page.keyboard.press('Delete');

  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(card).toBeVisible();
});

test('Card and Graph copy commands close the mobile sidebar', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await nodeByTitle(page, 'A').first().click();

  for (const name of [
    'Copy link to A',
    'Copy link in this Layout',
    'Copy link to Long',
    'Copy link to Long in this Layout',
  ]) {
    await openMobileSidebar(page);
    await page.getByRole('button', { name, exact: true }).click();
    await expect(sheet(page)).toHaveCount(0);
  }
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

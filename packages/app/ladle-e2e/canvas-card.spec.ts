import { expect, test, type Locator } from '@playwright/test';

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

async function expectHandlesOnCardBorder(card: Locator): Promise<void> {
  const alignment = await card.evaluate((element, sides) => {
    if (!(element instanceof HTMLElement)) throw new Error('Canvas Card is not HTML');

    const cardBox = element.getBoundingClientRect();
    const border = Number.parseFloat(getComputedStyle(element).borderTopWidth);
    const scaleX = cardBox.width / element.offsetWidth;
    const scaleY = cardBox.height / element.offsetHeight;
    const actual = Object.fromEntries(
      sides.map((side) => {
        const handle = element.querySelector<HTMLElement>(`[aria-label="Connect from ${side}"]`);
        if (handle === null) throw new Error(`Missing ${side} Edge handle`);
        const box = handle.getBoundingClientRect();
        return [side, { x: box.x + box.width / 2, y: box.y + box.height / 2 }];
      }),
    );

    return {
      actual,
      expected: {
        top: { x: cardBox.x + cardBox.width / 2, y: cardBox.y + (border * scaleY) / 2 },
        right: {
          x: cardBox.right - (border * scaleX) / 2,
          y: cardBox.y + cardBox.height / 2,
        },
        bottom: {
          x: cardBox.x + cardBox.width / 2,
          y: cardBox.bottom - (border * scaleY) / 2,
        },
        left: { x: cardBox.x + (border * scaleX) / 2, y: cardBox.y + cardBox.height / 2 },
      },
    };
  }, SIDES);

  for (const side of SIDES) {
    expect(alignment.actual[side]?.x).toBeCloseTo(alignment.expected[side].x, 3);
    expect(alignment.actual[side]?.y).toBeCloseTo(alignment.expected[side].y, 3);
  }
}

test('Canvas Card hover actions use CardNode handles in real React Flow geometry', async ({
  page,
}) => {
  await page.goto('/?story=components--canvas-card--hover-actions&mode=preview');

  const cards = page.locator('.react-flow__node-card .canvas-card');
  await expect(cards).toHaveCount(2);

  const hovered = cards.nth(0);
  const hoverHandles = hovered.locator('.rf-card-node__authoring-handle--source');
  await expect(hovered).toHaveAttribute('data-state', 'rest');
  await expect(hoverHandles).toHaveCount(4);
  await expect(hoverHandles.first()).toHaveCSS('opacity', '0');

  await hovered.hover();
  await expect(hovered).toHaveAttribute('data-state', 'hover');
  await expect(hovered.locator('.canvas-card__rail')).toHaveCSS(
    'background-color',
    'rgb(255, 197, 61)',
  );
  await expect(hovered.getByRole('button', { name: 'Connect from Strategies' })).toBeVisible();
  await expect(hoverHandles.first()).toHaveCSS('opacity', '1');
  await expectHandlesOnCardBorder(hovered);

  const selected = cards.nth(1);
  const selectedHandles = selected.locator('.rf-card-node__authoring-handle--source');
  await expect(selected).toHaveAttribute('data-state', 'selected');
  await expect(selectedHandles).toHaveCount(4);
  await expect(selectedHandles.first()).toHaveCSS('opacity', '0');

  await selected.hover();
  await expect(selected).toHaveAttribute('data-state', 'selected-hover');
  await expect(selectedHandles.first()).toHaveCSS('opacity', '1');
  await expectHandlesOnCardBorder(selected);

  await page.mouse.move(0, 0);
  await expect(selected).toHaveAttribute('data-state', 'selected');
  await expect(selectedHandles.first()).toHaveCSS('opacity', '0');
  await expect(selected.getByRole('button', { name: 'Connect from Strategies' })).toBeHidden();
});

test('Canvas Card states keep selection quiet and make dragging elevation visible', async ({
  page,
}) => {
  await page.goto('/?story=components--canvas-card--states&mode=preview');

  const cards = page.locator('.canvas-card');
  await expect(cards).toHaveCount(6);
  await expect(page.getByText('Grid, sorts, tree, cluster', { exact: false })).toHaveCount(0);

  const selected = page.locator('.canvas-card[data-state="selected"]');
  await expect(selected).toHaveCount(2);
  await expect(selected.first()).toHaveCSS('box-shadow', /rgb\(11, 13, 17\) 0px 0px 0px 3px/);
  await expect(selected.locator('.canvas-card__rail').first()).toHaveCSS(
    'background-color',
    'rgb(255, 197, 61)',
  );
  await expect(selected.getByRole('button')).toHaveCount(0);
  await expect(selected.locator('.rf-card-node__authoring-handle--source')).toHaveCount(0);

  const dragging = page.locator('.canvas-card[data-state="dragging"]');
  await expect(dragging).toHaveCount(2);
  await expect(dragging.first()).toHaveCSS('box-shadow', /7px 7px 0px/);
});

test('Canvas Card title editing commits with Enter and cancels with Escape', async ({ page }) => {
  await page.goto('/?story=components--canvas-card--editing&mode=preview');

  const card = page.getByRole('article', { name: 'Strategies' });
  await card.getByRole('heading', { name: 'Strategies' }).dblclick();
  const saving = card.getByRole('textbox', { name: 'Card title' });
  await expect(card).toHaveAttribute('data-state', 'editing');
  await expect(card.getByRole('button')).toHaveCount(0);
  await expect(card.getByText(/⏎|esc/i)).toHaveCount(0);
  await saving.fill('Saved title');
  await saving.press('Enter');
  await expect(page.getByRole('article', { name: 'Saved title' })).toBeVisible();

  const saved = page.getByRole('article', { name: 'Saved title' });
  await saved.getByRole('heading', { name: 'Saved title' }).dblclick();
  const cancelling = saved.getByRole('textbox', { name: 'Card title' });
  await cancelling.fill('Cancelled title');
  await cancelling.press('Escape');
  await expect(page.getByRole('article', { name: 'Saved title' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Cancelled title' })).toHaveCount(0);
});

test('Canvas Card fronts never render domain descriptions', async ({ page }) => {
  await page.goto('/?story=components--canvas-card--hover-actions&mode=preview');

  await expect(page.locator('.react-flow__node-card .canvas-card')).toHaveCount(2);
  await expect(page.getByText('Grid, sorts, tree, cluster', { exact: false })).toHaveCount(0);
});

test('Canvas overview is the production projection rendered by React Flow', async ({ page }) => {
  await page.goto('/?story=surfaces--canvas--overview&mode=preview');

  await expect(page.locator('.react-flow__node-card')).toHaveCount(6);
  await expect(page.locator('.rf-graph-edge')).toHaveCount(6);
  await expect(page.locator('.react-flow__controls')).toBeVisible();
});

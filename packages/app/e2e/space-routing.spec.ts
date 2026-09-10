import { encodeCompactUuid, uuidSchema } from '@project/core';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { SEEDED_GRAPH_ID, SEEDED_LAYOUT_ID, seedPositionedLayout } from './seed';

const FIXTURE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000040');
const MISSING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000041');
const FIRST_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000050');
const SECOND_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000051');
const LONG_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
const MID_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000024');
const ECHO_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000026');
const CARD_A_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const CARD_C_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const CARD_E_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');

/**
 * Copy one address out of the menu that offers it.
 *
 * **Two menus now, and which one an entity uses is the design.** A Card's own
 * commands are on its rail (ADR 0073) — the Command Dock's organising rule is
 * that they are not on the Space's command surface at all — while a Layout's and
 * a Graph's are behind their own cluster's disclosure. Both are `DropdownMenu`s
 * with the same `spaceEntityActions` deciding what an address means, which is
 * what stops the two coming to disagree.
 *
 * `delay` is the whole reason a press is spelled out: a default Playwright click
 * puts mousedown and mouseup in one tick and Base UI's dismissal never gets a
 * turn between them. A copy on the rail confirms in place without closing its
 * menu, so this dismisses before the next one.
 */
const copyFromMenu = async (page: Page, trigger: string, command: RegExp): Promise<void> => {
  // `exact`, because an Alias's rail is named for its own Title and a Card's
  // Title is a prefix of its Alias's — `Actions for Card A` matches
  // `Actions for Card A′` without it.
  await page.getByRole('button', { name: trigger, exact: true }).click({ delay: 120 });
  await page.getByRole('menuitem', { name: command }).click();
  await page.keyboard.press('Escape');
};

const installClipboard = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (value: string) => {
          sessionStorage.setItem('copied-product-url', value);
          return Promise.resolve();
        },
        readText: () => Promise.resolve(sessionStorage.getItem('copied-product-url') ?? ''),
      },
    });
  });
};

test('root redirects to and opens the canonical Meta Space URL', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(`/spaces/${encodeCompactUuid(FIXTURE_ID)}`);
  await expect(page.getByTestId('space-title')).toHaveText('Layout fixture');
});

test('a direct canonical URL opens its exact existing Space', async ({ page }) => {
  const response = await page.goto(`/spaces/${encodeCompactUuid(FIXTURE_ID)}`);

  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('space-title')).toHaveText('Layout fixture');
});

/**
 * Deliberately not the Space's `defaultLayout`. A URL naming the Layout the
 * Space would have opened on anyway is satisfied by ignoring the id in the path
 * altogether, so it proves nothing about the address being read; the second
 * authored Layout is the only one whose appearance can only have come from the
 * path. The assertions are the header naming the one selected Layout and the
 * canvas drawing that Layout's Cards rather than the default's — the Sidebar
 * lists every Layout title at all times, so matching a title as plain page text
 * would be true whatever is selected.
 */
test('a direct Layout URL restores the named authored Layout', async ({ page }) => {
  const response = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(SECOND_LAYOUT_ID)}`,
  );

  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('selected-canvas')).toContainText('Collection 2');
  await expect(page.locator(`.react-flow__node[data-id="${CARD_E_ID}"]`)).toBeVisible();
  await expect(page.locator(`.react-flow__node[data-id="${CARD_A_ID}"]`)).toHaveCount(0);
});

test('choosing a Layout pushes history and Back, Forward and reload restore it without authoring', async ({
  page,
}) => {
  const canonical = `/spaces/${encodeCompactUuid(FIXTURE_ID)}`;
  const second = `${canonical}/views/${encodeCompactUuid(SECOND_LAYOUT_ID)}`;
  await page.goto(canonical);
  const before = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());

  await page
    .getByRole('button', { name: 'Layout: Collection 1', exact: true })
    .click({ delay: 120 });
  await page.getByRole('menuitemradio', { name: 'Collection 2' }).click();
  await expect(page).toHaveURL(second);
  await page.reload();
  await expect(page.getByTestId('selected-canvas')).toContainText('Collection 2');

  await page.goBack();
  await expect(page).toHaveURL(canonical);
  await expect(page.getByTestId('selected-canvas')).toContainText('Collection 1');
  await page.goForward();
  await expect(page).toHaveURL(second);
  await expect(page.getByTestId('selected-canvas')).toContainText('Collection 2');

  const after = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());
  expect(after).toEqual(before);
});

test('Back or Forward to an unresolved destination shows the destination surface', async ({
  page,
}) => {
  await page.goto(`/spaces/${encodeCompactUuid(FIXTURE_ID)}`);
  await expect(page.getByTestId('selected-canvas')).toBeVisible();

  await page.evaluate(
    (path) => {
      window.history.pushState(null, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(MISSING_ID)}`,
  );

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Destination not found');
  await expect(alert).toContainText('The requested address does not exist in this Space.');
});

test('malformed and unresolved Space URLs have real host statuses', async ({ page }) => {
  const malformed = await page.goto('/spaces/not-a-compact-uuid');
  expect(malformed?.status()).toBe(400);

  const unresolved = await page.goto(`/spaces/${encodeCompactUuid(MISSING_ID)}`);
  expect(unresolved?.status()).toBe(404);

  const malformedView = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/not-a-compact-uuid`,
  );
  expect(malformedView?.status()).toBe(400);

  const unresolvedView = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(MISSING_ID)}`,
  );
  expect(unresolvedView?.status()).toBe(404);

  const malformedGraph = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/graphs/not-a-compact-uuid`,
  );
  expect(malformedGraph?.status()).toBe(400);

  const unresolvedGraph = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/graphs/${encodeCompactUuid(MISSING_ID)}`,
  );
  expect(unresolvedGraph?.status()).toBe(404);
});

test('canonical and contextual Card links reveal a Closed Card without authoring', async ({
  page,
}) => {
  const canonical = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/cards/${encodeCompactUuid(CARD_A_ID)}`;
  const contextual = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}/cards/${encodeCompactUuid(CARD_A_ID)}`;
  const before = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());

  expect((await page.goto(canonical))?.status()).toBe(200);
  const canonicalCard = page.locator(`.react-flow__node[data-id="${CARD_A_ID}"]`);
  await expect(canonicalCard).toBeFocused();
  await expect(canonicalCard.getByTestId('card')).toHaveAttribute('data-expanded', 'false');

  expect((await page.goto(contextual))?.status()).toBe(200);
  const cardA = page.locator(`.react-flow__node[data-id="${CARD_A_ID}"]`);
  await expect(cardA).toBeFocused();
  await expect(cardA.getByTestId('card')).toHaveAttribute('data-expanded', 'false');
  await page.reload();
  await expect(cardA).toBeFocused();
  await page.goBack();
  await expect(page).toHaveURL(canonical);
  await expect(canonicalCard).toBeFocused();
  await page.goForward();
  await expect(page).toHaveURL(contextual);
  await expect(cardA).toBeFocused();

  const after = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());
  expect(after).toEqual(before);
});

test('a contextual Layout-and-Card link is not found when the Layout omits the Card', async ({
  page,
}) => {
  const response = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}/cards/${encodeCompactUuid(CARD_E_ID)}`,
  );

  expect(response?.status()).toBe(404);
});

test('a canonical Card omitted by the default Layout is revealed only in the Cards collection', async ({
  page,
}) => {
  const seeded = await seedPositionedLayout(page, 'Sparse Layout', (snapshot) => {
    const included = snapshot.cards[0];
    expect(included).toBeDefined();
    return included === undefined ? {} : { [included.id]: { x: 0, y: 0, open: false as const } };
  });
  const omitted = seeded.snapshot.cards[1];
  expect(omitted).toBeDefined();
  if (omitted === undefined) return;
  const canonical = `/spaces/${encodeCompactUuid(seeded.snapshot.id)}/cards/${encodeCompactUuid(omitted.id)}`;

  expect((await page.goto(canonical))?.status()).toBe(200);
  await expect(page.getByTestId('selected-canvas')).toContainText('Sparse Layout');
  await expect(page.getByRole('dialog', { name: 'Cards' })).toBeVisible();
  await expect(page.locator(`[data-card-id="${omitted.id}"]`)).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(page.locator(`.react-flow__node[data-id="${omitted.id}"]`)).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('selected-canvas')).toContainText('Sparse Layout');
  await expect(page.locator(`[data-card-id="${omitted.id}"]`)).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('returning to a canonical Card address reveals it again', async ({ page }) => {
  const seeded = await seedPositionedLayout(page, 'Sparse Layout', (snapshot) => {
    const included = snapshot.cards[0];
    expect(included).toBeDefined();
    return included === undefined ? {} : { [included.id]: { x: 0, y: 0, open: false as const } };
  });
  const omitted = seeded.snapshot.cards[1];
  expect(omitted).toBeDefined();
  if (omitted === undefined) return;
  const canonical = `/spaces/${encodeCompactUuid(seeded.snapshot.id)}/cards/${encodeCompactUuid(omitted.id)}`;

  expect((await page.goto(canonical))?.status()).toBe(200);
  await expect(page.getByRole('dialog', { name: 'Cards' })).toBeVisible();

  // Dismiss the collection and leave the Card address behind. This is the
  // reader moving on.
  await page.keyboard.press('Escape');
  await page.goto(`/spaces/${encodeCompactUuid(seeded.snapshot.id)}`);
  await expect(page.getByRole('dialog', { name: 'Cards' })).toBeHidden();

  // Back is a second arrival at the address, not a repeat of the first, so the
  // Card it names is revealed rather than left invisible off the Layout.
  await page.goBack();
  await expect(page).toHaveURL(canonical);
  await expect(page.getByTestId('selected-canvas')).toContainText('Sparse Layout');
  await expect(page.getByRole('dialog', { name: 'Cards' })).toBeVisible();
  await expect(page.locator(`[data-card-id="${omitted.id}"]`)).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('history restores a canonical Card through the default Layout, not the context being left', async ({
  page,
}) => {
  const contextual = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}/cards/${encodeCompactUuid(CARD_A_ID)}`;
  const canonical = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/cards/${encodeCompactUuid(CARD_A_ID)}`;
  await page.goto(contextual);
  await page.goto(canonical);
  await page.goBack();
  await expect(page.getByTestId('selected-canvas')).toContainText('Collection 1');

  await page.goForward();
  await expect(page).toHaveURL(canonical);
  await expect(page.getByTestId('selected-canvas')).toContainText('Collection 1');
});

/**
 * A Card's two addresses, from the Card's own rail.
 *
 * **Untagged, and that is a decision rather than an omission.** The claim this
 * carried — `space-sidebar-copies-card-destinations` — was retired with the
 * surface it named: a Card's links are the rail's now, and the rail's story
 * sheet is still under `stories/review`, so there is no stable story for a
 * parity claim to name. The behaviour is proved here and in
 * `card-rail-actions.test.tsx` meanwhile, and `parity-claims.ts` records that
 * the claim returns when the rail's sheet is promoted.
 */
test('copy commands distinguish canonical Card identity from its current Layout', async ({
  page,
}) => {
  await installClipboard(page);
  const view = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}`;
  await page.goto(view);
  const card = page.locator(`.react-flow__node[data-id="${CARD_A_ID}"]`);
  await card.click();
  // The rail reveals on hover, and it is the Card's own — no Space surface is
  // involved in reaching it.
  await card.hover();

  await copyFromMenu(page, 'Actions for Card A', /^Copy permanent link/);
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(
      `${new URL(page.url()).origin}/spaces/${encodeCompactUuid(FIXTURE_ID)}/cards/${encodeCompactUuid(CARD_A_ID)}`,
    );

  await card.hover();
  await copyFromMenu(page, 'Actions for Card A', /^Copy link/);
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`${new URL(page.url()).origin}${view}/cards/${encodeCompactUuid(CARD_A_ID)}`);
});

/**
 * What the Layout cluster's disclosure holds, and what it deliberately does not.
 *
 * **The claim this test carried is gone with its mechanism.**
 * `space-sidebar-entity-actions-menu` said one menu was "reached two ways from a
 * Sidebar row — its trailing icon and a right click". The Dock has clusters
 * rather than rows and no `onContextMenu` anywhere, so there is no second route
 * to restate; what survives is that a Layout's commands are all in one place,
 * and that Rename is not among them because the name itself is the control.
 */
test('the Layout cluster holds every Layout command except the rename its name is', async ({
  page,
}) => {
  await page.goto(`/spaces/${encodeCompactUuid(FIXTURE_ID)}`);

  await page
    .getByRole('button', { name: 'Layout: Collection 1', exact: true })
    .click({ delay: 120 });
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'New Layout' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Copy link' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Delete Collection 1' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Rename' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await expect(page.getByRole('button', { name: 'Rename Layout: Collection 1' })).toBeVisible();
});

test('canonical and contextual Graph links restore navigation context without authoring', async ({
  page,
}) => {
  const canonical = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}`;
  const contextual = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(SECOND_LAYOUT_ID)}/graphs/${encodeCompactUuid(ECHO_GRAPH_ID)}`;
  const before = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());

  expect((await page.goto(canonical))?.status()).toBe(200);
  await expect(page.getByTestId('selected-canvas')).toContainText('Collection 1');
  await expect(page.getByRole('button', { name: /^Present / })).toBeVisible();

  expect((await page.goto(contextual))?.status()).toBe(200);
  await expect(page.getByTestId('selected-canvas')).toContainText('Collection 2');
  await expect(page.getByRole('button', { name: /^Present / })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /^Present / })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(canonical);
  await expect(page.getByRole('button', { name: /^Present / })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(contextual);
  await expect(page.getByRole('button', { name: /^Present / })).toBeVisible();

  const after = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());
  expect(after).toEqual(before);
});

test('activating a Graph pushes a contextual destination restored by Back and Forward', async ({
  page,
}) => {
  const view = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}`;
  const mid = `${view}/graphs/${encodeCompactUuid(MID_GRAPH_ID)}`;
  await page.goto(view);

  await page.getByRole('button', { name: /^Active Graph: /, exact: false }).click({ delay: 120 });
  await page.getByRole('menuitemradio', { name: 'Mid', exact: true }).click();
  await expect(page).toHaveURL(mid);
  await page.goBack();
  await expect(page).toHaveURL(view);
  await expect(page.getByRole('button', { name: /^Present / })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(mid);
  await expect(page.getByRole('button', { name: /^Present / })).toBeVisible();
});

test(
  'Graph copy commands distinguish canonical identity from the current Layout',
  {
    tag: '@parity:command-dock-copies-graph-destinations',
  },
  async ({ page }) => {
    await installClipboard(page);
    const view = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}`;
    await page.goto(view);

    await copyFromMenu(page, 'Active Graph: Long', /^Copy permanent link/);
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(
        `${new URL(page.url()).origin}/spaces/${encodeCompactUuid(FIXTURE_ID)}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}`,
      );

    await copyFromMenu(page, 'Active Graph: Long', /^Copy link/);
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(`${new URL(page.url()).origin}${view}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}`);
  },
);

test('an incompatible contextual Layout-and-Graph destination has a real 404', async ({ page }) => {
  const response = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}/graphs/${encodeCompactUuid(ECHO_GRAPH_ID)}`,
  );

  expect(response?.status()).toBe(404);
});

test('an exact presentation link starts fresh at its Card and moves through browser history', async ({
  page,
}) => {
  const view = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}`;
  const atB = `${view}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}/present/${encodeCompactUuid(CARD_B_ID)}`;
  const atC = `${view}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}/present/${encodeCompactUuid(CARD_C_ID)}`;
  const before = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());

  expect((await page.goto(atB))?.status()).toBe(200);
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await expect(page.locator(`.react-flow__node[data-id="${CARD_B_ID}"]`)).toHaveClass(
    /rf-card-node--active/,
  );
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(atB);
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await expect(page.locator(`.react-flow__node[data-id="${CARD_B_ID}"]`)).toHaveClass(
    /rf-card-node--active/,
  );
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);

  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(atC);
  await page.goBack();
  await expect(page).toHaveURL(atB);
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(atC);
  await page.getByTestId('exit-presenting').click();
  await expect(page).toHaveURL(`${view}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}`);

  const after = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());
  expect(after).toEqual(before);
});

test('copies the exact current presentation point', async ({ page }) => {
  await installClipboard(page);
  const path = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}/present/${encodeCompactUuid(CARD_B_ID)}`;
  await page.goto(path);

  await page.getByRole('button', { name: 'Copy link to this presentation point' }).click();

  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`${new URL(page.url()).origin}${path}`);
});

test('entering, advancing and retreating each append presentation history', async ({ page }) => {
  const graph = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}`;
  const atA = `${graph}/present/${encodeCompactUuid(CARD_A_ID)}`;
  const atB = `${graph}/present/${encodeCompactUuid(CARD_B_ID)}`;
  await page.goto(graph);

  await page.getByRole('button', { name: /^Present / }).click();
  await expect(page).toHaveURL(atA);
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(atB);
  await page.getByTestId('presenting-chrome').getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(atA);

  await page.goBack();
  await expect(page).toHaveURL(atB);
  await page.goBack();
  await expect(page).toHaveURL(atA);
  await page.goForward();
  await expect(page).toHaveURL(atB);
  await page.goForward();
  await expect(page).toHaveURL(atA);
});

/**
 * A self-Edge is where a Traversal history move and an address move come apart:
 * advancing appends the same Card, so the history grows and the position does
 * not. Under ADR 0081 the browser is told about the position, so entering the
 * presentation earns an entry and the move over the self-Edge earns none. This
 * asserted the opposite until that decision — a second entry at the same URL,
 * which made Back a no-op the reader had to press twice.
 */
test('a self-Edge presentation move takes no browser entry', async ({ page }) => {
  const seeded = await seedPositionedLayout(page, 'Self Edge', () => ({
    [CARD_A_ID]: { x: 20, y: 20, open: false },
  }));
  const snapshot = {
    ...seeded.snapshot,
    document: {
      ...seeded.snapshot.document,
      layouts: [
        {
          ...seeded.snapshot.document.layouts?.[0],
          graphs: [
            {
              id: SEEDED_GRAPH_ID,
              title: 'Graph 1',
              edges: [{ from: CARD_A_ID, to: CARD_A_ID }],
            },
          ],
        },
      ],
    },
  };
  const commit = await page.request.post('/api/spaces', {
    data: {
      changes: [
        {
          kind: 'update',
          spaceId: seeded.snapshot.id,
          snapshot,
          expectedRevision: seeded.revision,
        },
      ],
    },
  });
  expect(commit.ok()).toBe(true);
  const graph = `/spaces/${encodeCompactUuid(seeded.snapshot.id)}/views/${encodeCompactUuid(SEEDED_LAYOUT_ID)}/graphs/${encodeCompactUuid(SEEDED_GRAPH_ID)}`;
  const point = `${graph}/present/${encodeCompactUuid(CARD_A_ID)}`;
  await page.goto(graph);

  await page.getByRole('button', { name: /^Present / }).click();
  await expect(page).toHaveURL(point);
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(point);
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();

  // One Back leaves the presentation, because the self-Edge move added nothing
  // to go back through.
  await page.goBack();
  await expect(page).toHaveURL(graph);
  await page.goForward();
  await expect(page).toHaveURL(point);
});

test('malformed and incompatible presentation destinations have real host statuses', async ({
  page,
}) => {
  const base = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}/present`;
  expect((await page.goto(`${base}/not-a-compact-uuid`))?.status()).toBe(400);
  expect((await page.goto(`${base}/${encodeCompactUuid(CARD_E_ID)}`))?.status()).toBe(404);
});

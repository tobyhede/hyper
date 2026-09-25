import { encodeCompactUuid, uuidSchema } from '@project/core';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mapMenu, expectMenuGroups, graphMenu, spaceMenu } from './graph';
import { SEEDED_GRAPH_ID, SEEDED_MAP_ID, seedPositionedMap } from './seed';

const FIXTURE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000040');
const MISSING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000041');
const FIRST_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000050');
const SECOND_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000051');
const LONG_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
const MID_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000024');
const ECHO_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000026');
const RESOURCE_A_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const RESOURCE_B_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const RESOURCE_C_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const RESOURCE_E_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');

/**
 * Copy one address out of the menu that offers it.
 *
 * **Two menus, and which one an entity uses is the design.** A Resource's own
 * commands are on its rail (ADR 0073) — the Command Dock's organising rule is
 * that they are not on the Space's command surface at all — while a Map's and
 * a Graph's are behind their own cluster's disclosure. Both are `DropdownMenu`s
 * with the same `spaceEntityActions` deciding what an address means, which is
 * what stops the two coming to disagree.
 *
 * `delay` is the whole reason a press is spelled out: a default Playwright click
 * puts mousedown and mouseup in one tick and Base UI's dismissal never gets a
 * turn between them. A copy on the rail confirms in place without closing its
 * menu, so this dismisses before the next one.
 */
const copyMatchingFromMenu = async (
  page: Page,
  trigger: string,
  command: string | RegExp,
): Promise<void> => {
  await page.getByRole('button', { name: trigger, exact: true }).click({ delay: 120 });
  await page.getByRole('menuitem', { name: command }).click();
  await page.keyboard.press('Escape');
};

/** Canonical Resource address — not the contextual Map one. */
const RESOURCE_COPY_LINK = /^Copy link to Resource(?! in Map)/;
const RESOURCE_COPY_LINK_IN_MAP = /^Copy link to Resource in Map/;

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
  await expect(page.getByTestId('space-title')).toHaveText('Map fixture');
});

test('a direct canonical URL opens its exact existing Space', async ({ page }) => {
  const response = await page.goto(`/spaces/${encodeCompactUuid(FIXTURE_ID)}`);

  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('space-title')).toHaveText('Map fixture');
});

/**
 * Deliberately not the Space's `defaultMap`. A URL naming the Map the
 * Space would have opened on anyway is satisfied by ignoring the id in the path
 * altogether, so it proves nothing about the address being read; the second
 * authored Map is the only one whose appearance can only have come from the
 * path. The assertions are the header naming the one selected Map and the
 * canvas drawing that Map's Resources rather than the default's, because a Map
 * title matched as plain page text says nothing about which Map is selected.
 */
test('a direct Map URL restores the named authored Map', async ({ page }) => {
  const response = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/maps/${encodeCompactUuid(SECOND_MAP_ID)}`,
  );

  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('selected-canvas')).toContainText('Collection 2');
  await expect(page.locator(`.react-flow__node[data-id="${RESOURCE_E_ID}"]`)).toBeVisible();
  await expect(page.locator(`.react-flow__node[data-id="${RESOURCE_A_ID}"]`)).toHaveCount(0);
});

test('choosing a Map pushes history and Back, Forward and reload restore it without authoring', async ({
  page,
}) => {
  const canonical = `/spaces/${encodeCompactUuid(FIXTURE_ID)}`;
  const second = `${canonical}/maps/${encodeCompactUuid(SECOND_MAP_ID)}`;
  await page.goto(canonical);
  const before = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());

  const maps = await mapMenu(page);
  await maps.getByRole('menuitemradio', { name: 'Collection 2', exact: true }).click();
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
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/maps/${encodeCompactUuid(MISSING_ID)}`,
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

  const malformedMap = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/maps/not-a-compact-uuid`,
  );
  expect(malformedMap?.status()).toBe(400);

  const unresolvedMap = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/maps/${encodeCompactUuid(MISSING_ID)}`,
  );
  expect(unresolvedMap?.status()).toBe(404);

  const malformedGraph = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/graphs/not-a-compact-uuid`,
  );
  expect(malformedGraph?.status()).toBe(400);

  const unresolvedGraph = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/graphs/${encodeCompactUuid(MISSING_ID)}`,
  );
  expect(unresolvedGraph?.status()).toBe(404);
});

test('canonical and contextual Resource links reveal a Closed Resource without authoring', async ({
  page,
}) => {
  const canonical = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/resources/${encodeCompactUuid(RESOURCE_A_ID)}`;
  const contextual = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/maps/${encodeCompactUuid(FIRST_MAP_ID)}/resources/${encodeCompactUuid(RESOURCE_A_ID)}`;
  const before = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());

  expect((await page.goto(canonical))?.status()).toBe(200);
  const canonicalResource = page.locator(`.react-flow__node[data-id="${RESOURCE_A_ID}"]`);
  await expect(canonicalResource).toBeFocused();
  await expect(canonicalResource.getByTestId('resource')).toHaveAttribute('data-open', 'false');

  expect((await page.goto(contextual))?.status()).toBe(200);
  const resourceA = page.locator(`.react-flow__node[data-id="${RESOURCE_A_ID}"]`);
  await expect(resourceA).toBeFocused();
  await expect(resourceA.getByTestId('resource')).toHaveAttribute('data-open', 'false');
  await page.reload();
  await expect(resourceA).toBeFocused();
  await page.goBack();
  await expect(page).toHaveURL(canonical);
  await expect(canonicalResource).toBeFocused();
  await page.goForward();
  await expect(page).toHaveURL(contextual);
  await expect(resourceA).toBeFocused();

  const after = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());
  expect(after).toEqual(before);
});

test('a contextual Map-and-Resource link is not found when the Map omits the Resource', async ({
  page,
}) => {
  const response = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/maps/${encodeCompactUuid(FIRST_MAP_ID)}/resources/${encodeCompactUuid(RESOURCE_E_ID)}`,
  );

  expect(response?.status()).toBe(404);
});

test('a canonical Resource omitted by the default Map is revealed only in the Resources collection', async ({
  page,
}) => {
  const seeded = await seedPositionedMap(page, 'Sparse Map', (snapshot) => {
    const included = snapshot.resources[0];
    expect(included).toBeDefined();
    return included === undefined ? {} : { [included.id]: { x: 0, y: 0, open: false as const } };
  });
  const omitted = seeded.snapshot.resources[1];
  expect(omitted).toBeDefined();
  if (omitted === undefined) return;
  const canonical = `/spaces/${encodeCompactUuid(seeded.snapshot.id)}/resources/${encodeCompactUuid(omitted.id)}`;

  expect((await page.goto(canonical))?.status()).toBe(200);
  await expect(page.getByTestId('selected-canvas')).toContainText('Sparse Map');
  await expect(page.getByRole('dialog', { name: 'Resources' })).toBeVisible();
  await expect(page.locator(`[data-resource-id="${omitted.id}"]`)).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(page.locator(`.react-flow__node[data-id="${omitted.id}"]`)).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('selected-canvas')).toContainText('Sparse Map');
  await expect(page.locator(`[data-resource-id="${omitted.id}"]`)).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('returning to a canonical Resource address reveals it again', async ({ page }) => {
  const seeded = await seedPositionedMap(page, 'Sparse Map', (snapshot) => {
    const included = snapshot.resources[0];
    expect(included).toBeDefined();
    return included === undefined ? {} : { [included.id]: { x: 0, y: 0, open: false as const } };
  });
  const omitted = seeded.snapshot.resources[1];
  expect(omitted).toBeDefined();
  if (omitted === undefined) return;
  const canonical = `/spaces/${encodeCompactUuid(seeded.snapshot.id)}/resources/${encodeCompactUuid(omitted.id)}`;

  expect((await page.goto(canonical))?.status()).toBe(200);
  await expect(page.getByRole('dialog', { name: 'Resources' })).toBeVisible();

  // Dismiss the collection and leave the Resource address behind. This is the
  // reader moving on.
  await page.keyboard.press('Escape');
  await page.goto(`/spaces/${encodeCompactUuid(seeded.snapshot.id)}`);
  await expect(page.getByRole('dialog', { name: 'Resources' })).toBeHidden();

  // Back is a second arrival at the address, not a repeat of the first, so the
  // Resource it names is revealed rather than left invisible off the Map.
  await page.goBack();
  await expect(page).toHaveURL(canonical);
  await expect(page.getByTestId('selected-canvas')).toContainText('Sparse Map');
  await expect(page.getByRole('dialog', { name: 'Resources' })).toBeVisible();
  await expect(page.locator(`[data-resource-id="${omitted.id}"]`)).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('history restores a canonical Resource through the default Map, not the context being left', async ({
  page,
}) => {
  const contextual = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/maps/${encodeCompactUuid(FIRST_MAP_ID)}/resources/${encodeCompactUuid(RESOURCE_A_ID)}`;
  const canonical = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/resources/${encodeCompactUuid(RESOURCE_A_ID)}`;
  await page.goto(contextual);
  await page.goto(canonical);
  await page.goBack();
  await expect(page.getByTestId('selected-canvas')).toContainText('Collection 1');

  await page.goForward();
  await expect(page).toHaveURL(canonical);
  await expect(page.getByTestId('selected-canvas')).toContainText('Collection 1');
});

/**
 * A Resource's two addresses, from the Resource's own rail.
 *
 * **Untagged, and that is a decision rather than an omission.** A Resource's
 * links are the rail's, and the rail's story sheet is under `stories/review`,
 * so there is no stable story for a parity claim to name. The behaviour is
 * proved here and in `resource-rail-actions.test.tsx`.
 */
test('copy commands distinguish canonical Resource identity from its current Map', async ({
  page,
}) => {
  await installClipboard(page);
  const map = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/maps/${encodeCompactUuid(FIRST_MAP_ID)}`;
  await page.goto(map);
  const resource = page.locator(`.react-flow__node[data-id="${RESOURCE_A_ID}"]`);
  await resource.click();
  // The rail reveals on hover, and it is the Resource's own — no Space surface is
  // involved in reaching it.
  await resource.hover();

  await copyMatchingFromMenu(page, 'Actions for Resource A', RESOURCE_COPY_LINK);
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(
      `${new URL(page.url()).origin}/spaces/${encodeCompactUuid(FIXTURE_ID)}/resources/${encodeCompactUuid(RESOURCE_A_ID)}`,
    );

  await resource.hover();
  await copyMatchingFromMenu(page, 'Actions for Resource A', RESOURCE_COPY_LINK_IN_MAP);
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`${new URL(page.url()).origin}${map}/resources/${encodeCompactUuid(RESOURCE_A_ID)}`);
});

/**
 * What the Map cluster's disclosure holds, and what it deliberately does not.
 *
 * A Map's commands are all in one place, including Rename, and the name itself
 * is the disclosure that opens it. The Dock has no `onContextMenu`, so there is
 * no second route to it.
 *
 * **The order is one grouping grammar:**
 * the Map list, New Map on its own, Rename beside Copy link to
 * Map, then Delete — one separator between each group.
 */
test('the Map cluster holds every Map command including Rename', async ({ page }) => {
  await page.goto(`/spaces/${encodeCompactUuid(FIXTURE_ID)}`);

  const menu = await mapMenu(page);
  await expectMenuGroups(menu, [
    ['Collection 1', 'Collection 2', 'Linked Spaces'],
    ['New Map'],
    ['Rename', 'Copy link to Map'],
    ['Delete Collection 1'],
  ]);
  await page.keyboard.press('Escape');

  await expect(page.getByRole('button', { name: 'Map: Collection 1', exact: true })).toBeVisible();
});

/**
 * The Space menu's own grouping grammar: Rename beside Copy link to
 * Space, then Exit Space — one separator between the two groups. The address
 * copied is the Space's own, not the drawing Map's
 * (`link-actions.spec.ts` holds why no second address is offered here).
 */
test('the Space menu groups Rename with Copy link to Space, then Exit Space', async ({ page }) => {
  await installClipboard(page);
  await page.goto(`/spaces/${encodeCompactUuid(FIXTURE_ID)}`);

  const menu = await spaceMenu(page);
  await expectMenuGroups(menu, [['Rename', 'Copy link to Space'], ['Exit Space']]);

  await menu.getByRole('menuitem', { name: 'Copy link to Space', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`${new URL(page.url()).origin}/spaces/${encodeCompactUuid(FIXTURE_ID)}`);
});

test('canonical and contextual Graph links restore navigation context without authoring', async ({
  page,
}) => {
  const canonical = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}`;
  const contextual = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/maps/${encodeCompactUuid(SECOND_MAP_ID)}/graphs/${encodeCompactUuid(ECHO_GRAPH_ID)}`;
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
  const map = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/maps/${encodeCompactUuid(FIRST_MAP_ID)}`;
  const mid = `${map}/graphs/${encodeCompactUuid(MID_GRAPH_ID)}`;
  await page.goto(map);

  const graphs = await graphMenu(page);
  await graphs.getByRole('menuitemradio', { name: 'Mid', exact: true }).click();
  await expect(page).toHaveURL(mid);
  await page.goBack();
  await expect(page).toHaveURL(map);
  await expect(page.getByRole('button', { name: /^Present / })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(mid);
  await expect(page.getByRole('button', { name: /^Present / })).toBeVisible();
});

/**
 * The Graph menu's one grouping grammar and its one address: the Graph list,
 * New Graph, Colour… beside Rename and Copy link to Graph, then Delete — one
 * separator between each group, and no permanent address offered.
 */
test(
  'the Graph menu copies its within-Map address and offers no permanent one',
  {
    tag: '@parity:command-dock-copies-graph-destinations',
  },
  async ({ page }) => {
    await installClipboard(page);
    const map = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/maps/${encodeCompactUuid(FIRST_MAP_ID)}`;
    await page.goto(map);

    const menu = await graphMenu(page);
    await expect(menu.getByRole('menuitem', { name: /^Copy permanent link/ })).toHaveCount(0);
    await expectMenuGroups(menu, [
      ['Long', 'Mid', 'Short'],
      ['New Graph'],
      ['Colour…', 'Rename', 'Copy link to Graph'],
      ['Delete Long'],
    ]);

    await menu.getByRole('menuitem', { name: 'Copy link to Graph', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(`${new URL(page.url()).origin}${map}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}`);
  },
);

test('an incompatible contextual Map-and-Graph destination has a real 404', async ({ page }) => {
  const response = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/maps/${encodeCompactUuid(FIRST_MAP_ID)}/graphs/${encodeCompactUuid(ECHO_GRAPH_ID)}`,
  );

  expect(response?.status()).toBe(404);
});

test('an exact presentation link starts fresh at its Resource and moves through browser history', async ({
  page,
}) => {
  const map = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/maps/${encodeCompactUuid(FIRST_MAP_ID)}`;
  const atB = `${map}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}/present/${encodeCompactUuid(RESOURCE_B_ID)}`;
  const atC = `${map}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}/present/${encodeCompactUuid(RESOURCE_C_ID)}`;
  const before = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());

  expect((await page.goto(atB))?.status()).toBe(200);
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await expect(page.locator(`.react-flow__node[data-id="${RESOURCE_B_ID}"]`)).toHaveClass(
    /rf-resource-node--active/,
  );
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(atB);
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await expect(page.locator(`.react-flow__node[data-id="${RESOURCE_B_ID}"]`)).toHaveClass(
    /rf-resource-node--active/,
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
  await expect(page).toHaveURL(`${map}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}`);

  const after = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());
  expect(after).toEqual(before);
});

test('copies the exact current presentation point', async ({ page }) => {
  await installClipboard(page);
  const path = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/maps/${encodeCompactUuid(FIRST_MAP_ID)}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}/present/${encodeCompactUuid(RESOURCE_B_ID)}`;
  await page.goto(path);

  await page.getByRole('button', { name: 'Copy link to this presentation point' }).click();

  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`${new URL(page.url()).origin}${path}`);
});

test('entering, advancing and retreating each append presentation history', async ({ page }) => {
  const graph = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/maps/${encodeCompactUuid(FIRST_MAP_ID)}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}`;
  const atA = `${graph}/present/${encodeCompactUuid(RESOURCE_A_ID)}`;
  const atB = `${graph}/present/${encodeCompactUuid(RESOURCE_B_ID)}`;
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
 * advancing appends the same Resource, so the history grows and the position does
 * not. Under ADR 0081 the browser is told about the position, so entering the
 * presentation earns an entry and the move over the self-Edge earns none. A
 * second entry at the same URL would make Back a no-op the reader had to press
 * twice.
 */
test('a self-Edge presentation move takes no browser entry', async ({ page }) => {
  const seeded = await seedPositionedMap(page, 'Self Edge', () => ({
    [RESOURCE_A_ID]: { x: 20, y: 20, open: false },
  }));
  const snapshot = {
    ...seeded.snapshot,
    document: {
      ...seeded.snapshot.document,
      maps: [
        {
          ...seeded.snapshot.document.maps?.[0],
          graphs: [
            {
              id: SEEDED_GRAPH_ID,
              title: 'Graph 1',
              edges: [{ from: RESOURCE_A_ID, to: RESOURCE_A_ID }],
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
  const graph = `/spaces/${encodeCompactUuid(seeded.snapshot.id)}/maps/${encodeCompactUuid(SEEDED_MAP_ID)}/graphs/${encodeCompactUuid(SEEDED_GRAPH_ID)}`;
  const point = `${graph}/present/${encodeCompactUuid(RESOURCE_A_ID)}`;
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
  const base = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/maps/${encodeCompactUuid(FIRST_MAP_ID)}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}/present`;
  expect((await page.goto(`${base}/not-a-compact-uuid`))?.status()).toBe(400);
  expect((await page.goto(`${base}/${encodeCompactUuid(RESOURCE_E_ID)}`))?.status()).toBe(404);
});

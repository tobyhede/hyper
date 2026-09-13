import { encodeCompactUuid, uuidSchema } from '@project/core';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { SEEDED_GRAPH_ID, SEEDED_DIAGRAM_ID, seedPositionedDiagram } from './seed';

const FIXTURE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000040');
const MISSING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000041');
const FIRST_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000050');
const SECOND_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000051');
const LONG_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
const MID_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000024');
const ECHO_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000026');
const THING_A_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const THING_B_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const THING_C_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const THING_E_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');

/**
 * Copy one address out of the menu that offers it.
 *
 * **Two menus now, and which one an entity uses is the design.** A Thing's own
 * commands are on its rail (ADR 0073) — the Command Dock's organising rule is
 * that they are not on the Space's command surface at all — while a Diagram's and
 * a Graph's are behind their own cluster's disclosure. Both are `DropdownMenu`s
 * with the same `spaceEntityActions` deciding what an address means, which is
 * what stops the two coming to disagree.
 *
 * `delay` is the whole reason a press is spelled out: a default Playwright click
 * puts mousedown and mouseup in one tick and Base UI's dismissal never gets a
 * turn between them. A copy on the rail confirms in place without closing its
 * menu, so this dismisses before the next one.
 */
const copyFromMenu = async (
  page: Page,
  trigger: string,
  command: string | RegExp,
): Promise<void> => {
  // `exact`, because an Alias's rail is named for its own Title and a Thing's
  // Title is a prefix of its Alias's — `Actions for Thing A` matches
  // `Actions for Thing A′` without it.
  await page.getByRole('button', { name: trigger, exact: true }).click({ delay: 120 });
  const item =
    typeof command === 'string'
      ? page.getByRole('menuitem', { name: command, exact: true })
      : page.getByRole('menuitem', { name: command });
  await item.click();
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
  await expect(page.getByTestId('space-title')).toHaveText('Diagram fixture');
});

test('a direct canonical URL opens its exact existing Space', async ({ page }) => {
  const response = await page.goto(`/spaces/${encodeCompactUuid(FIXTURE_ID)}`);

  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('space-title')).toHaveText('Diagram fixture');
});

/**
 * Deliberately not the Space's `defaultDiagram`. A URL naming the Diagram the
 * Space would have opened on anyway is satisfied by ignoring the id in the path
 * altogether, so it proves nothing about the address being read; the second
 * authored Diagram is the only one whose appearance can only have come from the
 * path. The assertions are the header naming the one selected Diagram and the
 * canvas drawing that Diagram's Things rather than the default's — the Sidebar
 * lists every Diagram title at all times, so matching a title as plain page text
 * would be true whatever is selected.
 */
test('a direct Diagram URL restores the named authored Diagram', async ({ page }) => {
  const response = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/diagrams/${encodeCompactUuid(SECOND_DIAGRAM_ID)}`,
  );

  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('selected-canvas')).toContainText('Collection 2');
  await expect(page.locator(`.react-flow__node[data-id="${THING_E_ID}"]`)).toBeVisible();
  await expect(page.locator(`.react-flow__node[data-id="${THING_A_ID}"]`)).toHaveCount(0);
});

test('choosing a Diagram pushes history and Back, Forward and reload restore it without authoring', async ({
  page,
}) => {
  const canonical = `/spaces/${encodeCompactUuid(FIXTURE_ID)}`;
  const second = `${canonical}/diagrams/${encodeCompactUuid(SECOND_DIAGRAM_ID)}`;
  await page.goto(canonical);
  const before = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());

  await page
    .getByRole('button', { name: 'Diagram: Collection 1', exact: true })
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
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/diagrams/${encodeCompactUuid(MISSING_ID)}`,
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

  const malformedDiagram = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/diagrams/not-a-compact-uuid`,
  );
  expect(malformedDiagram?.status()).toBe(400);

  const unresolvedDiagram = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/diagrams/${encodeCompactUuid(MISSING_ID)}`,
  );
  expect(unresolvedDiagram?.status()).toBe(404);

  const malformedGraph = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/graphs/not-a-compact-uuid`,
  );
  expect(malformedGraph?.status()).toBe(400);

  const unresolvedGraph = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/graphs/${encodeCompactUuid(MISSING_ID)}`,
  );
  expect(unresolvedGraph?.status()).toBe(404);
});

test('canonical and contextual Thing links reveal a Closed Thing without authoring', async ({
  page,
}) => {
  const canonical = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/things/${encodeCompactUuid(THING_A_ID)}`;
  const contextual = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/diagrams/${encodeCompactUuid(FIRST_DIAGRAM_ID)}/things/${encodeCompactUuid(THING_A_ID)}`;
  const before = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());

  expect((await page.goto(canonical))?.status()).toBe(200);
  const canonicalThing = page.locator(`.react-flow__node[data-id="${THING_A_ID}"]`);
  await expect(canonicalThing).toBeFocused();
  await expect(canonicalThing.getByTestId('thing')).toHaveAttribute('data-expanded', 'false');

  expect((await page.goto(contextual))?.status()).toBe(200);
  const thingA = page.locator(`.react-flow__node[data-id="${THING_A_ID}"]`);
  await expect(thingA).toBeFocused();
  await expect(thingA.getByTestId('thing')).toHaveAttribute('data-expanded', 'false');
  await page.reload();
  await expect(thingA).toBeFocused();
  await page.goBack();
  await expect(page).toHaveURL(canonical);
  await expect(canonicalThing).toBeFocused();
  await page.goForward();
  await expect(page).toHaveURL(contextual);
  await expect(thingA).toBeFocused();

  const after = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());
  expect(after).toEqual(before);
});

test('a contextual Diagram-and-Thing link is not found when the Diagram omits the Thing', async ({
  page,
}) => {
  const response = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/diagrams/${encodeCompactUuid(FIRST_DIAGRAM_ID)}/things/${encodeCompactUuid(THING_E_ID)}`,
  );

  expect(response?.status()).toBe(404);
});

test('a canonical Thing omitted by the default Diagram is revealed only in the Things collection', async ({
  page,
}) => {
  const seeded = await seedPositionedDiagram(page, 'Sparse Diagram', (snapshot) => {
    const included = snapshot.things[0];
    expect(included).toBeDefined();
    return included === undefined ? {} : { [included.id]: { x: 0, y: 0, open: false as const } };
  });
  const omitted = seeded.snapshot.things[1];
  expect(omitted).toBeDefined();
  if (omitted === undefined) return;
  const canonical = `/spaces/${encodeCompactUuid(seeded.snapshot.id)}/things/${encodeCompactUuid(omitted.id)}`;

  expect((await page.goto(canonical))?.status()).toBe(200);
  await expect(page.getByTestId('selected-canvas')).toContainText('Sparse Diagram');
  await expect(page.getByRole('dialog', { name: 'Things' })).toBeVisible();
  await expect(page.locator(`[data-thing-id="${omitted.id}"]`)).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(page.locator(`.react-flow__node[data-id="${omitted.id}"]`)).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('selected-canvas')).toContainText('Sparse Diagram');
  await expect(page.locator(`[data-thing-id="${omitted.id}"]`)).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('returning to a canonical Thing address reveals it again', async ({ page }) => {
  const seeded = await seedPositionedDiagram(page, 'Sparse Diagram', (snapshot) => {
    const included = snapshot.things[0];
    expect(included).toBeDefined();
    return included === undefined ? {} : { [included.id]: { x: 0, y: 0, open: false as const } };
  });
  const omitted = seeded.snapshot.things[1];
  expect(omitted).toBeDefined();
  if (omitted === undefined) return;
  const canonical = `/spaces/${encodeCompactUuid(seeded.snapshot.id)}/things/${encodeCompactUuid(omitted.id)}`;

  expect((await page.goto(canonical))?.status()).toBe(200);
  await expect(page.getByRole('dialog', { name: 'Things' })).toBeVisible();

  // Dismiss the collection and leave the Thing address behind. This is the
  // reader moving on.
  await page.keyboard.press('Escape');
  await page.goto(`/spaces/${encodeCompactUuid(seeded.snapshot.id)}`);
  await expect(page.getByRole('dialog', { name: 'Things' })).toBeHidden();

  // Back is a second arrival at the address, not a repeat of the first, so the
  // Thing it names is revealed rather than left invisible off the Diagram.
  await page.goBack();
  await expect(page).toHaveURL(canonical);
  await expect(page.getByTestId('selected-canvas')).toContainText('Sparse Diagram');
  await expect(page.getByRole('dialog', { name: 'Things' })).toBeVisible();
  await expect(page.locator(`[data-thing-id="${omitted.id}"]`)).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('history restores a canonical Thing through the default Diagram, not the context being left', async ({
  page,
}) => {
  const contextual = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/diagrams/${encodeCompactUuid(FIRST_DIAGRAM_ID)}/things/${encodeCompactUuid(THING_A_ID)}`;
  const canonical = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/things/${encodeCompactUuid(THING_A_ID)}`;
  await page.goto(contextual);
  await page.goto(canonical);
  await page.goBack();
  await expect(page.getByTestId('selected-canvas')).toContainText('Collection 1');

  await page.goForward();
  await expect(page).toHaveURL(canonical);
  await expect(page.getByTestId('selected-canvas')).toContainText('Collection 1');
});

/**
 * A Thing's two addresses, from the Thing's own rail.
 *
 * **Untagged, and that is a decision rather than an omission.** The claim this
 * carried — `space-sidebar-copies-thing-destinations` — was retired with the
 * surface it named: a Thing's links are the rail's now, and the rail's story
 * sheet is still under `stories/review`, so there is no stable story for a
 * parity claim to name. The behaviour is proved here and in
 * `thing-rail-actions.test.tsx` meanwhile, and `parity-claims.ts` records that
 * the claim returns when the rail's sheet is promoted.
 */
test('copy commands distinguish canonical Thing identity from its current Diagram', async ({
  page,
}) => {
  await installClipboard(page);
  const diagram = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/diagrams/${encodeCompactUuid(FIRST_DIAGRAM_ID)}`;
  await page.goto(diagram);
  const thing = page.locator(`.react-flow__node[data-id="${THING_A_ID}"]`);
  await thing.click();
  // The rail reveals on hover, and it is the Thing's own — no Space surface is
  // involved in reaching it.
  await thing.hover();

  await copyFromMenu(page, 'Actions for Thing A', 'Copy Link to Card');
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(
      `${new URL(page.url()).origin}/spaces/${encodeCompactUuid(FIXTURE_ID)}/things/${encodeCompactUuid(THING_A_ID)}`,
    );

  await thing.hover();
  await copyFromMenu(page, 'Actions for Thing A', 'Copy Link to Card in Diagram');
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`${new URL(page.url()).origin}${diagram}/things/${encodeCompactUuid(THING_A_ID)}`);
});

/**
 * What the Diagram cluster's disclosure holds, and what it deliberately does not.
 *
 * **The claim this test carried is gone with its mechanism.**
 * `space-sidebar-entity-actions-menu` said one menu was "reached two ways from a
 * Sidebar row — its trailing icon and a right click". The Dock has clusters
 * rather than rows and no `onContextMenu` anywhere, so there is no second route
 * to restate; what survives is that a Diagram's commands are all in one place,
 * including Rename, and that the name itself is the disclosure that opens it.
 */
test('the Diagram cluster holds every Diagram command including Rename', async ({ page }) => {
  await page.goto(`/spaces/${encodeCompactUuid(FIXTURE_ID)}`);

  await page
    .getByRole('button', { name: 'Diagram: Collection 1', exact: true })
    .click({ delay: 120 });
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'New Diagram' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Copy link' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Delete Collection 1' })).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(
    page.getByRole('button', { name: 'Diagram: Collection 1', exact: true }),
  ).toBeVisible();
});

test('canonical and contextual Graph links restore navigation context without authoring', async ({
  page,
}) => {
  const canonical = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}`;
  const contextual = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/diagrams/${encodeCompactUuid(SECOND_DIAGRAM_ID)}/graphs/${encodeCompactUuid(ECHO_GRAPH_ID)}`;
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
  const diagram = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/diagrams/${encodeCompactUuid(FIRST_DIAGRAM_ID)}`;
  const mid = `${diagram}/graphs/${encodeCompactUuid(MID_GRAPH_ID)}`;
  await page.goto(diagram);

  await page.getByRole('button', { name: /^Active Graph: /, exact: false }).click({ delay: 120 });
  await page.getByRole('menuitemradio', { name: 'Mid', exact: true }).click();
  await expect(page).toHaveURL(mid);
  await page.goBack();
  await expect(page).toHaveURL(diagram);
  await expect(page.getByRole('button', { name: /^Present / })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(mid);
  await expect(page.getByRole('button', { name: /^Present / })).toBeVisible();
});

test(
  'Graph copy commands distinguish canonical identity from the current Diagram',
  {
    tag: '@parity:command-dock-copies-graph-destinations',
  },
  async ({ page }) => {
    await installClipboard(page);
    const diagram = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/diagrams/${encodeCompactUuid(FIRST_DIAGRAM_ID)}`;
    await page.goto(diagram);

    await copyFromMenu(page, 'Active Graph: Long', /^Copy permanent link/);
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(
        `${new URL(page.url()).origin}/spaces/${encodeCompactUuid(FIXTURE_ID)}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}`,
      );

    await copyFromMenu(page, 'Active Graph: Long', /^Copy link/);
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(`${new URL(page.url()).origin}${diagram}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}`);
  },
);

test('an incompatible contextual Diagram-and-Graph destination has a real 404', async ({
  page,
}) => {
  const response = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/diagrams/${encodeCompactUuid(FIRST_DIAGRAM_ID)}/graphs/${encodeCompactUuid(ECHO_GRAPH_ID)}`,
  );

  expect(response?.status()).toBe(404);
});

test('an exact presentation link starts fresh at its Thing and moves through browser history', async ({
  page,
}) => {
  const diagram = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/diagrams/${encodeCompactUuid(FIRST_DIAGRAM_ID)}`;
  const atB = `${diagram}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}/present/${encodeCompactUuid(THING_B_ID)}`;
  const atC = `${diagram}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}/present/${encodeCompactUuid(THING_C_ID)}`;
  const before = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());

  expect((await page.goto(atB))?.status()).toBe(200);
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await expect(page.locator(`.react-flow__node[data-id="${THING_B_ID}"]`)).toHaveClass(
    /rf-thing-node--active/,
  );
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(atB);
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await expect(page.locator(`.react-flow__node[data-id="${THING_B_ID}"]`)).toHaveClass(
    /rf-thing-node--active/,
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
  await expect(page).toHaveURL(`${diagram}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}`);

  const after = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());
  expect(after).toEqual(before);
});

test('copies the exact current presentation point', async ({ page }) => {
  await installClipboard(page);
  const path = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/diagrams/${encodeCompactUuid(FIRST_DIAGRAM_ID)}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}/present/${encodeCompactUuid(THING_B_ID)}`;
  await page.goto(path);

  await page.getByRole('button', { name: 'Copy link to this presentation point' }).click();

  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`${new URL(page.url()).origin}${path}`);
});

test('entering, advancing and retreating each append presentation history', async ({ page }) => {
  const graph = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/diagrams/${encodeCompactUuid(FIRST_DIAGRAM_ID)}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}`;
  const atA = `${graph}/present/${encodeCompactUuid(THING_A_ID)}`;
  const atB = `${graph}/present/${encodeCompactUuid(THING_B_ID)}`;
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
 * advancing appends the same Thing, so the history grows and the position does
 * not. Under ADR 0081 the browser is told about the position, so entering the
 * presentation earns an entry and the move over the self-Edge earns none. This
 * asserted the opposite until that decision — a second entry at the same URL,
 * which made Back a no-op the reader had to press twice.
 */
test('a self-Edge presentation move takes no browser entry', async ({ page }) => {
  const seeded = await seedPositionedDiagram(page, 'Self Edge', () => ({
    [THING_A_ID]: { x: 20, y: 20, open: false },
  }));
  const snapshot = {
    ...seeded.snapshot,
    document: {
      ...seeded.snapshot.document,
      diagrams: [
        {
          ...seeded.snapshot.document.diagrams?.[0],
          graphs: [
            {
              id: SEEDED_GRAPH_ID,
              title: 'Graph 1',
              edges: [{ from: THING_A_ID, to: THING_A_ID }],
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
  const graph = `/spaces/${encodeCompactUuid(seeded.snapshot.id)}/diagrams/${encodeCompactUuid(SEEDED_DIAGRAM_ID)}/graphs/${encodeCompactUuid(SEEDED_GRAPH_ID)}`;
  const point = `${graph}/present/${encodeCompactUuid(THING_A_ID)}`;
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
  const base = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/diagrams/${encodeCompactUuid(FIRST_DIAGRAM_ID)}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}/present`;
  expect((await page.goto(`${base}/not-a-compact-uuid`))?.status()).toBe(400);
  expect((await page.goto(`${base}/${encodeCompactUuid(THING_E_ID)}`))?.status()).toBe(404);
});

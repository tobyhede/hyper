import { expect, test } from './fixtures';
import type { Page, Route } from '@playwright/test';
import { dragBy, nodeByTitle, positionOf, settled } from './graph';

const isCommit = (method: string, url: string): boolean =>
  method === 'PUT' && /\/api\/spaces\/[0-9a-f-]+$/.test(new URL(url).pathname);

const navigationIsProtected = (page: Page) =>
  page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    return !window.dispatchEvent(event);
  });

/**
 * A barrier for asserting that a commit did *not* happen. A wall-clock wait
 * guesses how long is long enough and gets it wrong on a loaded machine; this
 * round-trips one request through the same page, and anything the app had
 * already queued is intercepted ahead of it.
 */
const settledNetwork = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    await fetch('/api/spaces');
  });
};

test('rapid edits commit in order and the latest position survives reload', async ({ page }) => {
  let releaseFirst = (): void => undefined;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let observeFirst = (): void => undefined;
  const firstObserved = new Promise<void>((resolve) => {
    observeFirst = resolve;
  });
  const expectedRevisions: string[] = [];

  await page.route('**/api/spaces/*', async (route) => {
    const request = route.request();
    if (!isCommit(request.method(), request.url())) return route.continue();
    const body = request.postDataJSON() as { expectedRevision: string };
    expectedRevisions.push(body.expectedRevision);
    if (expectedRevisions.length === 1) {
      observeFirst();
      await firstGate;
    }
    await route.continue();
  });

  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await settled(page);

  await dragBy(page, card, 0, 180);
  await firstObserved;
  // The route handler is parked on `firstGate`, so anything that throws before
  // the release leaves that commit — and the page — waiting until the test
  // times out, reporting a hang instead of the assertion that actually failed.
  try {
    await expect.poll(() => navigationIsProtected(page)).toBe(true);
    await dragBy(page, card, 120, 120);
    expect(expectedRevisions).toEqual(['0']);
  } finally {
    releaseFirst();
  }

  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await expect.poll(() => navigationIsProtected(page)).toBe(false);
  expect(expectedRevisions).toEqual(['0', '1']);
  const durablePosition = await positionOf(card);

  await page.reload();
  const reloaded = nodeByTitle(page, 'A').first();
  await expect(reloaded).toBeVisible();
  await settled(page);
  expect(await positionOf(reloaded)).toEqual(durablePosition);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
});

test('a network failure stays visible until the user retries', async ({ page }) => {
  let attempts = 0;
  const failFirstCommit = async (route: Route) => {
    const request = route.request();
    if (!isCommit(request.method(), request.url())) return route.continue();
    attempts += 1;
    await route.abort('failed');
  };
  await page.route('**/api/spaces/*', failFirstCommit);

  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await dragBy(page, card, 0, 180);

  const retry = page.getByRole('button', { name: 'Retry persistence' });
  await expect(retry).toBeVisible();
  expect(attempts).toBe(1);
  await expect.poll(() => navigationIsProtected(page)).toBe(true);

  await page.unroute('**/api/spaces/*', failFirstCommit);
  await retry.click();

  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
  await expect.poll(() => navigationIsProtected(page)).toBe(false);
});

test('a stale browser reports conflict and accepts the remote workspace without overwriting it', async ({
  page,
}) => {
  const stalePage = await page.context().newPage();
  try {
    await Promise.all([page.goto('/'), stalePage.goto('/')]);
    const currentCard = nodeByTitle(page, 'A').first();
    const staleCard = nodeByTitle(stalePage, 'A').first();
    await expect(currentCard).toBeVisible();
    await expect(staleCard).toBeVisible();
    await Promise.all([settled(page), settled(stalePage)]);

    let staleCommits = 0;
    await stalePage.route('**/api/spaces/*', async (route) => {
      const request = route.request();
      if (isCommit(request.method(), request.url())) staleCommits += 1;
      await route.continue();
    });

    await dragBy(page, currentCard, 0, 180);
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
    const remotePosition = await positionOf(currentCard);

    await dragBy(stalePage, staleCard, 180, 0);
    const acceptRemote = stalePage.getByRole('button', { name: 'Accept remote' });
    await expect(acceptRemote).toBeVisible();
    expect(staleCommits).toBe(1);
    await expect.poll(() => navigationIsProtected(stalePage)).toBe(true);
    await settledNetwork(stalePage);
    expect(staleCommits).toBe(1);

    // Leave the conflicted local workspace in unrelated navigation and start an
    // automatic placement just before acceptance. The stored Layout must open
    // fresh, and any result still arriving from this Graph placement is obsolete.
    const mountedGraphArea = await stalePage.locator('.graph-area').elementHandle();
    expect(mountedGraphArea).not.toBeNull();

    await stalePage.getByTestId('view-selector').click();
    await stalePage.getByRole('option', { name: 'Graph' }).click();
    await stalePage.getByTestId('route-selector').click();
    await stalePage.getByRole('option', { name: 'Echo' }).click();
    // No wait between starting the placement and accepting: settling first would
    // retire the very race this test exists to cover.
    await stalePage.getByTestId('present-button').click();

    await acceptRemote.click();

    const acceptedCard = nodeByTitle(stalePage, 'A').first();
    await expect(acceptedCard).toBeVisible();
    await settled(stalePage);
    expect(await positionOf(acceptedCard)).toEqual(remotePosition);
    await expect(stalePage.getByTestId('route-selector')).toContainText('Long');
    await expect(stalePage.getByTestId('presenting-chrome')).not.toBeVisible();
    expect(
      await mountedGraphArea!.evaluate(
        (element) => element === document.querySelector('.graph-area'),
      ),
    ).toBe(true);
    await expect(stalePage.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
    expect(staleCommits).toBe(1);
    await expect.poll(() => navigationIsProtected(stalePage)).toBe(false);

    await dragBy(stalePage, acceptedCard, 120, 80);
    await expect(stalePage.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
    expect(staleCommits).toBe(2);
  } finally {
    await stalePage.close();
  }
});

test('route activation and presenting do not write or protect navigation', async ({ page }) => {
  let commits = 0;
  await page.route('**/api/spaces/*', async (route) => {
    const request = route.request();
    if (isCommit(request.method(), request.url())) commits += 1;
    await route.continue();
  });

  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await page.getByTestId('route-selector').click();
  await page.getByRole('option', { name: 'Echo' }).click();
  await page.getByTestId('present-button').click();
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await settledNetwork(page);

  expect(commits).toBe(0);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
  await expect.poll(() => navigationIsProtected(page)).toBe(false);
});

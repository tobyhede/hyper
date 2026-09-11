import { expect, test } from './fixtures';
import type { Page, Route } from '@playwright/test';
import {
  activateGraph,
  activeGraph,
  dock,
  dragBy,
  nodeByTitle,
  positionOf,
  presentControl,
  selectCanvas,
  settled,
} from './graph';

const isCommit = (method: string, url: string): boolean =>
  method === 'POST' && new URL(url).pathname === '/api/spaces';

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

/**
 * **Untagged, and the claim it carried is retired.**
 *
 * `persistence-indicator-shows-save-lifecycle` said persistence reports saving,
 * briefly acknowledges success and returns to rest. The Command Dock draws no
 * resting cue at all — ticket `01` settled that a commit settles faster than a
 * dot can be read — so `PersistenceControl` is mounted only for the two states
 * that need a decision, and the saving half of that lifecycle is unreachable in
 * the application. What is left true is the ordering and the durability, which
 * is what this test actually proves.
 */
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

  await page.route('**/api/spaces', async (route) => {
    const request = route.request();
    if (!isCommit(request.method(), request.url())) return route.continue();
    // SAFETY: Playwright's `postDataJSON()` returns `any`; this narrows to
    // the one field read below, from a commit request this same app's own
    // client code just sent — not third-party input.
    const body = request.postDataJSON() as {
      changes: readonly { kind: string; expectedRevision?: string }[];
    };
    const update = body.changes.find((change) => change.kind === 'update');
    if (update?.expectedRevision === undefined) {
      throw new Error('The intercepted commit must contain an update change.');
    }
    expectedRevisions.push(update.expectedRevision);
    if (expectedRevisions.length === 1) {
      observeFirst();
      await firstGate;
    }
    await route.continue();
  });

  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const thing = nodeByTitle(page, 'A').first();
  await expect(thing).toBeVisible();
  await settled(page);

  await dragBy(page, thing, 0, 180);
  await firstObserved;
  // The graph handler is parked on `firstGate`, so anything that throws before
  // the release leaves that commit — and the page — waiting until the test
  // times out, reporting a hang instead of the assertion that actually failed.
  try {
    // A commit in flight is reported by the navigation guard rather than by a
    // cue on the surface: the Dock says nothing while saving works.
    await expect.poll(() => navigationIsProtected(page)).toBe(true);
    await dragBy(page, thing, 120, 120);
    expect(expectedRevisions).toEqual(['0']);
  } finally {
    releaseFirst();
  }

  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await expect.poll(() => navigationIsProtected(page)).toBe(false);
  expect(expectedRevisions).toEqual(['0', '1']);
  const durablePosition = await positionOf(thing);

  await page.reload();
  const reloaded = nodeByTitle(page, 'A').first();
  await expect(reloaded).toBeVisible();
  await settled(page);
  expect(await positionOf(reloaded)).toEqual(durablePosition);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
});

test(
  'a network failure stays visible until the user retries',
  {
    tag: [
      '@parity:command-dock-recovers-retryable-failure',
      '@parity:things-drawer-coexists-with-persistence-failure',
    ],
  },
  async ({ page }) => {
    let attempts = 0;
    const failFirstCommit = async (route: Route) => {
      const request = route.request();
      if (!isCommit(request.method(), request.url())) return route.continue();
      attempts += 1;
      await route.abort('failed');
    };
    await page.route('**/api/spaces', failFirstCommit);

    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await settled(page);
    await page.getByRole('button', { name: 'Things' }).click();
    await page.getByRole('button', { name: 'Add E to Diagram' }).click();

    // The report is a standing `Alert` beside the toolbar and never a cue in it:
    // status is not a command (ADR 0082), and there is no resting dot to read
    // either way. The reason and the action are both on the notice.
    const failure = page.getByTestId('persistence-failure');
    await expect(page.getByTestId('command-dock').getByTestId('persistence-failure')).toHaveCount(
      1,
    );
    await expect(dock(page).getByTestId('persistence-failure')).toHaveCount(0);
    await expect(failure).toBeVisible();
    const retry = failure.getByRole('button', { name: 'Retry' });
    await expect(retry).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Things' })).toBeVisible();
    expect(attempts).toBe(1);
    await expect.poll(() => navigationIsProtected(page)).toBe(true);

    await page.unroute('**/api/spaces', failFirstCommit);
    await retry.click();

    await expect(failure).toBeHidden();
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
    await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
    await expect.poll(() => navigationIsProtected(page)).toBe(false);
  },
);

test(
  'a permanent rejection explains the reason and leaves the Space available',
  { tag: '@parity:command-dock-reports-permanent-rejection' },
  async ({ page }) => {
    await page.route('**/api/spaces', async (route) => {
      const request = route.request();
      if (!isCommit(request.method(), request.url())) return route.continue();
      await route.fulfill({
        status: 403,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'https://hyper.dev/problems/forbidden',
          title: 'Forbidden',
          status: 403,
          detail: 'Permission denied',
        }),
      });
    });

    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    const thing = nodeByTitle(page, 'A').first();
    await expect(thing).toBeVisible();
    await settled(page);
    await dragBy(page, thing, 0, 180);

    const rejection = page.getByRole('alertdialog', { name: 'Changes couldn’t be saved' });
    // The application's sentence for `forbidden`, not the server's `detail`.
    // This is the whole rule end to end: a real 403 carrying real problem
    // prose, and none of that prose on the screen (ADR 0057).
    await expect(rejection).toContainText('You do not have permission to save this space.');
    await expect(rejection).not.toContainText('Permission denied');
    await rejection.getByRole('button', { name: 'Continue editing' }).click();
    await expect(page.getByRole('button', { name: 'Persistence rejected' })).toBeVisible();
    await expect(thing).toBeVisible();
  },
);

test(
  'a stale browser reports conflict and accepts the remote space without overwriting it',
  { tag: '@parity:command-dock-resolves-conflict' },
  async ({ page }) => {
    const stalePage = await page.context().newPage();
    try {
      await Promise.all([page.goto('/'), stalePage.goto('/')]);
      await Promise.all([
        selectCanvas(page, 'Collection 1'),
        selectCanvas(stalePage, 'Collection 1'),
      ]);
      const currentThing = nodeByTitle(page, 'A').first();
      const staleThing = nodeByTitle(stalePage, 'A').first();
      await expect(currentThing).toBeVisible();
      await expect(staleThing).toBeVisible();
      await Promise.all([settled(page), settled(stalePage)]);

      let staleCommits = 0;
      let releaseStaleCommit = (): void => undefined;
      const staleCommitGate = new Promise<void>((resolve) => {
        releaseStaleCommit = resolve;
      });
      let observeStaleCommit = (): void => undefined;
      const staleCommitObserved = new Promise<void>((resolve) => {
        observeStaleCommit = resolve;
      });
      await stalePage.route('**/api/spaces', async (route) => {
        const request = route.request();
        if (isCommit(request.method(), request.url())) {
          staleCommits += 1;
          observeStaleCommit();
          await staleCommitGate;
        }
        await route.continue();
      });

      await dragBy(page, currentThing, 0, 180);
      await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
      const remotePosition = await positionOf(currentThing);

      await dragBy(stalePage, staleThing, 180, 0);
      await staleCommitObserved;
      expect(staleCommits).toBe(1);
      await expect.poll(() => navigationIsProtected(stalePage)).toBe(true);

      const mountedGraphArea = await stalePage.locator('.graph-area').elementHandle();
      expect(mountedGraphArea).not.toBeNull();

      // The conflict AlertDialog is modal, so prepare the race while the stale
      // aggregate commit is parked: leave the local space in unrelated navigation
      // and start an automatic placement, then let the conflict arrive. Any
      // placement result still arriving after Reload belongs to the Space that
      // is being replaced.
      try {
        await selectCanvas(stalePage, 'Collection 2');
        await activateGraph(stalePage, 'Echo');
        await presentControl(stalePage).click();
      } finally {
        // Release even when setup fails, so the intercepted request cannot leave
        // the page hanging and hide the useful Playwright assertion.
        releaseStaleCommit();
      }

      const reload = stalePage.getByRole('button', { name: 'Reload' });
      await expect(reload).toBeVisible();
      await stalePage.keyboard.press('Escape');
      await expect(reload).toBeVisible();
      await reload.click();

      const acceptedThing = nodeByTitle(stalePage, 'A').first();
      await expect(acceptedThing).toBeVisible();
      await settled(stalePage);
      expect(await positionOf(acceptedThing)).toEqual(remotePosition);
      // Fresh Navigation over the stored Space, not the emphasis this page was
      // left in: Reload opens the authored Diagram the other page changed on its
      // first owned Graph, without replacing the mounted application surface.
      await expect(activeGraph(stalePage)).toHaveText('Long');
      await expect(stalePage.getByTestId('presenting-chrome')).not.toBeVisible();
      expect(
        await mountedGraphArea!.evaluate(
          (element) => element === document.querySelector('.graph-area'),
        ),
      ).toBe(true);
      await expect(stalePage.getByTestId('persistence-status')).toHaveAttribute(
        'data-revision',
        '1',
      );
      expect(staleCommits).toBe(1);
      await expect.poll(() => navigationIsProtected(stalePage)).toBe(false);

      await dragBy(stalePage, acceptedThing, 120, 80);
      await expect(stalePage.getByTestId('persistence-status')).toHaveAttribute(
        'data-revision',
        '2',
      );
      expect(staleCommits).toBe(2);
    } finally {
      await stalePage.close();
    }
  },
);

test('graph activation and presenting do not write or protect navigation', async ({ page }) => {
  let commits = 0;
  await page.route('**/api/spaces', async (route) => {
    const request = route.request();
    if (isCommit(request.method(), request.url())) commits += 1;
    await route.continue();
  });

  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await selectCanvas(page, 'Collection 2');
  await activateGraph(page, 'Echo');
  await presentControl(page).click();
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await settledNetwork(page);

  expect(commits).toBe(0);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
  await expect.poll(() => navigationIsProtected(page)).toBe(false);
});

test('Retry remains reachable while presenting and persists the failed Edit', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.route('**/api/spaces', async (route) => {
    if (isCommit(route.request().method(), route.request().url())) return route.abort('failed');
    return route.continue();
  });
  await dragBy(page, nodeByTitle(page, 'A'), 0, 100);
  const failure = page.getByTestId('persistence-failure');
  await expect(failure).toBeVisible();
  await presentControl(page).click();
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await expect(dock(page)).toBeHidden();
  await expect(failure).toBeVisible();
  await page.unroute('**/api/spaces');
  await failure.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(failure).toBeHidden();
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
});

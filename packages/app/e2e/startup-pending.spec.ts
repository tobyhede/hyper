import { expect, test, type Page } from './fixtures';

interface HeldResponses {
  /** Let the held responses through. */
  readonly release: () => void;
  /** How many matching requests have reached the handler. */
  readonly requests: () => number;
}

/**
 * Hold every response matching `pattern` until `release` is called, counting the
 * requests that reach the handler.
 *
 * **The count is as load-bearing as the hold.** `src/main.tsx` is the dev host's
 * entry path rather than a product URL, and `api/spaces` is a wire path — either
 * can move. A pattern that matches nothing holds nothing, so startup completes
 * before the first assertion and every assertion below it passes against the
 * opened Space instead of the wait: a green run that covers none of what this
 * spec claims. Asserting the handler actually ran, before the hold it owns is
 * released, is what turns that into a failure naming its cause.
 */
const holdResponses = async (page: Page, pattern: string): Promise<HeldResponses> => {
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  let requests = 0;
  await page.route(pattern, async (route) => {
    requests += 1;
    await held;
    await route.continue();
  });
  return { release, requests: () => requests };
};

/**
 * Startup has two waits — the bundle arriving, and the aggregate crossing HTTP
 * — and one view spans both. A test that merely loaded the page would race them
 * both, so this one holds each response until it has asserted what is drawn
 * while that response is outstanding.
 */
test(
  'the startup view spans the bundle and the crossing, and gives way to the Space',
  { tag: '@parity:operational-feedback-startup-pending' },
  async ({ page }) => {
    const bundle = await holdResponses(page, '**/src/main.tsx');
    const aggregate = await holdResponses(page, '**/api/spaces');

    // `commit` rather than `load`: the point of the first assertion is the
    // served HTML, before the module script it is waiting for.
    await page.goto('/', { waitUntil: 'commit' });

    const mark = page.locator('img[src="/infinity-cube-logo.svg"]');
    await expect(page.getByText('Starting…')).toBeVisible();
    await expect(mark).toBeVisible();
    // The static copy carries no spinner, so nothing announces yet — the live
    // region arrives with React.
    await expect(page.getByRole('status')).toHaveCount(0);

    await expect
      .poll(bundle.requests, {
        message: 'no request matched the bundle pattern, so the first wait was never held',
      })
      .toBeGreaterThan(0);
    bundle.release();
    // Every other spec reaches its first assertion after a `load` that already
    // absorbed this host's cold module transform; this one asserted before the
    // script was even requested, so the wait for it is here instead.
    await page.waitForLoadState('load');

    const status = page.getByRole('status');
    await expect(status).toHaveText('Starting…', { timeout: 15_000 });
    await expect(status.locator('img[src="/infinity-cube-logo.svg"]')).toBeVisible();

    await expect
      .poll(aggregate.requests, {
        message: 'no request matched the aggregate pattern, so the second wait was never held',
      })
      .toBeGreaterThan(0);
    aggregate.release();

    await expect(page.getByTestId('space-title')).toBeVisible();
    await expect(page.getByText('Starting…')).toHaveCount(0);
  },
);

/**
 * The startup view is removed by React's first commit into `#root` and by
 * nothing else, so a module script that never evaluates leaves it claiming
 * progress that will never arrive. Aborting the bundle request is that failure
 * at its starkest: the served copy is on screen and nothing is coming to
 * replace it.
 */
test('reports a bundle that never runs, rather than claiming progress forever', async ({
  page,
}) => {
  let requests = 0;
  await page.route('**/src/main.tsx', async (route) => {
    requests += 1;
    await route.abort();
  });

  await page.goto('/');

  expect(
    requests,
    'no request matched the bundle pattern, so the bundle was never aborted',
  ).toBeGreaterThan(0);
  await expect(page.getByText('Application could not start')).toBeVisible();
  await expect(page.getByText('Starting…')).toHaveCount(0);
});

/**
 * The correction above is owed only to a bundle that never runs. A served asset
 * that fails is not that: the module script is still coming, so the wait is
 * still honest and the view must keep saying so. The bundle is held for the
 * assertions, which is what makes the window this covers observable at all —
 * React's commit would otherwise replace the view either way and hide the
 * difference.
 */
test('keeps waiting when a served asset fails, rather than blaming the application', async ({
  page,
}) => {
  const bundle = await holdResponses(page, '**/src/main.tsx');
  let logoRequests = 0;
  await page.route('**/infinity-cube-logo.svg', async (route) => {
    logoRequests += 1;
    await route.abort();
  });

  await page.goto('/', { waitUntil: 'commit' });

  await expect
    .poll(() => logoRequests, {
      message: 'no request matched the logo pattern, so no asset failure was provoked',
    })
    .toBeGreaterThan(0);
  await expect(page.getByText('Starting…')).toBeVisible();
  await expect(page.getByText('Application could not start')).toHaveCount(0);

  bundle.release();
});

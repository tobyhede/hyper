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

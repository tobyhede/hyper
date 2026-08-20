import type { PlaywrightTestConfig } from '@playwright/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Two Playwright configs run in CI — `playwright.config.ts` for the application
 * suite and `playwright.ladle.config.ts` for the catalogue — and they are meant
 * to carry one flake policy between them, so that a reader never has to ask
 * which config a failure came from before knowing what a green run proves.
 *
 * They drifted once already: the Ladle config was written with `retries: 0`,
 * which left `failOnFlakyTests` nothing to act on and made Issue 08's criterion
 * ("CI fails when any Playwright test is flaky even if a diagnostic retry
 * passes") unexercisable rather than met. Nothing but review caught it. This
 * holds the two together.
 *
 * Both configs read `process.env['CI']` at module scope, so each case sets the
 * environment and re-imports rather than trusting a cached module.
 */

const CONFIGS = ['../../playwright.config', '../../playwright.ladle.config'] as const;

const loadPolicies = async () => {
  const loaded = [];
  for (const specifier of CONFIGS) {
    // SAFETY: asserted rather than annotated — a dynamic import through a
    // variable specifier is typed `any`, and annotating the binding would be
    // an unsafe assignment rather than a narrowing. Both config files export
    // a default `PlaywrightTestConfig`, checked by `tsc` at their own
    // declaration site.
    const module = (await import(specifier)) as { default: PlaywrightTestConfig };
    const { forbidOnly, failOnFlakyTests, retries } = module.default;
    loaded.push({ specifier, policy: { forbidOnly, failOnFlakyTests, retries } });
  }
  return loaded;
};

describe('the two Playwright configs share one flake policy', () => {
  const original = process.env['CI'];

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (original === undefined) delete process.env['CI'];
    else process.env['CI'] = original;
  });

  it('agrees on CI', async () => {
    process.env['CI'] = '1';

    const [application, ladle] = await loadPolicies();

    expect(application?.policy).toEqual(ladle?.policy);
    // Asserted as a literal rather than only as equality: two configs that
    // agreed on `retries: 0` would satisfy the comparison above while leaving
    // the criterion with no diagnostic retry to exercise, which is the exact
    // state this test exists to prevent returning to.
    expect(application?.policy).toEqual({
      forbidOnly: true,
      failOnFlakyTests: true,
      retries: 2,
    });
  });

  it('agrees off CI, where a retry would only hide a failing assertion', async () => {
    delete process.env['CI'];

    const [application, ladle] = await loadPolicies();

    expect(application?.policy).toEqual(ladle?.policy);
    expect(application?.policy).toEqual({
      forbidOnly: false,
      failOnFlakyTests: false,
      retries: 0,
    });
  });
});

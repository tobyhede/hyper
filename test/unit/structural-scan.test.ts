import { describe, expect, it } from 'vitest';
import { LIVE_THEME, scannedCssFiles, scannedTsFiles } from '../support/structural-scan';

/**
 * What `test/support/structural-scan.ts` owes every arm of the
 * structural scan before any arm's own rule runs: that the tracked-file
 * listing reaches both source trees at all, so an arm reporting nothing is
 * reporting on something. Its comment masking is held by the fixtures of the
 * arms that spend it.
 */

describe('the scan reaches both source trees', () => {
  it('finds .ts/.tsx and .css files under packages/*/src', () => {
    const tsFiles = scannedTsFiles();
    const cssFiles = scannedCssFiles();
    expect(tsFiles.length).toBeGreaterThan(0);
    expect(cssFiles.length).toBeGreaterThan(0);
    expect(tsFiles).toContain('packages/ui/src/Button.tsx');
    expect(cssFiles).toContain(LIVE_THEME);
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { trackedFiles } from '../support/structural-scan';

/**
 * A kind's stylesheet overrides its surface's at equal specificity, so it wins
 * only by loading after it. Each surface imports its own stylesheet first and
 * then its kinds', and nothing else imports a kind's, so the bundle keeps that
 * order whichever module reaches the surface first.
 */
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const kindsDirectory = 'packages/ui/src/kinds';

/** Each surface, the stylesheet it overrides, and the suffix its kinds' stylesheets carry. */
const SURFACES = [
  {
    module: 'packages/ui/src/CanvasResource.tsx',
    base: './canvas-resource.css',
    suffix: '-canvas.css',
  },
  { module: 'packages/ui/src/Stage.tsx', base: './stage.css', suffix: '-stage.css' },
] as const;

const cssImports = (file: string): readonly string[] =>
  [...readFileSync(join(repoRoot, file), 'utf8').matchAll(/^import '([^']+\.css)';$/gmu)].map(
    ([, specifier]) => specifier ?? '',
  );

const kindStylesheets = readdirSync(join(repoRoot, kindsDirectory)).filter((name) =>
  name.endsWith('.css'),
);

describe('a kind stylesheet loads after the surface it overrides', () => {
  it.each(SURFACES)(
    '$module imports $base before every kind stylesheet',
    ({ module, base, suffix }) => {
      const imports = cssImports(module);
      const kinds = kindStylesheets
        .filter((name) => name.endsWith(suffix))
        .map((name) => `./kinds/${name}`);
      expect(kinds.length).toBeGreaterThan(0);
      for (const kind of kinds) {
        expect(imports.indexOf(base), `${module} imports ${base}`).toBeGreaterThanOrEqual(0);
        expect(imports.indexOf(kind), `${module} imports ${kind} after ${base}`).toBeGreaterThan(
          imports.indexOf(base),
        );
      }
    },
  );

  it('is imported by its surface and nothing else', () => {
    const importers = trackedFiles()
      .filter((file) => /\.(?:tsx?|css)$/u.test(file) && !file.startsWith('test/'))
      .filter((file) => /kinds\/[\w-]+\.css/u.test(readFileSync(join(repoRoot, file), 'utf8')))
      .filter((file) => !file.endsWith('.css'));
    expect(importers.toSorted()).toEqual(SURFACES.map(({ module }) => module).toSorted());
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildUiCatalog, UiCatalogError } from '../../scripts/ui-catalog';

const roots: string[] = [];

const write = (root: string, path: string, content: string): void => {
  const destination = join(root, path);
  mkdirSync(join(destination, '..'), { recursive: true });
  writeFileSync(destination, content);
};

const fixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'hyper-ui-catalog-'));
  roots.push(root);
  write(root, 'packages/ui/src/index.ts', "export { Button } from './Button';");
  write(
    root,
    'packages/app/stories/components/button.stories.tsx',
    "export default { title: 'Components/Button' }; export const Primary = () => null;",
  );
  write(
    root,
    'packages/app/stories/parity-manifest.ts',
    `export const parityClaims = [{ id: 'button-is-operable', storyFile: 'components/button.stories.tsx', storyExport: 'Primary', claim: 'The Button can be operated.' }] as const;`,
  );
  write(
    root,
    'packages/app/ladle-e2e/button.spec.ts',
    `test('story button', { tag: '@parity:button-is-operable' }, async () => undefined);`,
  );
  write(
    root,
    'packages/app/e2e/button.spec.ts',
    `test('application button', { tag: '@parity:button-is-operable' }, async () => undefined);`,
  );
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('UI catalogue', () => {
  it('lists public exports and taxonomy-valid stories deterministically', () => {
    expect(buildUiCatalog(fixture())).toEqual({
      exports: ['Button'],
      stories: ['Components/Button'],
      claims: [
        {
          id: 'button-is-operable',
          storyFile: 'components/button.stories.tsx',
          storyExport: 'Primary',
          claim: 'The Button can be operated.',
          ladle: {
            file: 'packages/app/ladle-e2e/button.spec.ts',
            test: 'story button',
          },
          application: {
            file: 'packages/app/e2e/button.spec.ts',
            test: 'application button',
          },
        },
      ],
    });
  });

  it('rejects a stable story whose title disagrees with its directory', () => {
    const root = fixture();
    write(
      root,
      'packages/app/stories/surfaces/workspace.stories.tsx',
      "export default { title: 'Review/Workspace' };",
    );

    expect(() => buildUiCatalog(root)).toThrowError(UiCatalogError);
    expect(() => buildUiCatalog(root)).toThrowError(/title must start with Surfaces\//);
  });

  it('rejects a stable story without one proof in each Playwright suite', () => {
    const root = fixture();
    write(
      root,
      'packages/app/e2e/button.spec.ts',
      `test('application button', async () => undefined);`,
    );

    expect(() => buildUiCatalog(root)).toThrowError(
      /button-is-operable requires exactly one application test; found 0/,
    );
  });

  it.each(['test.skip', 'test.fixme', 'test.describe.skip'])(
    '%s cannot supply parity evidence',
    (modifier) => {
      const root = fixture();
      const test = `test('application button', { tag: '@parity:button-is-operable' }, async () => undefined);`;
      write(
        root,
        'packages/app/e2e/button.spec.ts',
        modifier === 'test.describe.skip'
          ? `test.describe.skip('excluded', () => { ${test} });`
          : `${modifier}('application button', { tag: '@parity:button-is-operable' }, async () => undefined);`,
      );

      expect(() => buildUiCatalog(root)).toThrowError(
        /parity tag @parity:button-is-operable is excluded/,
      );
    },
  );
});

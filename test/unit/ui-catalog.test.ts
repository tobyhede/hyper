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
    'packages/app/stories/parity-claims.ts',
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

  it('recognizes test.only as valid parity evidence', () => {
    const root = fixture();
    write(
      root,
      'packages/app/e2e/button.spec.ts',
      `test.only('application button', { tag: '@parity:button-is-operable' }, async () => undefined);`,
    );

    const catalog = buildUiCatalog(root);
    expect(catalog.claims[0]?.application).toEqual({
      file: 'packages/app/e2e/button.spec.ts',
      test: 'application button',
    });
  });

  it('recognizes parity evidence nested inside a plain describe block', () => {
    const root = fixture();
    write(
      root,
      'packages/app/e2e/button.spec.ts',
      `test.describe('group', () => { test('application button', { tag: '@parity:button-is-operable' }, async () => undefined); });`,
    );

    const catalog = buildUiCatalog(root);
    expect(catalog.claims[0]?.application).toEqual({
      file: 'packages/app/e2e/button.spec.ts',
      test: 'application button',
    });
  });

  it('accepts a claim exempted from application evidence, and still requires its Ladle evidence', () => {
    const root = fixture();
    write(
      root,
      'packages/app/stories/parity-claims.ts',
      `export const parityClaims = [{ id: 'button-is-operable', storyFile: 'components/button.stories.tsx', storyExport: 'Primary', claim: 'The Button can be operated.', applicationEvidence: 'No production trigger exists.' }] as const;`,
    );
    write(root, 'packages/app/e2e/button.spec.ts', '');

    const catalog = buildUiCatalog(root);
    expect(catalog.claims[0]?.application).toEqual({
      file: '(exempt)',
      test: 'No production trigger exists.',
    });
  });

  it('still rejects an exempted claim missing its Ladle evidence', () => {
    const root = fixture();
    write(
      root,
      'packages/app/stories/parity-claims.ts',
      `export const parityClaims = [{ id: 'button-is-operable', storyFile: 'components/button.stories.tsx', storyExport: 'Primary', claim: 'The Button can be operated.', applicationEvidence: 'No production trigger exists.' }] as const;`,
    );
    write(root, 'packages/app/ladle-e2e/button.spec.ts', '');
    write(root, 'packages/app/e2e/button.spec.ts', '');

    expect(() => buildUiCatalog(root)).toThrowError(
      /button-is-operable requires exactly one Ladle test; found 0/,
    );
  });

  it.each(['', '   '])('rejects %j as an applicationEvidence reason', (reason) => {
    const root = fixture();
    write(
      root,
      'packages/app/stories/parity-claims.ts',
      `export const parityClaims = [{ id: 'button-is-operable', storyFile: 'components/button.stories.tsx', storyExport: 'Primary', claim: 'The Button can be operated.', applicationEvidence: ${JSON.stringify(reason)} }] as const;`,
    );

    expect(() => buildUiCatalog(root)).toThrowError(
      /button-is-operable applicationEvidence must be a non-empty string literal/,
    );
  });

  it('rejects a claim that is both exempted and tagged in an application test', () => {
    const root = fixture();
    write(
      root,
      'packages/app/stories/parity-claims.ts',
      `export const parityClaims = [{ id: 'button-is-operable', storyFile: 'components/button.stories.tsx', storyExport: 'Primary', claim: 'The Button can be operated.', applicationEvidence: 'No production trigger exists.' }] as const;`,
    );

    expect(() => buildUiCatalog(root)).toThrowError(
      /button-is-operable declares applicationEvidence but packages\/app\/e2e\/button\.spec\.ts also tags it/,
    );
  });
});

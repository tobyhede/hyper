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
    "export default { title: 'Components/Button' };",
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
});

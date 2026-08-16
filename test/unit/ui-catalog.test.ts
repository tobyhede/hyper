import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
  write(
    root,
    'packages/ui/tsconfig.json',
    JSON.stringify({
      compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', jsx: 'preserve' },
    }),
  );
  write(
    root,
    'packages/ui/src/index.ts',
    [
      "export { Primitive } from './components/primitive';",
      "export { Facade } from './Facade';",
      "export type { FacadeProps } from './Facade';",
    ].join('\n'),
  );
  write(root, 'packages/ui/src/components/primitive.tsx', 'export const Primitive = 1;');
  write(root, 'packages/ui/src/components/internal.tsx', 'export const internalComponent = 1;');
  write(
    root,
    'packages/ui/src/Facade.tsx',
    "import { internalComponent } from './components/internal'; export const Facade = internalComponent; export interface FacadeProps {}",
  );
  write(
    root,
    'packages/app/stories/components/facade.stories.tsx',
    "export default { title: 'Components/Facade' };",
  );
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('UI catalogue', () => {
  it('classifies direct exports and accepts transitively reachable components', () => {
    expect(buildUiCatalog(fixture())).toEqual({
      primitives: ['Primitive'],
      hyper: ['Facade'],
      stories: ['Components/Facade'],
    });
  });

  it('reports component files orphaned from the public module graph', () => {
    const root = fixture();
    write(root, 'packages/ui/src/components/orphan.tsx', 'export const Orphan = 1;');

    expect(() => buildUiCatalog(root)).toThrowError(/orphan\.tsx is not reachable/);
  });

  it('reports duplicate public names with both source modules', () => {
    const root = fixture();
    write(
      root,
      'packages/ui/src/index.ts',
      [
        "export { Primitive as Shared } from './components/primitive';",
        "export { Facade as Shared } from './Facade';",
      ].join('\n'),
    );

    expect(() => buildUiCatalog(root)).toThrowError(
      /duplicate public export Shared from \.\/components\/primitive and \.\/Facade/,
    );
  });

  it('reports unresolved public modules and mismatched story taxonomy', () => {
    const root = fixture();
    write(root, 'packages/ui/src/index.ts', "export { Missing } from './missing';");
    write(
      root,
      'packages/app/stories/components/facade.stories.tsx',
      "export default { title: 'Surfaces/Facade' };",
    );

    try {
      buildUiCatalog(root);
      throw new Error('Expected catalogue generation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(UiCatalogError);
      expect((error as UiCatalogError).problems.join('\n')).toMatch(
        /Cannot find module '\.\/missing'/,
      );
      expect((error as UiCatalogError).problems.join('\n')).toMatch(
        /title must start with Components\//,
      );
    }
  });
});

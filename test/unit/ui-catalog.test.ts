import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildUiCatalog,
  UiCatalogError,
  type HandRolledStyle,
  type UncataloguedComponent,
} from '../../scripts/ui-catalog';

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
  write(
    root,
    'packages/app/stories/design-system-inventory.ts',
    'export const uncataloguedComponents = [] as const;\nexport const handRolledStyles = [] as const;\n',
  );
  // The check insists these exist rather than treating an absent tree as a clean
  // one, so the fixture has to supply them even where a case does not use them.
  write(root, 'packages/app/src/styles.css', '');
  mkdirSync(join(root, 'packages/react-flow-adapter/src'), { recursive: true });
  mkdirSync(join(root, 'packages/app/stories/support'), { recursive: true });
  return root;
};

/** The two literal lists `design-system-inventory.ts` declares, as source. */
const inventory = (
  uncataloguedComponents: readonly UncataloguedComponent[],
  handRolledStyles: readonly HandRolledStyle[],
): string =>
  `export const uncataloguedComponents = ${JSON.stringify(uncataloguedComponents)} as const;\n` +
  `export const handRolledStyles = ${JSON.stringify(handRolledStyles)} as const;\n`;

/** Every problem one build reports, for a case about how often one is said. */
const problemsOf = (root: string): readonly string[] => {
  try {
    buildUiCatalog(root);
  } catch (error) {
    if (error instanceof UiCatalogError) return error.problems;
    throw error;
  }
  return [];
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
      uncataloguedComponents: [],
      handRolledStyles: [],
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

describe('production component coverage', () => {
  const storyRendering = (specifier: string): string =>
    `import { Thing } from '${specifier}';\nexport default { title: 'Components/Button' };\nexport const Primary = () => Thing;\n`;

  it('reports a production component no stable story renders', () => {
    const root = fixture();
    write(root, 'packages/app/src/components/NewAlias.tsx', 'export const NewAlias = () => null;');

    expect(() => buildUiCatalog(root)).toThrowError(
      /packages\/app\/src\/components\/NewAlias\.tsx is rendered by no stable story/,
    );
  });

  it('follows a relative import out of a story into the component it renders', () => {
    const root = fixture();
    write(root, 'packages/app/src/components/NewAlias.tsx', 'export const Thing = null;');
    write(
      root,
      'packages/app/stories/components/button.stories.tsx',
      storyRendering('../../src/components/NewAlias'),
    );

    expect(buildUiCatalog(root).uncataloguedComponents).toEqual([]);
  });

  it('resolves a subpath import against the package the importing file belongs to', () => {
    const root = fixture();
    // `packages/ui` declares its own `#components/*`, and `sidebar.tsx` uses it
    // to reach `sheet.tsx`. Resolving every `#` specifier under `packages/app`
    // loses those, and the modules they reach look uncatalogued.
    write(
      root,
      'packages/ui/package.json',
      '{"imports":{"#components/*":"./src/components/*.tsx"}}',
    );
    write(root, 'packages/ui/src/index.ts', "export { Thing } from './Sidebar';");
    write(root, 'packages/ui/src/Sidebar.tsx', "export { Thing } from '#components/sheet';");
    write(root, 'packages/ui/src/components/sheet.tsx', 'export const Thing = null;');
    write(
      root,
      'packages/app/stories/components/button.stories.tsx',
      storyRendering('@project/ui'),
    );

    expect(buildUiCatalog(root).uncataloguedComponents).toEqual([]);
  });

  it('resolves a package entry point written as index.tsx', () => {
    const root = fixture();
    write(root, 'packages/react-flow-adapter/src/index.tsx', "export { Thing } from './Node';");
    write(root, 'packages/react-flow-adapter/src/Node.tsx', 'export const Thing = null;');
    write(
      root,
      'packages/app/stories/components/button.stories.tsx',
      storyRendering('@project/react-flow-adapter'),
    );

    expect(buildUiCatalog(root).uncataloguedComponents).toEqual([]);
  });

  it('follows a public package subpath directly to the component it renders', () => {
    const root = fixture();
    write(root, 'packages/ui/src/MarkdownSourceEditor.tsx', 'export const Thing = null;');
    write(
      root,
      'packages/app/stories/components/button.stories.tsx',
      storyRendering('@project/ui/MarkdownSourceEditor'),
    );

    expect(buildUiCatalog(root).uncataloguedComponents).toEqual([]);
  });

  it('resolves a subpath entry declared without a wildcard', () => {
    const root = fixture();
    write(root, 'packages/app/package.json', '{"imports":{"#shell":"./src/Shell.tsx"}}');
    write(root, 'packages/app/src/Shell.tsx', 'export const Thing = null;');
    write(root, 'packages/app/stories/components/button.stories.tsx', storyRendering('#shell'));

    expect(buildUiCatalog(root).uncataloguedComponents).toEqual([]);
  });

  it('resolves a wildcard subpath entry listed after an exact alias', () => {
    const root = fixture();
    // An exact alias matches only itself, so a specifier it does not match has
    // to fall through to the later entries rather than end the search.
    write(
      root,
      'packages/app/package.json',
      '{"imports":{"#shell":"./src/Shell.tsx","#components/*":"./src/components/*.tsx"}}',
    );
    write(root, 'packages/app/src/Shell.tsx', 'export const Shell = null;');
    write(root, 'packages/app/src/components/NewAlias.tsx', 'export const Thing = null;');
    write(
      root,
      'packages/app/stories/components/button.stories.tsx',
      `import { Thing } from '#components/NewAlias';\nimport { Shell } from '#shell';\nexport default { title: 'Components/Button' };\nexport const Primary = () => [Thing, Shell];\n`,
    );

    expect(buildUiCatalog(root).uncataloguedComponents).toEqual([]);
  });

  it('follows the package subpath imports declared in packages/app/package.json', () => {
    const root = fixture();
    write(
      root,
      'packages/app/package.json',
      '{"imports":{"#components/*":"./src/components/*.tsx"}}',
    );
    write(root, 'packages/app/src/components/NewAlias.tsx', 'export const Thing = null;');
    write(
      root,
      'packages/app/stories/components/button.stories.tsx',
      storyRendering('#components/NewAlias'),
    );

    expect(buildUiCatalog(root).uncataloguedComponents).toEqual([]);
  });

  it('follows only the names a story imports through a package barrel', () => {
    const root = fixture();
    write(
      root,
      'packages/ui/src/index.ts',
      "export { Thing } from './Rendered';\nexport { Other } from './Unrendered';",
    );
    write(root, 'packages/ui/src/Rendered.tsx', 'export const Thing = null;');
    write(root, 'packages/ui/src/Unrendered.tsx', 'export const Other = null;');
    write(
      root,
      'packages/app/stories/components/button.stories.tsx',
      storyRendering('@project/ui'),
    );

    expect(() => buildUiCatalog(root)).toThrowError(
      /packages\/ui\/src\/Unrendered\.tsx is rendered by no stable story/,
    );
  });

  it.each([
    ["import type { Thing } from '../../src/components/NewAlias';", 'a type-only declaration'],
    ["import { type Thing } from '../../src/components/NewAlias';", 'a type-only specifier'],
  ])('does not treat %s as rendering the module it names', (statement) => {
    const root = fixture();
    write(root, 'packages/app/src/components/NewAlias.tsx', 'export type Thing = string;');
    write(
      root,
      'packages/app/stories/components/button.stories.tsx',
      `${statement}\nexport default { title: 'Components/Button' };\nexport const Primary = () => null;\n`,
    );

    expect(() => buildUiCatalog(root)).toThrowError(
      /packages\/app\/src\/components\/NewAlias\.tsx is rendered by no stable story/,
    );
  });

  it('does not let a namespace import through a barrel catalogue the whole package', () => {
    const root = fixture();
    write(
      root,
      'packages/ui/src/index.ts',
      "export { Thing } from './Rendered';\nexport { Other } from './Unrendered';",
    );
    write(root, 'packages/ui/src/Rendered.tsx', 'export const Thing = null;');
    write(root, 'packages/ui/src/Unrendered.tsx', 'export const Other = null;');
    write(
      root,
      'packages/app/stories/components/button.stories.tsx',
      "import * as UI from '@project/ui';\nexport default { title: 'Components/Button' };\nexport const Primary = () => UI.Thing;\n",
    );

    expect(() => buildUiCatalog(root)).toThrowError(
      /packages\/ui\/src\/Unrendered\.tsx is rendered by no stable story/,
    );
  });

  it('resolves a re-export alias by the name consumers import, not the local one', () => {
    const root = fixture();
    // `packages/ui/src/index.ts` really does this: `CardContent` from one module
    // and `CardContent as CardSection` from another. Reading `propertyName` on an
    // export specifier takes the local name, so importing `CardContent` matched
    // the aliased line too and catalogued a module the story never rendered.
    write(
      root,
      'packages/ui/src/index.ts',
      "export { Thing } from './Rendered';\nexport { Thing as Aliased } from './Unrendered';",
    );
    write(root, 'packages/ui/src/Rendered.tsx', 'export const Thing = null;');
    write(root, 'packages/ui/src/Unrendered.tsx', 'export const Thing = null;');
    write(
      root,
      'packages/app/stories/components/button.stories.tsx',
      storyRendering('@project/ui'),
    );

    expect(() => buildUiCatalog(root)).toThrowError(
      /packages\/ui\/src\/Unrendered\.tsx is rendered by no stable story/,
    );
  });

  it('follows an aliased re-export when the story imports the alias', () => {
    const root = fixture();
    write(root, 'packages/ui/src/index.ts', "export { Thing as Aliased } from './Rendered';");
    write(root, 'packages/ui/src/Rendered.tsx', 'export const Thing = null;');
    write(
      root,
      'packages/app/stories/components/button.stories.tsx',
      "import { Aliased } from '@project/ui';\nexport default { title: 'Components/Button' };\nexport const Primary = () => Aliased;\n",
    );

    expect(buildUiCatalog(root).uncataloguedComponents).toEqual([]);
  });

  it('keeps a default import that sits beside a type-only specifier', () => {
    const root = fixture();
    write(root, 'packages/app/src/components/NewAlias.tsx', 'export default null;');
    write(
      root,
      'packages/app/stories/components/button.stories.tsx',
      "import Thing, { type Props } from '../../src/components/NewAlias';\nexport default { title: 'Components/Button' };\nexport const Primary = () => Thing as Props;\n",
    );

    expect(buildUiCatalog(root).uncataloguedComponents).toEqual([]);
  });

  it('rejects a recorded module that is not a production component at all', () => {
    const root = fixture();
    write(
      root,
      'packages/app/stories/design-system-inventory.ts',
      // Exists, but is not a `.tsx` under a production UI root, so neither arm
      // of the coverage check can ever reach it.
      inventory([{ module: 'packages/ui/src/index.ts', reason: 'Not a component.' }], []),
    );

    expect(() => buildUiCatalog(root)).toThrowError(
      /packages\/ui\/src\/index\.ts is not a production component this check scans/,
    );
  });

  it('rejects the same module recorded twice', () => {
    const root = fixture();
    write(root, 'packages/app/src/components/NewAlias.tsx', 'export const Thing = null;');
    write(
      root,
      'packages/app/stories/design-system-inventory.ts',
      inventory(
        [
          { module: 'packages/app/src/components/NewAlias.tsx', reason: 'First reason.' },
          { module: 'packages/app/src/components/NewAlias.tsx', reason: 'Second reason.' },
        ],
        [],
      ),
    );

    expect(() => buildUiCatalog(root)).toThrowError(
      /packages\/app\/src\/components\/NewAlias\.tsx is recorded twice/,
    );
  });

  it('reads the exported list, not a same-named local declaration above it', () => {
    const root = fixture();
    write(root, 'packages/app/src/components/NewAlias.tsx', 'export const Thing = null;');
    write(
      root,
      'packages/app/stories/design-system-inventory.ts',
      `const uncataloguedComponents = [{ module: 'packages/app/src/components/NewAlias.tsx', reason: 'Decoy.' }] as const;\nvoid uncataloguedComponents;\nexport const handRolledStyles = [] as const;\n`,
    );

    expect(() => buildUiCatalog(root)).toThrowError(
      /must declare a literal uncataloguedComponents/,
    );
  });

  it('reports a missing inventory module once, not once per list it declares', () => {
    const root = fixture();
    rmSync(join(root, 'packages/app/stories/design-system-inventory.ts'), { force: true });

    expect(problemsOf(root)).toEqual([
      'packages/app/stories/design-system-inventory.ts is missing',
    ]);
  });

  it('takes a recorded reason in place of a story, and reports it', () => {
    const root = fixture();
    write(root, 'packages/app/src/components/NewAlias.tsx', 'export const NewAlias = () => null;');
    write(
      root,
      'packages/app/stories/design-system-inventory.ts',
      inventory(
        [{ module: 'packages/app/src/components/NewAlias.tsx', reason: 'Retired by ADR 0058.' }],
        [],
      ),
    );

    expect(buildUiCatalog(root).uncataloguedComponents).toEqual([
      { module: 'packages/app/src/components/NewAlias.tsx', reason: 'Retired by ADR 0058.' },
    ]);
  });

  it('rejects a recorded reason for a component a stable story does render', () => {
    const root = fixture();
    write(root, 'packages/app/src/components/NewAlias.tsx', 'export const Thing = null;');
    write(
      root,
      'packages/app/stories/components/button.stories.tsx',
      storyRendering('../../src/components/NewAlias'),
    );
    write(
      root,
      'packages/app/stories/design-system-inventory.ts',
      inventory(
        [{ module: 'packages/app/src/components/NewAlias.tsx', reason: 'Retired by ADR 0058.' }],
        [],
      ),
    );

    expect(() => buildUiCatalog(root)).toThrowError(
      /packages\/app\/src\/components\/NewAlias\.tsx is rendered by a stable story/,
    );
  });

  it('rejects a recorded reason for a component that no longer exists', () => {
    const root = fixture();
    write(
      root,
      'packages/app/stories/design-system-inventory.ts',
      inventory([{ module: 'packages/app/src/components/Gone.tsx', reason: 'Deleted.' }], []),
    );

    expect(() => buildUiCatalog(root)).toThrowError(
      /packages\/app\/src\/components\/Gone\.tsx does not exist/,
    );
  });

  it('does not ask a review-only story to catalogue anything', () => {
    const root = fixture();
    write(root, 'packages/app/src/components/NewAlias.tsx', 'export const Thing = null;');
    write(
      root,
      'packages/app/stories/review/proposal.stories.tsx',
      `import { Thing } from '../../src/components/NewAlias';\nexport default { title: 'Review/Proposal' };\nexport const Draft = () => Thing;\n`,
    );

    expect(() => buildUiCatalog(root)).toThrowError(
      /packages\/app\/src\/components\/NewAlias\.tsx is rendered by no stable story/,
    );
  });
});

describe('hand-rolled application styles', () => {
  it('requires a recorded reason for every block the stylesheet declares', () => {
    const root = fixture();
    write(root, 'packages/app/src/styles.css', '.btn--primary { color: red; }');
    write(
      root,
      'packages/app/src/App.tsx',
      'export const App = () => <div className="btn--primary" />;',
    );
    write(
      root,
      'packages/app/stories/design-system-inventory.ts',
      inventory([{ module: 'packages/app/src/App.tsx', reason: 'Composition root.' }], []),
    );

    // The unrecorded block is the whole complaint: the class is named where a
    // class is written, and the module naming it is accounted for.
    expect(problemsOf(root)).toEqual([
      'packages/app/src/styles.css declares .btn--primary, whose block btn is not recorded — build it from @project/ui, or record why in packages/app/stories/design-system-inventory.ts',
    ]);
  });

  it('reports a recorded block the stylesheet no longer declares', () => {
    const root = fixture();
    write(root, 'packages/app/src/styles.css', '');
    write(
      root,
      'packages/app/stories/design-system-inventory.ts',
      inventory([], [{ block: 'btn', reason: 'React Flow geometry.' }]),
    );

    expect(() => buildUiCatalog(root)).toThrowError(
      /hand-rolled style block btn is recorded but packages\/app\/src\/styles\.css declares no rule/,
    );
  });

  it('reports a rule no production module names', () => {
    const root = fixture();
    write(root, 'packages/app/src/styles.css', '.btn { color: red; }');
    write(
      root,
      'packages/app/stories/design-system-inventory.ts',
      inventory([], [{ block: 'btn', reason: 'React Flow geometry.' }]),
    );

    expect(() => buildUiCatalog(root)).toThrowError(
      /packages\/app\/src\/styles\.css declares \.btn, which no production module names/,
    );
  });

  it('counts a class a production module builds by interpolation as named', () => {
    const root = fixture();
    write(root, 'packages/app/src/styles.css', '.handle--source { opacity: 0; }');
    write(
      root,
      'packages/app/src/App.tsx',
      'export const App = (role: string) => <div className={`handle--${role}`} />;',
    );
    write(
      root,
      'packages/app/stories/design-system-inventory.ts',
      inventory(
        [{ module: 'packages/app/src/App.tsx', reason: 'Composition root.' }],
        [{ block: 'handle', reason: 'React Flow handle geometry.' }],
      ),
    );

    expect(() => buildUiCatalog(root)).not.toThrow();
  });

  it('does not take a punctuation stem as naming every class beneath it', () => {
    const root = fixture();
    write(root, 'packages/app/src/styles.css', '.-unused { color: red; }');
    // A class built from two interpolations leaves a lone `-` as its middle
    // fragment, and a stem of `-` would call every class beneath it named.
    write(
      root,
      'packages/app/src/App.tsx',
      'export const App = (x: string, y: string) => <div className={`${x}-${y}`} />;',
    );
    write(
      root,
      'packages/app/stories/design-system-inventory.ts',
      inventory(
        [{ module: 'packages/app/src/App.tsx', reason: 'Composition root.' }],
        [{ block: '-unused', reason: 'React Flow geometry.' }],
      ),
    );

    expect(() => buildUiCatalog(root)).toThrowError(
      /packages\/app\/src\/styles\.css declares \.-unused, which no production module names/,
    );
  });

  it('does not ask production to name a class React Flow itself emits', () => {
    const root = fixture();
    write(root, 'packages/app/src/styles.css', '.react-flow__handle { border: 0; }');
    write(
      root,
      'packages/app/stories/design-system-inventory.ts',
      inventory([], [{ block: 'react-flow', reason: 'React Flow integration styling.' }]),
    );

    expect(() => buildUiCatalog(root)).not.toThrow();
  });

  it.each([
    ['packages/app/src/styles.css', /packages\/app\/src\/styles\.css is missing/],
    ['packages/react-flow-adapter/src', /packages\/react-flow-adapter\/src is missing/],
  ])('refuses to pass quietly when %s has gone', (path, expected) => {
    const root = fixture();
    rmSync(join(root, path), { recursive: true, force: true });

    expect(() => buildUiCatalog(root)).toThrowError(expected);
  });

  it('sees a rule nested inside an at-rule', () => {
    const root = fixture();
    write(
      root,
      'packages/app/src/styles.css',
      '@media (max-width: 40rem) {\n  .nested { color: red; }\n}\n',
    );

    expect(() => buildUiCatalog(root)).toThrowError(
      /styles\.css declares \.nested, whose block nested is not recorded/,
    );
  });

  it('keeps a recorded block that only appears inside an at-rule', () => {
    const root = fixture();
    write(
      root,
      'packages/app/src/styles.css',
      '@media (max-width: 40rem) {\n  .nested { color: red; }\n}\n',
    );
    write(root, 'packages/app/src/App.tsx', 'export const App = () => <div className="nested" />;');
    write(
      root,
      'packages/app/stories/design-system-inventory.ts',
      inventory(
        [{ module: 'packages/app/src/App.tsx', reason: 'Composition root.' }],
        [{ block: 'nested', reason: 'React Flow breakpoint geometry.' }],
      ),
    );

    expect(() => buildUiCatalog(root)).not.toThrow();
  });

  it('does not read a file extension in an at-rule prelude as a class', () => {
    const root = fixture();
    write(root, 'packages/app/src/styles.css', "@import url('./reset.css');\n");

    expect(buildUiCatalog(root).handRolledStyles).toEqual([]);
  });

  it.each([
    ['[data-card-search-combobox]', 'data-card-search-combobox'],
    ['#root', 'root'],
    ['html,\nbody,\n#root', 'root'],
    ['*', '*'],
    ['body', 'body'],
    ['main > div', 'main'],
  ])('requires a reason for the class-less rule %j, keyed by %j', (selector, subject) => {
    const root = fixture();
    write(root, 'packages/app/src/styles.css', `${selector} { border: 0; }\n`);

    expect(() => buildUiCatalog(root)).toThrowError(
      `styles.css declares a rule for ${subject}, which is not recorded`,
    );
  });

  it('does not count a domain string that merely spells a class name', () => {
    const root = fixture();
    write(root, 'packages/app/src/styles.css', '.card { color: red; }');
    // React Flow's node type, an Edge drop target, a refusal code — none of these
    // is a class name, and reading every string literal made them look like one.
    write(
      root,
      'packages/app/src/App.tsx',
      "export const App = () => ({ kind: 'card', type: 'card' });",
    );
    write(
      root,
      'packages/app/stories/design-system-inventory.ts',
      inventory(
        [{ module: 'packages/app/src/App.tsx', reason: 'Composition root.' }],
        [{ block: 'card', reason: 'React Flow card geometry.' }],
      ),
    );

    expect(() => buildUiCatalog(root)).toThrowError(
      /styles\.css declares \.card, which no production module names/,
    );
  });

  it('counts a class named through className, a class property or cn()', () => {
    const root = fixture();
    write(
      root,
      'packages/app/src/styles.css',
      '.one {color:red} .two {color:red} .three {color:red}',
    );
    write(
      root,
      'packages/app/src/App.tsx',
      "import { cn } from '@project/ui';\nexport const App = () => <div className=\"one\" data-x={{ className: 'two' }}>{cn('three')}</div>;",
    );
    write(
      root,
      'packages/app/stories/design-system-inventory.ts',
      inventory(
        [{ module: 'packages/app/src/App.tsx', reason: 'Composition root.' }],
        [
          { block: 'one', reason: 'React Flow geometry.' },
          { block: 'two', reason: 'React Flow geometry.' },
          { block: 'three', reason: 'React Flow geometry.' },
        ],
      ),
    );

    expect(() => buildUiCatalog(root)).not.toThrow();
  });

  it('does not read a class name out of a comment', () => {
    const root = fixture();
    write(root, 'packages/app/src/styles.css', '/* .btn is gone; see .card-pane */\n');

    expect(buildUiCatalog(root).handRolledStyles).toEqual([]);
  });
});

describe('story support harnesses', () => {
  it('rejects a support stylesheet rule that is not catalogue furniture', () => {
    const root = fixture();
    write(root, 'packages/app/stories/support/inventory.css', '.card-pane__panel { width: 10px; }');

    expect(() => buildUiCatalog(root)).toThrowError(
      /packages\/app\/stories\/support\/inventory\.css declares \.card-pane__panel, which is not catalogue furniture/,
    );
  });

  it('accepts catalogue furniture under the inv- prefix', () => {
    const root = fixture();
    write(root, 'packages/app/stories/support/inventory.css', '.inv-sheet { padding: 1px; }');

    expect(() => buildUiCatalog(root)).not.toThrow();
  });

  it('rejects a support harness that names a production class instead of rendering its owner', () => {
    const root = fixture();
    write(root, 'packages/app/src/styles.css', '.card-pane { inset: 0; }');
    write(
      root,
      'packages/app/src/App.tsx',
      'export const App = () => <div className="card-pane" />;',
    );
    write(
      root,
      'packages/app/stories/design-system-inventory.ts',
      inventory(
        [{ module: 'packages/app/src/App.tsx', reason: 'Composition root.' }],
        [{ block: 'card-pane', reason: 'The pane React Flow is covered by.' }],
      ),
    );
    write(
      root,
      'packages/app/stories/support/Facsimile.tsx',
      'export const Facsimile = () => <div className="card-pane" />;',
    );

    // The reproduction is the whole complaint: production really does name the
    // class, so the rule is live and the harness is copying a real surface.
    expect(problemsOf(root)).toEqual([
      'packages/app/stories/support/Facsimile.tsx names the production class card-pane — render the production component instead of reproducing it (ADR 0052)',
    ]);
  });
});

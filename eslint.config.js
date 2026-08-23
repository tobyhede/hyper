import { builtinModules } from 'node:module';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

/** Render-layer libraries: they live in `react-flow-adapter` and nowhere below
 *  it. ELK's presence here is the point of ADR 0014 — it is one strategy among
 *  several, not the thing "layout" means, so `graph` must not reach for it. */
const RENDER_ONLY = [
  { name: '@xyflow/react', message: 'React Flow lives in @project/react-flow-adapter only.' },
  { name: 'elkjs', message: 'elkjs lives in @project/react-flow-adapter only.' },
];

/** React itself, barred from the domain packages. `ui` is exempt: it is React
 *  components by definition. */
const REACT = [
  { name: 'react', message: 'Domain logic stays out of React (AGENTS.md).' },
  { name: 'react-dom', message: 'Domain logic stays out of React (AGENTS.md).' },
];

/**
 * Climbing out of a package by relative path, which is how a boundary gets
 * crossed without ever naming `@project/*` — `packages/core/src/x.ts` reaching
 * `../../app/src/store` typechecked and linted clean, and dragged in a
 * dependency `core` does not declare.
 *
 * `../../` from `packages/<pkg>/src` lands in `packages/`, and nothing legal is
 * up there: a package's own files are all at or below `src`. One `../` is left
 * alone so a file in a subdirectory can still reach its sibling.
 */
const ESCAPE_PATTERN = {
  group: ['../../*', '../../**'],
  message:
    'Relative import climbs out of the package. Depend on it properly via @project/* — or do not depend on it (AGENTS.md).',
};

/** `paths` and `patterns` must each be homogeneous — all strings or all objects
 *  — so the render-layer bans are restated as groups to sit beside the escape
 *  pattern. Both spellings are needed: a `paths` entry for `elkjs` does not
 *  match `elkjs/lib/elk.bundled.js`, which is how it is actually imported. */
const RENDER_ONLY_PATTERN = {
  group: ['elkjs/*', '@xyflow/*'],
  message: 'React Flow and elkjs live in @project/react-flow-adapter only.',
};

const REACT_DOM_PATTERN = {
  group: ['react-dom/*'],
  message: 'Domain logic stays out of React (AGENTS.md).',
};

const UI_IMPLEMENTATION_MESSAGE =
  'Application and adapter UI must use the public @project/ui surface. Add or compose the capability there rather than importing its implementation dependency directly.';

const UI_IMPLEMENTATION_DEPENDENCIES = ['@base-ui/react', 'cmdk', 'lucide-react'].map((name) => ({
  name,
  message: UI_IMPLEMENTATION_MESSAGE,
}));

const UI_IMPLEMENTATION_PATTERN = {
  group: ['@base-ui/react/*', 'cmdk/*', 'lucide-react/*', '@project/ui/*'],
  message: UI_IMPLEMENTATION_MESSAGE,
};

/** One exported specialist-widget entry is a deliberate application split
 * point: keeping CodeMirror behind the root barrel puts its entire editor stack
 * in the initial bundle. It remains owned by and imported from `@project/ui`;
 * the adapter receives no exception, and every other UI subpath stays barred. */
const APP_UI_IMPLEMENTATION_PATTERN = {
  group: [
    '@base-ui/react/*',
    'cmdk/*',
    'lucide-react/*',
    '@project/ui/*',
    '!@project/ui/MarkdownSourceEditor',
  ],
  message: UI_IMPLEMENTATION_MESSAGE,
};

/**
 * Node builtins, barred from the portable Fetch module. `node:fs` and a bare
 * `fs` are the same import, and ESLint matches specifiers literally, so a
 * `node:*` group alone leaves the older spelling open — hence both a name list
 * and the subpath groups built from it below.
 *
 * The compiler rejects these too: `tsconfig.base.json` sets `"types": []`, so
 * `@types/node` is never loaded and a bare `fs` fails with TS2591. That message
 * suggests *installing* the types, which is the opposite of what this package
 * wants, and it only surfaces in the per-package typecheck — the usual reason
 * both enforcement layers exist (AGENTS.md).
 *
 * The browserify shims published under these same bare names (`path`, `crypto`,
 * `stream`, …) are Node's API surface too, so catching them is correct.
 *
 * Derived from Node's own list rather than hand-maintained. The hand-written
 * version had drifted — `async_hooks`, `constants`, `domain`, `sea`, `sqlite`,
 * `sys`, `test`, `trace_events`, `wasi` and every `_`-prefixed internal were
 * absent, so the portable package could have imported any of them with lint
 * green. `builtinModules` mixes bare names, `node:`-prefixed entries and
 * subpaths, so each is reduced to its base name; the `${name}/*` groups below
 * then re-cover the subpaths that were stripped.
 * `test/unit/http-node-builtin-restrictions.test.ts` pins the coverage.
 */
const NODE_BUILTIN_NAMES = [
  ...new Set(builtinModules.map((name) => name.replace(/^node:/, '').split('/')[0])),
].sort();

const NODE_MESSAGE = '@project/http uses the portable Fetch interface, not Node APIs.';

const NODE_BUILTINS = NODE_BUILTIN_NAMES.map((name) => ({ name, message: NODE_MESSAGE }));

const NODE_BUILTIN_PATTERN = {
  group: ['node:*', ...NODE_BUILTIN_NAMES.map((name) => `${name}/*`)],
  message: NODE_MESSAGE,
};

/**
 * The mirror of ESCAPE_PATTERN, for code *outside* `packages/`. Server code and
 * root-level tests reach a workspace package by `@project/*` like everything
 * else; a relative path into its `src/` resolves a module the package never
 * exported, so its public surface stops meaning anything. `src/http` reached
 * `../../packages/persistence/src/http-protocol` and typecheck stayed green.
 *
 * The `packages/app` exemption is scoped to *tests*, because the reason for it
 * is a test's reason: the app is the composition layer and publishes no
 * `@project/*` entry, so a root test has no other way in. Server code has no
 * such excuse — `src/` runs the persistence runtime and must never reach into
 * the browser composition layer — so it gets the pattern without the exemption.
 */
const packageInternalsPattern = (exemptApp) => ({
  // `group` is matched with gitignore semantics (ESLint uses `ignore`, not
  // minimatch), so `**` crosses the leading `../..` and `!` negates — but
  // `{a,b}` brace expansion silently matches nothing. Don't write braces here.
  group: exemptApp ? ['**/packages/*/src/**', '!**/packages/app/src/**'] : ['**/packages/*/src/**'],
  message:
    'Reaches past a package public surface. Import from @project/* — and export it from the package index if it is missing (AGENTS.md).',
});

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-http/**',
      // `ladle build` output is gitignored, but flat ESLint config does not
      // read `.gitignore` and would otherwise lint the generated bundles.
      'packages/app/build/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/coverage/**',
      '**/.tanstack/**',
      // StrykerJS campaign state, root-anchored because that is the only place
      // it is written. `.stryker-tmp/` holds a *complete repo copy* per sandbox,
      // `tsconfig.json` included, and `cleanTempDir` removes it only after a
      // successful run — so every crash leaves one behind, and `stryker.conf.mjs`
      // documents two crash modes. Linting into one hits exactly the
      // multiple-candidate-TSConfigRootDirs failure described under `.worktrees/`
      // below. Gitignored too, which flat config does not read.
      '.stryker-tmp/**',
      'reports/**',
      // Throwaway local working dirs — spikes, issue tracker, tool state.
      '**/.scratch/**',
      '**/.serena/**',
      // Agent tooling, gitignored alongside the two above. `.claude/worktrees/`
      // and `.worktrees/` hold *real git worktrees on other branches*, so
      // without this `eslint .` walks into them and `pnpm verify` fails here on
      // code you are not working on — and every warning is reported twice, once
      // per checkout. Worse, each checkout carries its own `tsconfig.json`, so
      // `projectService` sees several candidate roots, fails to pick one, and
      // reports a parse error for *every file in the repository*; the programs
      // it holds open meanwhile exhaust the default 4GB heap first, so the
      // symptom is an OOM crash rather than that error.
      //
      // Both paths are load-bearing: worktrees were created under `.claude/`
      // and are now created under `.worktrees/`, and ignoring one fixes only
      // that one.
      //
      // Flat config does not read `.gitignore`; this is the same class of bug
      // as the `spike.html` incident, where a gitignored file broke a tool that
      // does not consult `.gitignore` either. Prettier honours it, hence the
      // separate entry in `.prettierignore`.
      '**/.claude/**',
      '**/.agents/**',
      '**/.worktrees/**',
      // Prisma Next owns these emitted declarations. They are consumed by
      // typecheck but are not repository-authored lint targets.
      '**/src/prisma/contract.d.ts',
      '**/migrations/**/end-contract.d.ts',
      '**/migrations/**/start-contract.d.ts',
      // Vendored anti-slop Oxlint plugin (.scratch/anti-slop/). Third-party
      // source at a pinned commit, not repository-authored — not part of any
      // tsconfig project, and not ours to reformat or re-lint.
      'tools/oxlint/anti-slop/**',
      // Typing fixtures (ADR 0062). Half of them are *meant* to fail, so the
      // ordinary run must not see them. `test/unit/typing-fixtures.test.ts`
      // reaches them deliberately with `--no-ignore` and asserts the outcome,
      // which is the only place they should ever be linted.
      'tools/typing-fixtures/**',
    ],
  },
  js.configs.recommended,
  // Type-aware linting: the strict + stylistic presets, which need type
  // information from the project. `projectService` resolves each file to its
  // owning tsconfig automatically (the monorepo's per-package configs and the
  // root tsconfig.json that includes src/test/e2e).
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      // Numbers stringify unambiguously; interpolating them is not a bug.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // `() => set({...})` (Zustand actions, React handlers) is idiomatic; only
      // flag confusing void returns in non-shorthand positions.
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      // The codebase deliberately mixes `type` (RF-data shapes needing an index
      // signature to satisfy `Record<string, unknown>`) and `interface` (option
      // bags). Enforcing one over the other would break that distinction.
      '@typescript-eslint/consistent-type-definitions': 'off',
      // ADR 0062. The assertions already in the tree were examined in a reviewed
      // pass and stand on their `SAFETY:` comments; what has no gate is the next
      // one, because a comment requirement is satisfied by prose and prose is the
      // cheapest thing an agent produces. The committed suppressions baseline
      // records the existing sites and `--prune-suppressions` keeps the ceiling
      // falling, so this caps the count while the anti-slop comment rule — which
      // is unchanged and still applies to every surviving assertion — demands the
      // reason. Two rules, two jobs; weakening either loses one of them.
      '@typescript-eslint/no-unsafe-type-assertion': 'error',
      // Adding a variant to a discriminated union should identify every
      // incomplete consumer. A `default:` branch that silently absorbs a new
      // domain variant is exactly the failure this prevents, so it earns no
      // exemption: `AuthoringRefusal` (ADR 0057) is a union whose whole value is
      // that a new refusal code changes the interface deliberately.
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        {
          allowDefaultCaseForExhaustiveSwitch: false,
          considerDefaultExhaustiveForUnions: false,
          requireDefaultForNonUnion: false,
        },
      ],
    },
  },
  {
    files: ['packages/app/src/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['migrations/**/migration.ts'],
    rules: {
      // Prisma Next renders this module-level self-emit bookend. It owns the
      // call shape, and generated migration sources must not be patched.
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  // Tests assert presence with `find(...)!`; a wrong assumption throws and fails
  // the test anyway. Production code stays free of non-null assertions.
  {
    files: ['**/test/**', '**/e2e/**', '**/*.{test,spec}.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  // The package boundaries AGENTS.md calls "hard rules", enforced rather than
  // described. They held by habit until now: `packages/core` could import
  // `@xyflow/react`, or React, and every check stayed green.
  //
  // Stated as *which packages may not*, deliberately. The repo-wide reading —
  // "nothing outside react-flow-adapter imports React Flow" — is already false:
  // `packages/app` imports `@xyflow/react` in five files and legitimately so,
  // being the composition layer. What is actually true is that the domain and
  // the reusable UI stay clear of it.
  //
  // `patterns` is load-bearing next to `paths`: a `paths` entry for `elkjs`
  // does not match `elkjs/lib/elk.bundled.js`, which is how it is really
  // imported. The type layer (`rootDir` + narrowed `paths` in each package's
  // tsconfig) catches what this cannot — relative escapes like `../../app/src`.
  //
  // Every package gets the escape pattern; the domain packages get the library
  // bans on top. A later `files` block wins outright for a given rule, so each
  // zone restates what it inherits rather than adding to it.
  {
    files: ['packages/*/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [ESCAPE_PATTERN] }],
    },
  },
  {
    files: ['packages/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: UI_IMPLEMENTATION_DEPENDENCIES,
          patterns: [ESCAPE_PATTERN, APP_UI_IMPLEMENTATION_PATTERN],
        },
      ],
    },
  },
  {
    files: ['packages/react-flow-adapter/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: UI_IMPLEMENTATION_DEPENDENCIES,
          patterns: [ESCAPE_PATTERN, UI_IMPLEMENTATION_PATTERN],
        },
      ],
    },
  },
  {
    files: ['packages/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: RENDER_ONLY, patterns: [ESCAPE_PATTERN, RENDER_ONLY_PATTERN] },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [packageInternalsPattern(false)] }],
    },
  },
  {
    files: ['test/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [packageInternalsPattern(true)] }],
    },
  },
  {
    files: ['packages/{core,graph,http,persistence}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [...RENDER_ONLY, ...REACT],
          patterns: [ESCAPE_PATTERN, RENDER_ONLY_PATTERN, REACT_DOM_PATTERN],
        },
      ],
    },
  },
  {
    files: ['packages/http/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...RENDER_ONLY,
            ...REACT,
            ...NODE_BUILTINS,
            { name: 'vite', message: '@project/http is independent of Vite hosts.' },
            { name: '@project/app', message: '@project/http is independent of app composition.' },
            { name: 'pg', message: '@project/http is independent of PostgreSQL.' },
            { name: 'postgres', message: '@project/http is independent of PostgreSQL.' },
          ],
          patterns: [
            ESCAPE_PATTERN,
            RENDER_ONLY_PATTERN,
            REACT_DOM_PATTERN,
            NODE_BUILTIN_PATTERN,
            {
              group: ['vite/*', '@project/app/*'],
              message: '@project/http is independent of Vite and app composition.',
            },
            {
              group: ['@prisma-next/*'],
              message: '@project/http depends on its repository interface, not PostgreSQL.',
            },
          ],
        },
      ],
    },
  },
  // Vite loads these in Node and externalizes bare specifiers, so a `@project/*`
  // import hands *Node* the workspace TypeScript — whose extensionless relative
  // imports its ESM resolver rejects. The config then fails to load at all and
  // the dev server will not start, which is why this is worth a rule: the
  // symptom is a broken server, not a type error.
  {
    files: ['packages/*/vite*.ts', '*.config.ts', 'packages/*/*.config.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@project/*'],
              message:
                'Vite externalizes bare specifiers and hands Node raw TS — import by relative path (AGENTS.md).',
            },
          ],
        },
      ],
      // These files sit at a package root and reach a sibling package by
      // relative path on purpose, which is the one legitimate escape.
      // `http-server-build.config.ts` aliases `../core/src/index.ts` for exactly
      // the reason the rule above exists.
    },
  },
  // Config files run as plain JS — no type information to check them against.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);

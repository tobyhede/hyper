import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/.tanstack/**',
      // Throwaway local working dirs — spikes, issue tracker, tool state.
      '**/.scratch/**',
      '**/.serena/**',
      // Agent tooling, gitignored alongside the two above. `.claude/worktrees/`
      // holds *real git worktrees on other branches*, so without this `eslint .`
      // walks into them and `pnpm verify` fails here on code you are not
      // working on — and every warning is reported twice, once per checkout.
      //
      // Flat config does not read `.gitignore`; this is the same class of bug
      // as the `spike.html` incident, where a gitignored file broke a tool that
      // does not consult `.gitignore` either. Prettier honours it, hence the
      // separate entry in `.prettierignore`.
      '**/.claude/**',
      '**/.agents/**',
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
    },
  },
  {
    files: ['packages/app/src/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
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
  // Config files run as plain JS — no type information to check them against.
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);

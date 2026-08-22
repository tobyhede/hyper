/**
 * StrykerJS — the mutation engine, chosen over mewt by the bake-off recorded in
 * `.scratch/mutation-testing/engine.md`.
 *
 * This is a **diagnostic tool, run on purpose, never a gate.** It is not in
 * `verify`, not in CI, and `thresholds.break` is `null` below so that no score
 * can ever fail a run. A mutation score is evidence for a conversation about
 * the oracle; it is not a number to move.
 *
 * The campaign targets are supplied per run by the `mutate:*` scripts in
 * `package.json`, because `mutate` and `testFiles` must be chosen as a pair —
 * see `testFiles` below.
 */

/*
 * `@stryker-mutator/api` is a devDependency for this annotation alone. It
 * arrives transitively with `core` either way, but pnpm's non-flat layout means
 * an undeclared package does not resolve from the root — so without the
 * declaration the type below silently resolves to nothing and claims a checking
 * that is not happening. Note that `verify` typechecks neither this file nor
 * any `.mjs`: the root program's `include` is `"*.config.ts"`. The annotation
 * buys editor completion, not a gate.
 */
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',

  /*
   * `plugins` must name the runner explicitly. The Stryker default is the glob
   * `@stryker-mutator/*`, which does not resolve through pnpm's non-flat
   * `node_modules`; without this line the run dies with `Cannot find TestRunner
   * plugin "vitest" … no TestRunner plugins were loaded`, and reports the
   * `vitest` key below as an unknown option on the way past.
   */
  plugins: ['@stryker-mutator/vitest-runner'],

  vitest: {
    // The real root config, consumed as-is. Its `@project/*` aliases resolve
    // relative to the config file, so they land on the sandbox's own packages
    // and the mutated copy is what the tests import. Nothing extra is needed.
    configFile: 'vitest.config.ts',
    /*
     * Stryker's default is `true`, which narrows per-mutant tests using
     * vitest's related mode. That mode cannot run in this repo at all: it
     * performs import analysis over every file, and the markdown fixtures
     * loaded through `import.meta.glob(…, { query: '?raw' })` in
     * `packages/app/test/{space-files,fixture-placement}.test.ts` make it throw
     * `Failed to parse source for import analysis … .md file format`. Plain
     * `vitest related` reproduces it with no Stryker involved, so this is not a
     * Stryker bug and not something a Stryker upgrade will fix.
     *
     * `coverageAnalysis: 'perTest'` below recovers most of the narrowing this
     * gives up — it ran 3.37 tests per mutant on the SpaceSession baseline
     * rather than all 17.
     */
    related: false,
  },

  /*
   * No type checker, deliberately.
   *
   * `@stryker-mutator/typescript-checker` *works* here, and that is the
   * problem. It reads `require('typescript')`, which ADR 0061 points at the
   * TypeScript **6** compatibility compiler, so it gets the `createProgram` API
   * it wants and runs without a single warning. It then rejected 56 of 98
   * SpaceSession mutants as `CompileError` — including 10 of the 11 survivors —
   * lifting the reported score from 88.78% to 97.62% by deleting the signal the
   * campaign exists to produce, at 3.4x the runtime.
   *
   * It is also welded to exactly the half of the bridge ADR 0061 declares
   * non-normative and slates for removal.
   */
  checkers: [],

  /*
   * `perTest` records which tests cover which mutant, which is what makes a
   * survivor triageable: the report names the tests that ran and did not die.
   * Without it a survivor is a diff with no suspects.
   *
   * Its companion `ignoreStatic` is deliberately **not** set, which reverses
   * the spike's own verdict — `spike-stryker.md` recommended `ignoreStatic:
   * true` alongside `checkers: []`, and only the second was kept. Setting it
   * would drop this runner's `static: true` false survivors out of the score,
   * but it drops every module-scope mutant with them, tested or not, and the
   * campaigns since have measured the tax at 2 of 98 mutants on one target and
   * 1 of 148 on the other. `engine.md` names the heuristic that identifies
   * them (`"static": true` with an empty `coveredBy`) and every one has been
   * falsified by hand. A visible known-false survivor a reader can check beats
   * a silently absent one.
   */
  coverageAnalysis: 'perTest',

  /*
   * The sandbox is a plain directory copy made with `fs.copyFile`, and
   * `.claude/skills/shadcn` and `.claude/skills/shadcn-first-ui` are
   * git-tracked symlinks to *directories* (deliberately — CLAUDE.md tracks both
   * harnesses' skill paths). Copying a directory symlink that way fails on
   * macOS with `ENOTSUP: operation not supported on socket, copyfile`, which
   * kills the run before any mutant is tested.
   *
   * `.worktrees/**` is load-bearing for a different reason: a git worktree is a
   * full checkout, so without it every branch checked out beside this one is
   * copied into the sandbox. Both directories have held worktrees — `.claude/`
   * historically, `.worktrees/` now — and ignoring one covers only that one,
   * which is the same pairing `eslint.config.js` makes for the same reason.
   *
   * `node_modules`, `.git`, `/reports`, `.stryker-tmp` and `/stryker.log` are
   * always ignored by Stryker and do not need listing.
   */
  ignorePatterns: ['.claude/**', '.worktrees/**'],

  /*
   * `'always'`, not the `true` default, which deletes the temp dir only after a
   * *successful* run. Two crash modes are documented in this file, and each one
   * otherwise leaves a complete repo copy — every package's sources and its own
   * `tsconfig.json` included — in `.stryker-tmp/sandbox-XXXXXX/`. ESLint
   * then sees several candidate TSConfig roots and reports a parse error for
   * every file in the repository, so a crashed campaign breaks the next
   * `pnpm verify`. The ignore entries in `eslint.config.js` and `.oxlintrc.json`
   * are the belt; this is the braces.
   */
  cleanTempDir: 'always',

  reporters: ['clear-text', 'progress', 'html', 'json'],

  /*
   * No gate. `break: null` is Stryker's own "never fail the process" value and
   * is set explicitly so the intent is visible rather than inherited: this tool
   * reports, it does not refuse. `high`/`low` only colour the report.
   */
  thresholds: { high: 80, low: 60, break: null },

  timeoutMS: 20000,
  tempDirName: '.stryker-tmp',

  /*
   * Both are supplied per campaign on the command line, and they are a pair.
   *
   * `testFiles` is not merely scoping: the whole suite **cannot** run inside
   * the sandbox. `test/unit`'s repo-meta test shells out to `git ls-files`,
   * which returns `[]` in a plain directory copy, so the initial test run fails
   * and Stryker refuses to start. Any new campaign must therefore name the test
   * files that are the oracle for the code it mutates.
   *
   * That list lives in the `mutate:*` scripts, and **nothing keeps it honest**:
   * add a test file for a target and forget to list it, and the campaign simply
   * runs against a smaller oracle and reports more survivors. Because a run is
   * a deliberate diagnostic a human reads, the failure is a misleading report
   * rather than a broken build — so check the pairing when you read the result,
   * as `.scratch/mutation-testing/graph-control-and-adoption.md` did.
   */
  mutate: [],
  testFiles: [],
};

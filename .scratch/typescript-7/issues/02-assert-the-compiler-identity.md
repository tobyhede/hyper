# 02 — Assert the compiler identity in verify

**What to build:** A permanent check that fails when the `tsc` the typecheck scripts actually execute is not TypeScript 7 or above, or when `import "typescript"` stops answering the API the linter needs.

**Status:** resolved

**Why:** ADR 0061's arrangement reads as a mistake, so a lockfile change, a dependency bump or a cleanup can quietly reverse it. The failure mode is silent: everything still typechecks, just with the wrong compiler, and the repository goes on describing itself as TypeScript 7. This is the check that makes the claim executable.

- [x] Add `scripts/check-typescript-toolchain.mjs`. It executes the same `tsc` invocation the typecheck scripts use, parses `--version`, and fails unless the major version is 7 or above.
- [x] It also imports `typescript` and, for the bridge period, verifies the major version is 6 and the API surface tooling depends on exists (`createProgram` at minimum).
- [x] It covers **per-package** resolution, not only the root binary — `pnpm -r typecheck` runs each package's own `tsc`, and a root-only check does not prove those.
- [x] It prints both resolved versions on success, so a passing run is still evidence.
- [x] Add `"typecheck:toolchain"` to root scripts and make it the first step of `verify`, ahead of `typecheck`.
- [x] Add a unit test pinning the check's own behaviour — that it rejects a 6.x authoritative compiler and accepts a 7.x one — so the guard cannot rot into a no-op.
- [x] `pnpm verify` and report the real output.

**Note:** when the bridge is removed the script narrows rather than disappears; the permanent assertion is *the authoritative `tsc` is 7 or above*. Write it so that removal is an edit, not a rewrite.

## Comments

Landed as `scripts/check-typescript-toolchain.ts`, wired as `typecheck:toolchain` and made the first step of `verify`.

**Written as `.ts` run through `tsx`, not the `.mjs` the ticket named.** The root `tsconfig.json` includes `scripts/**/*.ts`, and the three scripts already there (`ui-catalog.ts`, `parity-reporter.ts`, `parity-tag.ts`) are `.ts` on `tsx`. An `.mjs` would be the one script in the repository not typechecked — and it would be the script guarding the typechecker. `tsx` transpiles through esbuild and never loads TypeScript, so the guard still does not depend on the thing it is checking.

**Shape.** A pure core (`compilerMajor`, `judgeCompilers`, `judgeBridge`, `judgeToolchain`, `formatVerdict`) over a gathered `ToolchainReading`, with a thin shell (`probedWorkspaces`, `probeCompiler`, `readBridge`, `readToolchain`) that does the spawning. The whole verdict is therefore testable without spawning anything or mocking a module.

**Per-package coverage.** `probedWorkspaces` enumerates `packages/*` off disk rather than a hand-kept list, so a new package is probed the day it exists. Each probe runs `pnpm exec tsc --version` with `cwd` set to that directory — the same resolution rule the package's own `typecheck` script gets — rather than a hand-built PATH that could drift from what pnpm actually does. The eight probes run concurrently; the whole check is ~1.4s.

**Bridge removal is an edit.** `BRIDGE_MAJOR`, `judgeBridge`, `readBridge` and the two lines calling them are the entire temporary half, and the file's header comment says so. What survives is the permanent assertion: the authoritative `tsc` is 7 or above.

**`createProgram` is asked of the module, not of its type.** `typescript.createProgram !== undefined` fails `@typescript-eslint/no-unnecessary-condition`, and correctly — the type comes from whatever `typescript` resolves to, so statically it can only ever agree with itself. `Object.hasOwn(typescript, 'createProgram')` asks the resolved module at runtime, which is the question the guard is actually for.

### Verification

`test/unit/check-typescript-toolchain.test.ts` — 17 tests. It pins that a 6.x authoritative compiler is rejected and a 7.x one accepted; that **one package** left behind on 6.x fails even when the root is 7.x; that a major above the minimum still passes so a future release does not fail the guard; that an unrunnable binary, unparseable output and an empty probe set all fail rather than pass quietly; that the bridge rejects a library unified onto 7.x, one missing `createProgram`, and one that will not load; that `probedWorkspaces` names the root and all seven packages; and that `verify` still starts with `typecheck:toolchain`.

The shell-to-core wiring was proved end to end by hand: raising `AUTHORITATIVE_MAJOR_MINIMUM` to 8 against the real tree makes `pnpm typecheck:toolchain` exit 1 and name all eight workspaces. Restored afterwards.

`pnpm verify` — exit 0; 140 test files, 1457 passed, 8 skipped. The check's own output appears first in the run:

```
TypeScript toolchain is the one ADR 0061 describes:
  .: tsc Version 7.0.2
  packages/app: tsc Version 7.0.2
  ... (all seven packages)
  typescript (library): 6.0.3
```

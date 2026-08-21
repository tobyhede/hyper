# 02 — Assert the compiler identity in verify

**What to build:** A permanent check that fails when the `tsc` the typecheck scripts actually execute is not TypeScript 7 or above, or when `import "typescript"` stops answering the API the linter needs.

**Status:** ready-for-agent

**Why:** ADR 0061's arrangement reads as a mistake, so a lockfile change, a dependency bump or a cleanup can quietly reverse it. The failure mode is silent: everything still typechecks, just with the wrong compiler, and the repository goes on describing itself as TypeScript 7. This is the check that makes the claim executable.

- [ ] Add `scripts/check-typescript-toolchain.mjs`. It executes the same `tsc` invocation the typecheck scripts use, parses `--version`, and fails unless the major version is 7 or above.
- [ ] It also imports `typescript` and, for the bridge period, verifies the major version is 6 and the API surface tooling depends on exists (`createProgram` at minimum).
- [ ] It covers **per-package** resolution, not only the root binary — `pnpm -r typecheck` runs each package's own `tsc`, and a root-only check does not prove those.
- [ ] It prints both resolved versions on success, so a passing run is still evidence.
- [ ] Add `"typecheck:toolchain"` to root scripts and make it the first step of `verify`, ahead of `typecheck`.
- [ ] Add a unit test pinning the check's own behaviour — that it rejects a 6.x authoritative compiler and accepts a 7.x one — so the guard cannot rot into a no-op.
- [ ] `pnpm verify` and report the real output.

**Note:** when the bridge is removed the script narrows rather than disappears; the permanent assertion is *the authoritative `tsc` is 7 or above*. Write it so that removal is an edit, not a rewrite.

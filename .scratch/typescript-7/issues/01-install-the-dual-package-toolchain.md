# 01 — Install the dual-package toolchain

**What to build:** Replace the single `typescript@^6.0.3` dependency with ADR 0061's arrangement — TypeScript 7 owning the `tsc` binary, and the package name `typescript` resolving to the TypeScript 6 compatibility API for `typescript-eslint`.

**Status:** resolved

**Why:** The compiler is ready and the repository already typechecks clean under it. Landing the toolchain alone, ahead of any typing change, keeps a failure attributable to the compiler swap rather than to a refactor riding along with it.

- [x] In root `package.json`, alias TypeScript 7 under an unambiguous key (**not** `@typescript/native` — `@typescript/native-preview` is a real, different package) and point `typescript` at `npm:@typescript/typescript6@6.0.2`.
- [x] Keep `typescript-eslint` on its current 8.x line; confirm its peer range (`>=4.8.4 <6.1.0`) is satisfied by the aliased 6.0.2 rather than warned past.
- [x] `pnpm install` and commit the lockfile.
- [x] Prove binary identity by hand before claiming anything: `pnpm exec tsc --version` reports 7.x, `pnpm exec tsc6 --version` reports 6.x, `node -p "require('typescript').version"` reports 6.x.
- [x] Prove per-package resolution too — each package's own `typecheck` script must execute the 7.x binary, not just the root one.
- [x] Run `pnpm typecheck`, `pnpm typecheck:packages`, `pnpm lint`, `pnpm verify` and report the real output.

**Stop condition:** if `pnpm exec tsc --version` reports 6.x, the migration halts here. Fix binary resolution before going further; do not proceed while describing the repository as being on TypeScript 7.

**Scope:** `package.json` and `pnpm-lock.yaml` only. No source changes, no lint-rule changes, no documentation beyond what issue 11 owns.

## Comments

Landed. `@typescript/typescript7` is the alias key — unambiguous against the real `@typescript/native-preview`, and it names what it is.

Binary identity proved by hand:

```
$ pnpm exec tsc --version                        Version 7.0.2
$ pnpm exec tsc6 --version                       Version 6.0.3
$ node -p "require('typescript').version"        6.0.3
```

`node -p "require('typescript/package.json').name"` answers `@typescript/typescript6`, version `6.0.2` — the package version and the compiler version it reports differ by a patch, which is upstream's business and still major 6 either way.

Per-package resolution proved too: `pnpm exec tsc --version` run from each of the seven `packages/*` directories reports `7.0.2`, so `pnpm -r typecheck` executes the 7.x binary everywhere and not only at the root.

`typescript-eslint@8.65.0` peers `typescript >=4.8.4 <6.1.0`; 6.0.2 satisfies it and `pnpm install` raises no peer warning for it. The one peer warning in the tree is pre-existing and unrelated: `tsconfck@3.1.6`, three levels under `@ladle/react`, wants `typescript@^5.0.0` and would have been unmet against the previous `^6.0.3` too.

Root typecheck is now ~2.2s wall against the ~9.6s the spec measured on TypeScript 6.

Blocked on issue 03, which is now resolved. `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` all green — see issue 03's comment for the numbers.

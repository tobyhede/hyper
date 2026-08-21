# 03 — Fix the Ladle typings failure under TypeScript 7

**What to build:** Clear the two TypeScript 7 errors in `packages/app` that originate inside `@ladle/react`'s bundled `typings-for-build/app/src/ui.tsx`, without weakening the app's typecheck.

**Status:** resolved

**Why:** This is the only known blocker to a green TypeScript 7 typecheck. Measured on the working tree at `f5506ce`:

```
node_modules/.pnpm/@ladle+react@5.1.1_.../node_modules/@ladle/react/typings-for-build/app/src/ui.tsx(65,7):
  error TS2322: Type '{ isOpen: boolean; onDismiss: () => void; "data-testid": string; children: Element; }'
  is not assignable to type 'IntrinsicAttributes & RefAttributes<unknown>'.
… and the same at (73,9).
```

Six of seven package configs are clean; only `app` fails. TypeScript 6 does not report these. The cause is that `skipLibCheck: true` covers declaration files, and this is `.tsx` **source** shipped inside `node_modules` and pulled in through `.ladle/components.tsx`, which `packages/app/tsconfig.json` includes.

- [x] Confirm the entry path — why TypeScript 7 pulls that file into the app program and TypeScript 6 does not — before choosing a fix. The two compilers disagreeing about program membership is the interesting fact here, not the React prop mismatch itself.
- [x] Fix it at the boundary: keep third-party source out of the app's program, or narrow how `.ladle/components.tsx` reaches `@ladle/react`. Do **not** fix it by turning off a compiler option, adding `@ts-expect-error` inside our file, or excluding `.ladle/components.tsx` from the typecheck it legitimately belongs in.
- [x] Check whether a newer `@ladle/react` ships declarations rather than source; if so, a version bump may be the honest fix.
- [x] `pnpm typecheck:packages` clean under TypeScript 7, then `pnpm verify` and `pnpm e2e:ladle`, and report the real output — the story catalogue is the thing most likely to break here and it is its own CI job.

**Blocks:** issue 01 cannot be reported as green until this is done.

## Comments

### The stated cause was wrong — it is not program membership

The ticket assumed TypeScript 7 pulls `ui.tsx` into the app program and TypeScript 6 does not. Measured with `--listFiles` on `packages/app/tsconfig.json`, **both compilers include and check it**, and the file lists are otherwise identical:

```
$ pnpm exec tsc  -p tsconfig.json --noEmit --listFiles | grep 'app/src/ui.tsx'   # present
$ pnpm exec tsc6 -p tsconfig.json --noEmit --listFiles | grep 'app/src/ui.tsx'   # present
```

It is not that TypeScript 6 skips the file either. Injecting `const __probe: number = "not a number"` into a scratch copy of the package makes **both** compilers report it, so TypeScript 6 is checking `ui.tsx` in full.

The actual cause is a **diagnostic-position change that defeats a third-party suppression**. Upstream already knows these two JSX errors are wrong and wrote `//@ts-ignore` above each opening tag. Removing those two comments from a scratch copy makes TypeScript 6 report both errors — at the **opening tag** (`<DialogOverlay`, `<DialogContent`), which is exactly the line the suppression covers. TypeScript 7 reports the same two errors at the **offending attribute** one or two lines further down (`isOpen={isOpen}` at 65,7 and `style={{ maxWidth }}` at 73,9), which the suppression no longer reaches.

So there is no type regression and nothing to keep out of the program — the program was always the same. What changed is where the error lands relative to a comment that only covers one line.

### The fix

`@ladle/react@5.1.1` is npm `latest`; there is no newer version to bump to, so the ticket's preferred honest fix is unavailable.

Fixed with a tracked `pnpm` patch (`patches/@ladle__react@5.1.1.patch`, wired through `pnpm.patchedDependencies`) that puts `// @ts-nocheck` at the head of `typings-for-build/app/src/ui.tsx`, with a comment explaining why. This:

- fixes the third-party file at the boundary rather than our source, as the ticket requires;
- turns off no compiler option, adds no `@ts-expect-error` to our files, and excludes nothing from the typecheck;
- matches what the sibling `dialog.tsx` **in the same package** already does — it carries `// @ts-nocheck` for the same bundled-@reach/dialog reason;
- does not change inference, so consumers see the same types they saw before;
- is visible in `package.json`, tracked in `patches/`, and pinned by the lockfile, so it cannot rot unnoticed.

Removal condition is written into the patch banner: drop it when `@ladle/react` ships declarations rather than source, or relocates its own suppressions.

### Verification

`pnpm typecheck:packages` — all seven packages clean under TypeScript 7.0.2.
`pnpm verify` — exit 0; 139 test files, 1440 passed, 8 skipped.
`pnpm e2e` — 102 passed.
`pnpm e2e:ladle` — 18 passed.

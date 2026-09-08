# 01 — Decide whether to enable the React Compiler

Status: needs-triage

**What to decide:** Whether this repo enables the React Compiler, or commits to
hand-memoization as the standing convention.

It is **not enabled**, verified four ways: no `babel-plugin-react-compiler` and no
`reactCompiler` key in `package.json`, in `packages/app/vite.config.ts` or in
`pnpm-lock.yaml`, and no `.ladle/` directory carrying a config of its own. The app
uses a plain `react()` plugin.

This surfaced in the Command Dock prototype, where a derivation was written
un-memoized on the assumption the compiler would handle it, and had to be given
its `useMemo` back (`b7a2e3bf`). The choice is written into
`command-dock.stories.tsx` as an open decision, which is the wrong place for it —
it is a toolchain decision for the whole repository and it is filed here so it
stops being one prototype's footnote.

- [ ] Decide. Either enabling is worth the toolchain change, or hand-memoization
      is the convention and reviewers stop asking.
- [ ] If enabled: it must reach the Ladle catalogue too, or stories and the
      application compile under different rules and a story stops being the
      parity evidence ADR 0052 says it is.
- [ ] Either way, remove the open decision from the prototype source.

Note ADR 0061 before touching the toolchain: `tsc` is TypeScript 7 while the
package name `typescript` deliberately resolves to the TypeScript 6 bridge, and
`pnpm typecheck:toolchain` fails the moment that arrangement stops holding.

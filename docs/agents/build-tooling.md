# Build & Tooling

Vite config gotchas, Prettier scope, and the spike-harness rule. Read before touching a root `*.config.ts`, `packages/app/vite*.ts`, or leaving a throwaway harness behind.

- **Markdown is excluded from Prettier** (`.prettierignore`) — don't rely on `format` to touch `*.md`.
- **Don't import a workspace package by name into `vite.config.ts`.** Vite loads the config in Node and externalizes bare specifiers, so `@project/core` hands *Node* the TypeScript source, whose extensionless relative imports (`export * from './schema'`) Node's ESM resolver rejects — the config then fails to load at all and the dev server will not start. Import by relative path (`../core/src/index`) so esbuild bundles it. This is the one place the repo's extensionless-import convention does not hold.
- **Vite hosts a fixed server runtime, not browser-selected capabilities.** The thin config-time plugin imports no application package. Development loads the chosen runtime with Vite's SSR module runner; preview loads the dedicated bundled Node artifact. The server configuration fixes PostgreSQL versus isolated E2E memory and fixture versus empty catalog before any browser request.
- **Changing the Vite config needs a dev server restart** — plugins load at config time and HMR won't pick them up. That server is the human's; say it needs restarting rather than restarting it.
- **Delete a spike harness when you write it up; ignoring it is not enough.** `packages/app/spike.html` sat gitignored, went stale against the `elkLayout` → `elkStrategy` rename, and broke `pnpm dev` — Vite's dependency scanner treats every root `.html` as an entry and does not read `.gitignore`, while tsc and eslint both skip `.scratch/`, so `pnpm verify` stayed green and only the dev server saw it.

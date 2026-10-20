# Deploying to Cloudflare

A talk in a public GitHub repository can be shown from a static copy of Hyper, with no server: **Mounting** (ADR 0130). `pnpm build:mount` writes that copy to `packages/app/dist-mount`, and the repository's `wrangler.jsonc` serves it from Cloudflare Workers static assets, with every product URL answered by the application. The page reads the talk from GitHub when it opens and offers no edit; editing stays `pnpm hyper run` on the author's machine.

A **GitHub location** is `github:owner/repo@ref/path`. `@ref` defaults to the repository's default branch and `/path` to its root; the directory it names must hold `hyper.json`. Any page takes one as `?source=github:…`. A build variable, `VITE_HYPER_DEFAULT_SOURCE`, sets the one the bare domain opens; without it, and without `?source=`, the page asks for a location.

## Deploy

1. In the Cloudflare dashboard, **Workers & Pages** > **Create** > **Import a repository**, and choose this repository (or your fork of it). The Worker's name may differ from `wrangler.jsonc`'s `hyper`: Workers Builds deploys under the connected Worker's name.
2. Under the build settings:
   - **Build command:** `bash scripts/cloudflare-build.sh`. It checks that Node is `.node-version`'s major at or above it, installs the pnpm `package.json` names in `packageManager`, then runs `pnpm install --frozen-lockfile` and `pnpm build:mount`.
   - **Deploy command:** `npx wrangler deploy` (the default). **Preview command:** `npx wrangler preview` (the default); a branch other than the production one deploys as a Preview, from `wrangler.jsonc`'s `previews`.
   - **Build variables:** `SKIP_DEPENDENCY_INSTALL=1`, so the script's install, with the pinned pnpm, is the only one. Add `VITE_HYPER_DEFAULT_SOURCE` if this deployment has a default talk. Workers Builds installs the Node that `.node-version` names; set `NODE_VERSION` to the same value only if the build log says otherwise.
3. Save and deploy. The Worker answers on its `workers.dev` address.

To check a build locally first: `pnpm build:mount`, then `pnpm exec wrangler deploy --dry-run` and `pnpm exec wrangler dev --port 8787`.

## Point a domain at a talk

A talk's own domain is a second Worker connected to the same repository, with its default pinned to a commit. Pinning spends one GitHub API call per page load, for the tree, against the 60 an hour GitHub allows each unauthenticated address, where a branch spends two, one more to resolve it to a commit (`packages/app/test/github-source.test.ts`, "spends no call resolving a ref that is already a commit SHA"). The files themselves come from `raw.githubusercontent.com`, which is not the API.

1. Commit the talk to its public repository and copy the commit SHA.
2. Create another Worker from this repository as in [Deploy](#deploy), with `VITE_HYPER_DEFAULT_SOURCE=github:owner/repo@<sha>` (add `/path` when `hyper.json` is not at the repository's root).
3. The Worker's **Settings** > **Domains & Routes** > **Add** > **Custom Domain**, and enter the domain. Its zone must be on Cloudflare; Cloudflare creates the DNS record and certificate.
4. To publish a new version of the talk, set the Worker's `VITE_HYPER_DEFAULT_SOURCE` to the new commit, then retry the latest build from its build history. The commit is read from the variable at build time, so pushing to this repository without changing it rebuilds the same talk.

Every mounted page records the commit it read in its address, so a link someone shared keeps showing that commit after the default moves on.

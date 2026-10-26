# Deploying to Cloudflare

A talk in a public GitHub repository can be shown from a static copy of Hyper, with no server: **Mounting** (ADR 0130). `pnpm build:mount` writes that copy to `packages/app/dist-mount`, and the repository's `wrangler.jsonc` serves it from Cloudflare Workers static assets, with every product URL answered by the application. The page reads the talk from GitHub when it opens. Edits made there work as anywhere else but last only as long as the page (ADR 0131), so lasting edits stay `pnpm hyper run` on the author's machine.

A **GitHub location** is `github:owner/repo@ref/path`. `@ref` defaults to the repository's default branch and `/path` to its root; the directory it names must hold `aggregate.json`. Any page takes one as `?source=github:…`. A build variable, `VITE_DEFAULT_SPACE_SOURCE`, sets the one the bare domain opens; without it, and without `?source=`, the page asks for a location.

## Deploy

1. In the Cloudflare dashboard, **Workers & Pages** > **Create** > **Import a repository**, and choose this repository (or your fork of it). The Worker's name may differ from `wrangler.jsonc`'s `hyper`: Workers Builds deploys under the connected Worker's name.
2. Under the build settings:
   - **Build command:** `pnpm build:mount`. Before it, Workers Builds installs the Node that `.node-version` names and the pnpm that `package.json`'s `packageManager` names, then installs the dependencies from `pnpm-lock.yaml` ([Build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)).
   - **Deploy command:** `npx wrangler deploy` (the default). **Preview command:** `npx wrangler preview` (the default); a branch other than the production one deploys as a Preview, from `wrangler.jsonc`'s `previews`.
   - **Build variables:** `VITE_DEFAULT_SPACE_SOURCE`, if this deployment has a default talk. No other is needed.
3. Save and deploy. The Worker answers on its `workers.dev` address.

With preview builds on, a push to any other branch builds a [Preview](https://developers.cloudflare.com/workers/previews/) of the Worker, so a pull request can be tried before it merges. A Preview takes its build variables from **Settings** > **Builds** > **Previews Base**, not from Production, so give `VITE_DEFAULT_SPACE_SOURCE` there too (**Import** copies Production's), and turn on the Preview URL under **Domains** for the Preview to answer on `workers.dev`.

To check a build locally first: `pnpm build:mount`, then `pnpm exec wrangler deploy --dry-run` and `pnpm exec wrangler dev --port 8787`.

## Point a domain at a talk

A talk's own domain is a second Worker connected to the same repository, with `VITE_DEFAULT_SPACE_SOURCE` naming the talk. Its `@ref` is a branch or a commit:

- **A branch** (`github:owner/repo@main`): the bare domain opens whatever the branch holds when the page loads, so pushing the talk publishes it, with no rebuild. Each load spends two GitHub API calls, one to resolve the branch to a commit and one for the tree, against the 60 an hour GitHub allows each unauthenticated address.
- **A commit** (`github:owner/repo@<sha>`): the bare domain opens that commit until the variable changes, and each load spends one call (`packages/app/test/github-source.test.ts`, "spends no call resolving a ref that is already a commit SHA"). To publish a new version, set the variable to the new commit and retry the latest build from its build history.

A branch spends the limit twice as fast: about 30 loads an hour from one address, such as a venue's shared network, exhausts it, and every visitor behind that address then sees the page fail to open the talk. Pin a commit for a talk many people will open from one network.

The files themselves come from `raw.githubusercontent.com`, which is not the API.

1. Create another Worker from this repository as in [Deploy](#deploy), with `VITE_DEFAULT_SPACE_SOURCE=github:owner/repo@<ref>` (add `/path` when `aggregate.json` is not at the repository's root).
2. The Worker's **Settings** > **Domains & Routes** > **Add** > **Custom Domain**, and enter the domain. Its zone must be on Cloudflare; Cloudflare creates the DNS record and certificate.

Every mounted page records the commit it read in its address, so a link someone shared keeps showing that commit after the default moves on.

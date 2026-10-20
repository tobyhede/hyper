# 07 — Deploy to Cloudflare

Status: resolved

**What to build:** the repository's deployment of 06's build to Cloudflare Workers static assets (ADR 0130).

- A `wrangler.jsonc` with `assets.directory` pointing at the build output, `not_found_handling: "single-page-application"`, `previews: {}` and no `main`.
- A build script for Cloudflare's build step that installs with the pinned Node and pnpm and runs 06's command.
- The default GitHub location comes from the deployment's build variable, so one configuration serves the generic host and a talk's domain.
- How to deploy, and how to point a domain at a talk, goes in the `hyper-getting-started` skill or a guide it links.

**Depends on:** 06.

**Acceptance:**

- `wrangler deploy --dry-run` succeeds on a built tree.
- A local `wrangler dev` of the build answers a deep product URL with the application and with 06's Content Security Policy header.

## Answer

- `wrangler.jsonc`: `name` `hyper`, `compatibility_date` `2026-10-01`, `assets.directory` `./packages/app/dist-mount`, `assets.not_found_handling` `"single-page-application"`, `previews: {}`, no `main`. Field names checked against Cloudflare's Workers static-assets, single-page-application routing and Pages-migration (Previews) docs. Workers Builds overrides `name` with the connected Worker's (`WRANGLER_CI_OVERRIDE_NAME`, per its troubleshooting page), so a talk's Worker builds from the same file.
- `scripts/cloudflare-build.sh`: refuses a Node that is not `.node-version`'s exact version, installs `packageManager`'s pnpm when another is on `PATH`, prints whether `VITE_HYPER_DEFAULT_SOURCE` is set, then runs `pnpm install --frozen-lockfile` and `pnpm build:mount`. The guide has Workers Builds run it with `SKIP_DEPENDENCY_INSTALL=1`.
- `wrangler` `4.147.0` is a root devDependency: the acceptance checks run it, and Workers Builds runs the Wrangler version `package.json` names. `.wrangler/` is ignored.
- `docs/deploy-cloudflare.md` covers deploying and pointing a domain at a talk (a second Worker with its default pinned to a commit, plus a Custom Domain); the `hyper-getting-started` skill links it.

Checked on a stand-in tree (an `index.html`, one hashed asset and a `_headers`), since 06's `pnpm build:mount` is not on this branch:

- `pnpm exec wrangler deploy --dry-run` read the assets directory, reported no bindings and exited 0.
- `pnpm exec wrangler dev --port 8787` answered `/`, `/spaces/x/maps/y` and `/spaces/x/maps/y?source=x` with 200 and `index.html`, with and without `Sec-Fetch-Mode: navigate`; the hashed asset with 200 as `text/javascript`; and applied `_headers` to every response.
- `scripts/cloudflare-build.sh` under Node 26.8.1 installed, then stopped at `Command "build:mount" not found`, as expected before 06. Under Node 22 it refused with the `.node-version` message.

On 06's real `pnpm build:mount` tree (`VITE_HYPER_DEFAULT_SOURCE=github:tobyhede/talks@main`): `wrangler deploy --dry-run` read 8 files from `packages/app/dist-mount`, reported no bindings and exited 0, and `wrangler dev` answered `/spaces/x/maps/y?source=github:o/r` with 200, `text/html`, 06's `content-security-policy` and `x-content-type-options: nosniff`.

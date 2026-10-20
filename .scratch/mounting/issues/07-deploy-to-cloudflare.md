# 07 — Deploy to Cloudflare

Status: ready-for-agent

**What to build:** the repository's deployment of 06's build to Cloudflare Workers static assets (ADR 0130).

- A `wrangler.jsonc` with `assets.directory` pointing at the build output, `not_found_handling: "single-page-application"`, `previews: {}` and no `main`.
- A build script for Cloudflare's build step that installs with the pinned Node and pnpm and runs 06's command.
- The default GitHub location comes from the deployment's build variable, so one configuration serves the generic host and a talk's domain.
- How to deploy, and how to point a domain at a talk, goes in the `hyper-getting-started` skill or a guide it links.

**Depends on:** 06.

**Acceptance:**

- `wrangler deploy --dry-run` succeeds on a built tree.
- A local `wrangler dev` of the build answers a deep product URL with the application and with 06's Content Security Policy header.

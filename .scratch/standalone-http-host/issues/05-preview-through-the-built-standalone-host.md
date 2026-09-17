# 05 — Preview through the built standalone host

**What to build:** `pnpm build` produces a runnable host bundle beside the built application, and `pnpm preview` serves the built application while forwarding `/api` and product addresses to that bundle running as its own process.

**Blocked by:** 02 — `pnpm dev` over PostgreSQL through a standalone host.

**Status:** ready-for-agent

- [ ] The built host starts from the bundle alone, without the workspace TypeScript sources, and closes its database when it stops.
- [ ] Preview answers the root address, an unknown entity address and the API the same way dev does, covered by a test against the built output.
- [ ] Preview stays PostgreSQL; `dev:sqlite` remains development-only.

# 10 — Extend the development fixture to linked Spaces

**What to build:** Give development, E2E and release verification one legible
multi-Space fixture rooted in the Meta Space.

**Blocked by:** `v1-release/08` — Round-trip the complete Space aggregate.

**Status:** ready-for-agent
Tags: release/v1

- [ ] The fixture contains the Meta Space and several referenced ordinary
      Spaces, with at least one converging reference and depth of at least three.
- [ ] Every ordinary fixture Space remains reachable from the Meta Space.
- [ ] Fixture content is meaningful enough to verify opening, editing, Enter,
      switching and presentation rather than using placeholder Card names.
- [ ] The fixture is a complete `hyper.json` aggregate consumed by
      `pnpm dev:fixture` and the Chromium E2E project through normal import and
      HTTP boundaries.
- [ ] Cycle refusal remains an aggregate-intake test rather than an invalid
      fixture.

# 07 — Fixtures carry images

**What to build:** Tracked image files sit beside the fixtures, and seeding stores them through the same door as ticket 02, so the tracked fixture's Image Resources load without the network (ADR 0106). A fixture names each image by the `/images/<id>` its file's content determines. A check fails when a fixture names an `/images/<id>` that no tracked file produces, so the fixture and its files cannot drift (ADR 0054).

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] The tracked fixture includes at least one Image Resource, Open, whose image loads in `pnpm e2e:fixture` with no network access.
- [ ] `dev:fixture` and the E2E hosts seed the stored images before serving.
- [ ] A fixture naming an unknown `/images/<id>` fails the check.

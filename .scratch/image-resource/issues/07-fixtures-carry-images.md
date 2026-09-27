# 07 — Fixtures carry images

**What to build:** Tracked image files sit beside the fixtures, and seeding stores them through the same door as ticket 02, so the tracked fixture's Image Resources load without the network (ADR 0106). A fixture names each image by the `/images/<id>` its file's content determines. A check fails when a fixture names an `/images/<id>` that no tracked file produces, so the fixture and its files cannot drift (ADR 0054).

**Blocked by:** 01, 02, 03

**Status:** resolved

- [x] The tracked fixture includes at least one Image Resource, Open, whose image loads in `pnpm e2e:fixture` with no network access.
- [x] `dev:fixture` and the E2E hosts seed the stored images before serving.
- [x] A fixture naming an unknown `/images/<id>` fails the check.

## Comments

**2026-09-27, resolved.** The tracked image files sit in `packages/app/fixture-images/`, a sibling of the aggregate directory rather than a child of it: an aggregate carries an image's URL and never its bytes (ADR 0106), and `packages/app/e2e/graph.ts` counts every child directory of `fixture/` as an ordinary Space. The one file is ticket 03's `harbour-400x300.png`, copied so the fixture does not reach into the stories' support tree.

`importFixture` (`test/support/import-fixture.ts`) is the one seeding path — the E2E hosts and `dev:fixture` both reach it through `test/support/e2e-http-runtime.ts` — and it now stores every tracked image through `admitImage` and `ImageStore.storeImage` before initializing the aggregate, then refuses, before any Space is stored, a fixture naming an `/images/<id>` none of those files produced. So the drift check is the seed itself, and `test/unit/tracked-fixture-aggregate.test.ts` proves it by adding an Image Resource with an unknown id to a temporary copy of the fixture. A file admission refuses fails the seed too.

The Image Resource is `Harbour`, Open, in the Deep dive Space (the last stop on its Graph), rather than in the Map fixture Meta Space, whose Resource and Edge counts many specs read; only `space-files.test.ts`'s Deep dive count moved. Its Open Size is the recorded 400×300 plus `OPEN_RESOURCE_CHROME`. The browser proof is the last test in `packages/app/e2e/image-resource.spec.ts`, which refuses every request leaving the host.

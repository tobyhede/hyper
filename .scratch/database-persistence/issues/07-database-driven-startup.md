# 07 — Database-driven startup

**What to build:** Make the CLI choose the initial app experience from the database catalog, both after import and when Hyper starts without an import path.

**Blocked by:** 05 — Single-space CLI import.

**Status:** resolved

- [x] `hyper` with no path inspects the existing database without running an import.
- [x] Zero stored spaces creates and opens a new fully identified space through the repository.
- [x] One stored space opens directly on that space.
- [x] Multiple stored spaces display a selector and open the chosen space.
- [x] Importing exactly one space opens that imported space even when unrelated spaces already exist.
- [x] Importing multiple spaces displays selection without hiding unrelated existing spaces unless dangerous truncation was requested.
- [x] The browser never selects or names a filesystem path.
- [x] Startup and selection behavior is covered at the highest practical application seam, including zero, one, and many-space cases.

## Answer

The server-side startup policy creates or loads the durable workspace for zero,
one, or many stored Spaces. Exactly one imported Space wins even when unrelated
Spaces exist; a multi-Space import returns the complete post-import catalog.
The application opens and selects workspaces by UUID only, with no filesystem
paths. Before issue 08, `opened` means a durable `StoredSpace` was selected and
loaded, plus the reusable application opening and selector behavior is built;
issue 08 supplies the production PostgreSQL-to-browser HTTP transport.

Final verification passed: `pnpm verify` ran 399 tests across 50 files, e2e ran
33/33 tests, and the complete serialized PostgreSQL integration suite ran 32
tests across 3 files. PostgreSQL was stopped afterward.

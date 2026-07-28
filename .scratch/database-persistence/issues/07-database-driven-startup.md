# 07 — Database-driven startup

**What to build:** Make the CLI choose the initial app experience from the database catalog, both after import and when Hyper starts without an import path.

**Blocked by:** 05 — Single-space CLI import.

**Status:** ready-for-agent

- [ ] `hyper` with no path inspects the existing database without running an import.
- [ ] Zero stored spaces creates and opens a new fully identified space through the repository.
- [ ] One stored space opens directly on that space.
- [ ] Multiple stored spaces display a selector and open the chosen space.
- [ ] Importing exactly one space opens that imported space even when unrelated spaces already exist.
- [ ] Importing multiple spaces displays selection without hiding unrelated existing spaces unless dangerous truncation was requested.
- [ ] The browser never selects or names a filesystem path.
- [ ] Startup and selection behavior is covered at the highest practical application seam, including zero, one, and many-space cases.


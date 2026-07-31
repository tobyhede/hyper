# 09 — Canonical CLI export

**What to build:** Add a CLI-only export that projects one consistent database revision into the existing repository-friendly space-directory structure and records exactly which revision was exported.

**Blocked by:** 01 — Version 2 UUID migration; 04 — PostgreSQL space repository; 05 — Single-space CLI import.

**Status:** resolved

- [x] `hyper export <space-uuid> <destination-directory>` exports exactly one stored space and rejects an unknown or malformed UUID.
- [x] Output contains `space.json` and one `cards/<card-uuid>.md` per card, with every generated entity id explicit.
- [x] JSON, frontmatter, card ordering, filenames, whitespace, and line endings are deterministic.
- [x] Export does not promise to preserve imported comments, filenames, quoting, or key order.
- [x] Files are written to a staging directory and loaded through the normal version 2 file intake before destination replacement.
- [x] Replacement removes stale managed cards from the exported projection while leaving files outside the defined space discovery scope untouched.
- [x] A filesystem failure leaves the previous destination recoverable and does not advance export metadata.
- [x] After successful replacement, the repository records the exact exported revision.
- [x] An edit committed during export leaves the space correctly marked as changed since export.
- [x] Round-trip and integration tests cover deterministic output, importability, stale-card removal, unrelated-file preservation, failure safety, and export-revision races.

## Answer

`hyper export <space-uuid> <destination-directory>` now loads one consistent `StoredSpace`, writes canonical version 2 files into a sibling staging directory, and re-enters those files through `readSingleSpace` plus normal snapshot intake before replacement. Canonical output fixes JSON and frontmatter key order, sorts position keys and card UUID filenames ordinally, uses LF line endings, and writes every id explicitly. It intentionally regenerates source rather than preserving imported filenames or bytes.

Replacement starts from a copy of the destination, removes only discovered root/card Markdown plus `space.json`, and therefore removes stale managed cards while preserving files outside the non-recursive discovery scope. The previous destination is renamed to a sibling recovery directory during the final swap; a failed swap restores it, and a failed restoration leaves the recovery path intact. `markExported` runs only after replacement and records the loaded revision without requiring it to remain current, so an edit committed during export leaves `revision !== exportedRevision`.

Verification on 2026-07-31:

- `pnpm verify`: 63 files and 519 tests passed.
- `pnpm test:integration:postgres`: 3 files and 34 tests passed, including the real CLI export and concurrent-revision behavior.
- `git diff --check`: passed.
- UI/graph E2E was not run because this change is CLI, server-side filesystem, and repository-only; no browser, UI, or graph code changed.
- The Vite build was not run because no application or build configuration changed; the CLI executes directly through `tsx`.
- The PostgreSQL container used for integration verification was stopped afterward.

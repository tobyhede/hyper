# 09 — Canonical CLI export

**What to build:** Add a CLI-only export that projects one consistent database revision into the existing repository-friendly space-directory structure and records exactly which revision was exported.

**Blocked by:** 03 — PostgreSQL space repository; 04 — Version 2 UUID migration; 05 — Single-space CLI import.

**Status:** ready-for-agent

- [ ] `hyper export <space-uuid> <destination-directory>` exports exactly one stored space and rejects an unknown or malformed UUID.
- [ ] Output contains `space.json` and one `cards/<card-uuid>.md` per card, with every generated entity id explicit.
- [ ] JSON, frontmatter, card ordering, filenames, whitespace, and line endings are deterministic.
- [ ] Export does not promise to preserve imported comments, filenames, quoting, or key order.
- [ ] Files are written to a staging directory and loaded through the normal version 2 file intake before destination replacement.
- [ ] Replacement removes stale managed cards from the exported projection while leaving files outside the defined space discovery scope untouched.
- [ ] A filesystem failure leaves the previous destination recoverable and does not advance export metadata.
- [ ] After successful replacement, the repository records the exact exported revision.
- [ ] An edit committed during export leaves the space correctly marked as changed since export.
- [ ] Round-trip and integration tests cover deterministic output, importability, stale-card removal, unrelated-file preservation, failure safety, and export-revision races.

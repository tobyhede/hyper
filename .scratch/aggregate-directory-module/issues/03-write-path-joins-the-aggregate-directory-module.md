# 03 — Write path joins the Aggregate directory module

**What to build:** Writing an Aggregate directory uses the same module that
reads it. Obsolete Space-directory pruning and "destination is exportable"
checks are operations of that module. Discovery and byte-canonical helpers are
private. Export only orchestrates repository load, staging/replace, format
write/prune/assert, verify, and markExported. The rule that write removes
exactly what read scans has one home.

**Blocked by:** 01 — Export verify returns a structured refusal; 02 — Name
Aggregate directory and house the read + identify path.

**Status:** resolved

- [x] Space-directory and Aggregate-directory write live in
      `src/aggregate-directory/`, including prune-obsolete and
      assert-exportable-destination
- [x] Discovery and byte-canonical helpers are not part of the public surface;
      integration tests that hand-rolled directories use the module's write path
- [x] `src/export/canonical-space` is gone; export no longer reaches into a
      sibling package for discovery rules
- [x] Aggregate round-trip (export then import, obsolete directory removal,
      preserved undiscovered contents, deleted Thing files) stays green
- [x] Staging, symlink policy, replace-destination, and repository doors remain
      outside the format module

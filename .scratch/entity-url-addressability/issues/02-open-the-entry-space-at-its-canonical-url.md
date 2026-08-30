# 02 — Open the Entry Space at its canonical URL

**What to build:** The repository explicitly identifies one Entry Space. Visiting `/` temporarily redirects to that Space's canonical compact-UUID address, while any other Space can still be loaded independently as the root of its own navigation context. The Space chooser no longer exists.

**Blocked by:** 01 — Give Computed Views durable Space View IDs.

**Status:** resolved
Tags: release/v1

- [x] Repository bootstrap establishes one explicit Entry Space without inferring it from ordering or cardinality.
- [x] `/` redirects without adding a redundant client-history entry, and a missing Entry Space returns an actual HTTP 404.
- [x] A well-formed existing Space address opens directly; malformed compact IDs return 400 and unresolved IDs return an actual 404.
- [x] Product routes use the canonical 22-character base64url representation while domain and persistence boundaries retain canonical UUID spelling.
- [x] The Space chooser is retired and `pnpm verify` plus `pnpm e2e` pass.

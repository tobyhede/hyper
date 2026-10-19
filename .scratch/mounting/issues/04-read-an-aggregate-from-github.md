# 04 — Read an aggregate from GitHub

Status: ready-for-agent

**What to build:** the GitHub source. It turns a GitHub location into the path-to-bytes map that 01's core reads (ADR 0130).

- Parse `github:owner/repo@ref/path`. `ref` defaults to the repository's default branch and `path` to its root.
- A `ref` that is not a 40-character SHA is resolved to a commit with one REST call. The tree at that SHA is listed with one REST call (`git/trees/<sha>?recursive=1`). Only the paths Importing scans under `path` are kept, relative to `path`. Each one is fetched from `raw.githubusercontent.com/<owner>/<repo>/<sha>/<path>`.
- The source answers the resolved SHA along with the files, for 05 to pin.
- It never sends a token. A rate limit, a missing repository or ref, a truncated tree, a malformed location and a failed blob are distinct failures.
- `fetch` is injected at composition, never mocked globally (ADR 0109).

**Depends on:** 01, for which paths Importing scans.

**Acceptance:** tests over an injected `fetch` that answers the ref, tree and blob requests from `packages/app/fixture`. They cover default ref and path, ref resolution to a SHA, a SHA ref costing no resolution call, path scoping, files outside the scanned set never fetched, a truncated tree, and rate-limit, not-found and malformed-location failures.

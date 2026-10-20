# 04 — Read an aggregate from GitHub

Status: ready-for-agent

**What to build:** the GitHub source. It turns a GitHub location into the path-to-bytes map that 01's core reads (ADR 0130).

- Parse `github:owner/repo@ref/path`. `ref` defaults to the repository's default branch and `path` to its root. The ref runs from `@` to the next `/`, so it never contains `/`: a slashed branch is addressed by its commit SHA or a tag, and `github:owner/repo/path` selects a directory on the default branch.
- A `ref` that is not a 40-character SHA is resolved to a commit with one REST call. The tree at that SHA is listed with one REST call (`git/trees/<sha>?recursive=1`). Only the paths Importing scans under `path` are kept, relative to `path`. Each one is fetched from `raw.githubusercontent.com/<owner>/<repo>/<sha>/<path>`.
- The selected `path` must directly contain `hyper.json`; its directory is the base for every aggregate file. `hyper.json` names Meta and does not list files. Apply the existing Import discovery rules within that directory, without recursively searching for aggregates. Unrelated repository material and sibling aggregates are outside the mount.
- Only regular-file tree entries are read. A symbolic link (mode `120000`) and a submodule are left out, as the disk reader leaves out links. A Git LFS pointer is read as the pointer, so a picture stored with LFS is refused as not an image.
- Blobs are fetched with bounded concurrency, and one answered 429 or 5xx is retried once after its `Retry-After` or a short delay. A blob that still fails fails the mount, naming its path.
- The source answers the resolved SHA along with the files, for 05 to pin.
- It never sends a token. A rate limit, a missing repository or ref, a truncated tree, a malformed location and a failed blob are distinct failures.
- `fetch` is injected at composition, never mocked globally (ADR 0109).

**Depends on:** 01, for which paths Importing scans.

**Acceptance:** tests over an injected `fetch` that answers the ref, tree and blob requests from `packages/app/fixture`. They cover default ref and path, ref resolution to a SHA, a SHA ref costing no resolution call, path scoping, files outside the scanned set never fetched, a truncated tree, rate-limit, not-found and malformed-location failures, a slashed ref read up to its first `/`, a symbolic link left out, and a throttled blob retried once.

A mixed-repository fixture places the selected aggregate beside unrelated files, an unrelated directory and a second aggregate. Only the selected aggregate's scanned files are fetched, and it mounts normally. A missing `hyper.json` at the selected path is refused even when a descendant or sibling contains one.

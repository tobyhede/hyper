# 04 — Read an aggregate from GitHub

Status: resolved

**What to build:** the GitHub source. It turns a GitHub location into the path-to-bytes map that 01's core reads (ADR 0130).

- Parse `github:owner/repo@ref/path`. `ref` defaults to the repository's default branch and `path` to its root.
- A `ref` that is not a 40-character SHA is resolved to a commit with one REST call. The tree at that SHA is listed with one REST call (`git/trees/<sha>?recursive=1`). Only the paths Importing scans under `path` are kept, relative to `path`. Each one is fetched from `raw.githubusercontent.com/<owner>/<repo>/<sha>/<path>`.
- The selected `path` must directly contain `hyper.json`; its directory is the base for every aggregate file. `hyper.json` names Meta and does not list files. Apply the existing Import discovery rules within that directory, without recursively searching for aggregates. Unrelated repository material and sibling aggregates are outside the mount.
- The source answers the resolved SHA along with the files, for 05 to pin.
- It never sends a token. A rate limit, a missing repository or ref, a truncated tree, a malformed location and a failed blob are distinct failures.
- `fetch` is injected at composition, never mocked globally (ADR 0109).

**Depends on:** 01, for which paths Importing scans.

**Acceptance:** tests over an injected `fetch` that answers the ref, tree and blob requests from `packages/app/fixture`. They cover default ref and path, ref resolution to a SHA, a SHA ref costing no resolution call, path scoping, files outside the scanned set never fetched, a truncated tree, and rate-limit, not-found and malformed-location failures.

A mixed-repository fixture places the selected aggregate beside unrelated files, an unrelated directory and a second aggregate. Only the selected aggregate's scanned files are fetched, and it mounts normally. A missing `hyper.json` at the selected path is refused even when a descendant or sibling contains one.

## Answer

Built in `packages/app/src/mount/`, with no `node:` import:

- `github-location.ts`: `parseGitHubLocation(input)` reads `github:owner/repo[@ref][/path]` into `{ owner, repo, ref, path }` (`ref` undefined for the default branch, `path` `''` for the root) or a `malformed-location` failure. `formatGitHubLocation` writes a resolved location back as `github:owner/repo@<sha>[/path]`, for 05 to pin. A ref runs to the next `/`, so a ref that contains `/` is addressed by its SHA. `isCommitSha` tells a full 40-hex SHA.
- `github-source.ts`: `readGitHubAggregate(input, fetch)` answers `{ ok: true, aggregate: { location, files } }` or `{ ok: false, failure }`. `files` is a `ReadonlyMap<string, Uint8Array>` keyed by path relative to the selected directory, and `location` is the complete resolved location with its commit SHA. A non-SHA ref costs one `commits/<ref>` call, and the default branch is `commits/HEAD`. A SHA ref costs none. The tree is one `git/trees/<sha>?recursive=1` call, and each kept file is fetched from `raw.githubusercontent.com` at the SHA. The failures are `malformed-location`, `rate-limited` (403 or 429 with `x-ratelimit-remaining: 0`), `not-found` (404 or 422 from the API), `missing-aggregate-file` (the selected directory does not directly contain `hyper.json`), `truncated-tree`, `request-failed` (any other API status, an unparseable body, or no response) and `blob-failed` (naming the file). No credential is sent, and `fetch` is a parameter. Symbolic links and submodules in the tree are never kept.
- Which files are kept is `scannedAggregatePaths` from `@project/aggregate` (ticket 01), the same rule the disk shell scans by.

The tests are `packages/app/test/github-location.test.ts` and `packages/app/test/github-source.test.ts`, over an injected `fetch` that fakes GitHub from `packages/app/fixture`, including the mixed repository. "Mounts normally" is held as the selected aggregate's files equalling the tracked fixture's, because the mount seam (02) is not built yet.

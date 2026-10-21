# 10 — The GitHub source is an aggregate source

Status: ready-for-agent

**What to build:** the GitHub source becomes an `AggregateSource` (ticket 09), so a mount refuses a directory in the CLI's words and reports every file it could not read (ADR 0131).

- `readGitHubLocation` resolves the ref and lists the selected directory's tree, as today, and then answers either a GitHub failure or a source over that tree. Nothing is fetched yet. Its listing answers from the tree in memory, and its bound is 8 reads at once.
- Rate-limited, not-found, truncated-tree, request-failed and a malformed location stay GitHub failures with today's sentences.
- `missing-aggregate-file`, `blob-failed` and `blob-too-large` leave `GitHubSourceFailure`:
  - A directory without `hyper.json` is the reader's discovery refusal.
  - A blob that fails after its one retry is a file that could not be read, with the request's status as its reason.
  - A blob over 25 MiB by the tree's listed size is not fetched; it is a file that could not be read, its size as the reason.
- **Collect all.** The first failed blob no longer cancels the rest.
- **Throttle short-circuit.** Once a blob is still throttled after its retry (HTTP 429), every later read answers at once as unreadable ("not fetched: GitHub is throttling requests"), without a request.
- The mounted startup passes the source to `mountAggregate` and drops 09's interim `mapSource`. Its two failure sentences stay: a GitHub failure, or the mount refusal for anything the reader refuses.
- Symbolic-link entries (`120000`) stay unlisted, as today.

**Depends on:** 09. Hold until 07 is deployed and the talk's build is proven; land before the 2026-10-30 talk only with a week's margin.

**Acceptance:**

- GitHub over `packages/app/test/fake-github.ts` joins `READERS` in `test/unit/read-aggregate.test.ts`, answering every shared case with the diagnostics disk and map give.
- `github-source.test.ts` keeps its transport cases (rate limits, Retry-After, the one retry, the size cap, `<sha>:<path>` listing) and adds collect-all and the throttle short-circuit, with the number of requests counted.
- `pnpm e2e:mount` passes. Its rate-limited case is unchanged, and a mount missing a blob shows every unreadable file.

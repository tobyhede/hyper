# 10 — The GitHub source is an aggregate source

Status: resolved

**What to build:** the GitHub source becomes an `AggregateSource` (ticket 09), so a mount refuses a directory in the CLI's words and reports every file it could not read (ADR 0133).

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

## Answer

- **The source.** `readGitHubLocation` (`packages/app/src/mount/github-source.ts`) resolves the ref and lists the selected directory's tree as before, then answers `{ ok: true, aggregate: { location, source } }`, with nothing fetched. The source is named by the complete resolved location, allows 8 reads at once, and lists from the tree in memory: each regular blob and each subtree, symbolic links (`120000`) and submodules left out. A selected path the tree request answers as not found lists empty, so the reader refuses it as a directory without `hyper.json`, in the CLI's sentence `<location>/hyper.json: a canonical aggregate directory must contain hyper.json`.
- **The failures.** `GitHubSourceFailure` keeps `malformed-location`, `rate-limited`, `not-found`, `truncated-tree` and `request-failed` with their sentences, and drops `missing-aggregate-file`, `blob-failed` and `blob-too-large`. A read answers why it could not be fetched: `could not be fetched from GitHub: the request failed with HTTP <status>` (or `with no response`) after its one retry, `<size> bytes, over the 25 MiB a mounted file may be, so it is not fetched` by the tree's listed size, and `not fetched: GitHub is throttling requests` once a retry was still answered 429, checked before the first request, before waiting to retry, and again before the retry. Nothing cancels a read any more, so `Wait` takes no signal.
- **The startup.** `createMountedStartup` hands `read.aggregate.source` to `mountAggregate`, so its two sentences are a GitHub failure and `describeMountRefusal` over every diagnostic the reader collected.
- **Tests.** `test/unit/read-aggregate.test.ts`'s `READERS` adds the GitHub source over `packages/app/test/fake-github.ts`, which holds each case's files at the temporary directory's own path so the diagnostics name them as the disk's do. `github-source.test.ts` keeps the transport cases, reading through the reader and comparing with the fixture read from a `mapSource`, and adds collect-all (two missing blobs both reported, every other file requested once), the size cap (only the oversized file is not requested), and the throttle short-circuit, held exactly at the source (the second read makes no request) and through the reader (no more than the 8 reads in flight are requested, each with its one retry, and every other file is reported as not fetched). `mount.test.tsx` and `mount.spec.ts` show every file a mount could not read, and a directory without `hyper.json` in the reader's words. `editing-and-persistence.md`'s reader bullet names the GitHub source as the third source.

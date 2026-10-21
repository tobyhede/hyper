# 12 — Download an edited mounted talk

Status: needs-triage

**What to build:** a way to take an aggregate edited in a mounted page (ADR 0132) out of the browser, as a zip of its Aggregate directory that `pnpm hyper run` accepts.

- Export's writer lives under root `src/aggregate-directory/` and imports `node:` (`write-space-directory.ts`, `write-in-place.ts`, `space-directory.ts`, `aggregate-file.ts`). This needs a browser-safe core that renders an aggregate to a map of relative paths to bytes, with the filesystem shell writing that map, as the reader's core already does for Import (ADR 0130).
- The download offers the edited aggregate's files; the person commits them to the talk's repository themselves. Nothing writes to GitHub.

**Depends on:** 11.

**Open:** zip format and library, and whether the File System Access API is offered beside it in Chromium.

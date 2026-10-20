# 09 — Reconcile the Mounting docs with the contracts they touch

Status: ready-for-agent

**What to build:** one consistent answer from the contracts, the spec and ADR 0130 about Mounting. These are CodeRabbit's second-pass findings on #391, which were deferred so the stacked implementation would not have to be re-merged. All are docs only.

- **R18 names both boundaries that initialize.** `maps-and-graphs.md` R18 says one server-side boundary initializes. Since ADR 0130, the R16 note also has the mounted in-page host make the first-load Edit while it answers a read. R18 names both and keeps its rule for every other context.
- **The spec's CSP matches the build.** The spec gives `img-src blob:` for the static build. Ticket 06 and the built `_headers` give `img-src 'self' blob: data: https:`, because an Image Resource may show an external URL. The spec follows them.
- **ADR 0130 links what it refines.** Its "Exceptions this makes" section relaxes ADR 0069, ADR 0078 and ADR 0117, but its header names them only under `Related:`. It declares `Refines: 0069, 0078, 0117`, as ADR 0124 declares its own refinement of 0078 and 0117, and each of those three names 0130 in `Refined by:`.

**Depends on:** 01 to 07 merged to `main`, since every file this edits arrives with them.

**Acceptance:**

- R18, the spec's static-build CSP, ADR 0130's header and the three refined ADRs' headers read as above.
- `test/unit/adr-status-blocks.test.ts` passes, holding the new links reciprocal.
- Each of the three CodeRabbit threads on #391 (the Contents API limit, the spec's `img-src`, R18) has a reply naming the change and is resolved. The Contents API thread names #395's review fix, which lists a selected directory's tree as `<sha>:<path>` with no Contents lookup and so no 1,000-entry limit.

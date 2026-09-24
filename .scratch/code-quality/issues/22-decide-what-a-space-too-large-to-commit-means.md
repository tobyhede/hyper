# 22: Decide what a Space too large to commit means

**Priority:** P3 — a product limit the measurement found; this ticket takes a decision, not a fix

**Status:** needs-triage

**Blocked by:** None

**Problem:** every Edit sends the complete Space snapshot, and `MAX_COMMIT_BODY_BYTES` (`packages/http/src/index.ts`) refuses a body larger than 1 MiB with 413. A Space can grow until every commit to it is refused. After that, no further Edit to it can be saved, the Edits that would shrink it included, since each of those also sends the whole snapshot.

**Evidence (ticket 17, `scripts/persistence-cost/measure.ts`):** request bytes grow linearly with the Resources in the edited Space. Unrelated Spaces do not affect them. The largest Space whose Open commit fits in the limit:

| Markdown body length | bytes at N = 100 | bytes at N = 1000 | largest N accepted |
|---|---|---|---|
| empty | 29,328 | 292,222 | 3,568 |
| 600 characters | 87,836 | 876,329 | 1,196 |
| 4,000 characters | 427,836 | 4,276,329 | 245 |

The harness also sent a 1,500-Resource Space (1,315,039 bytes). It was answered 413 before any repository work.

**Decide:** whether the product states a supported Space size, and if so where the author learns of it. Other options are to refuse the Edit that would cross the limit locally, or to change what a commit carries. Ticket 17 ruled out adding a delta protocol, a cache or batching without a decision, so a change of that kind needs an ADR.

- [ ] The decision is recorded as an ADR or as a note on this ticket
- [ ] What the author sees when their Space reaches the limit is specified, or accepted as it is with the reason

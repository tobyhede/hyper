# 01 — Remove the unused Map and Graph deletion completions

**What to build:** Keep Map and Graph deletion on the coordinated Space Resource lifecycle alone, preserving the author's existing deletion, survivor selection and reference relocation behavior. Remove the unused Space Authoring deletion interface and migrate its useful test guarantees to the production path.

**Blocked by:** None — can start immediately.

**Status:** resolved — PR #336, `CI passed` green.

- [x] Remove `deleted-map` and `deleted-graph` from Space Authoring's completion vocabulary, implementation and embedded completion admissions, including the navigation fix-up that exists exclusively for deleted Graph completions.
- [x] Leave no compatibility, forwarding or alternative deletion path in Space Authoring. Existing production Map and Graph authoring commands continue to call the coordinated Space Resource lifecycle.
- [x] Preserve production survivor selection, atomic reference relocation, framing behavior, asynchronous outcomes and navigation reconciliation, consistent with ADR 0076 and ADR 0091. Do not reproduce obsolete single-Space behavior in the production lifecycle.
- [x] Remove the exclusively associated `space-must-keep-map` and `map-must-keep-graph` refusal identities, their presentation and exhaustive test fixtures. Preserve shared refusals such as `map-not-found` and `graph-not-owned` and avoid unrelated refusal cleanup.
- [x] Preserve the production distinction that last-Map/Graph deletion is unavailable through commands and unchanged through lifecycle planning when no successor exists; do not introduce the obsolete refusal outcomes there.
- [x] Account for useful assertions in the removed deletion tests: correct survivors, retained Resources and positions, ownership, target-canvas repair and preservation of unrelated canvas selection. Reuse existing production command/lifecycle coverage and add assertions only where a guarantee would otherwise be lost.
- [x] Keep stale Map and Graph capability tests, arranging the intervening deletion through the existing lifecycle and awaiting the state their assertions need.
- [x] Preserve the asynchronous Image Resource creation proof: delete its addressed Map through the lifecycle while measurement is pending, then verify resumed creation refuses `map-not-found` without changing the post-deletion snapshot.
- [x] Where deletion merely supplies an arbitrary embedded Edit to prove authoritative snapshot behavior, use a surviving embedded Edit and retain the later top-level Edit and intake-validity assertions.
- [x] Remove obsolete deletion rows from wrong-adapter test tables without weakening coverage of the remaining operations.
- [x] Remove the deleted Graph operation from the synchronous Space Authoring property generator. Keep its remaining intake-validity, snapshot-identity and no-throw guarantees; do not convert the suite to asynchronous lifecycle orchestration to retain an operation no longer on its interface.
- [x] Update live completion/refusal documentation and any affected current counts to match the reduced interface. Preserve accepted ADR bodies as historical records.
- [x] Verify that authored implementation and executable tests no longer construct or admit the removed completions or exclusively associated refusals. Historical documents may retain those spellings.
- [x] Run targeted local checks, including both TypeScript checks, affected lint and tests. Preserve behavior-level browser expectations. Run the full repository verification bar on a draft PR and observe its CI gate green before resolving the ticket.

## Scope

No new module, seam, deletion policy, schema change or broader authoring decomposition is needed. The ticket is independent of image replacement deepening and shared Map/Graph command binding; overlapping edits require integration care, not a blocking dependency.

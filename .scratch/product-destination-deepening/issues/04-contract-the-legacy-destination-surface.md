# 04 — Contract the legacy destination surface

**What to build:** Product-address meaning has one public home: the superseded destination surface and duplicated caller grammar are removed after both host and browser migrations are complete.

**Blocked by:** 02 — Migrate the HTTP host to product-destination resolution; 03 — Migrate browser startup to product-destination resolution.

**Status:** resolved

- [x] The superseded destination module and exports are removed from the domain package.
- [x] Host and browser callers contain no duplicate canonical Space or Space View parsing grammar.
- [x] Destination examples are tested at the new public interface, HTTP translation at the host seam and navigation through browser behaviour.
- [x] No Card, Graph, presentation, cross-Space or application-rendered error behaviour from later addressability tickets is introduced.
- [x] `pnpm verify` and `pnpm e2e` pass on the contracted tree.

## Answer

The legacy `core` Space View destination module, barrel export and tests are removed. `App` formats pushed addresses through the shared product formatter and restores popstate destinations by comparing that formatter's canonical output across the current Space's available Space Views; it owns no parsing grammar. A repository search finds the `/spaces` grammar only in `@project/http`'s private product-destination parser.

The new public-interface, host-translation and browser-routing suites carry the destination examples at their intended seams. No later entity destinations or error surfaces were added. `pnpm verify` passed with 157 files and 1,780 tests passed (8 skipped); `pnpm e2e` passed all 122 tests.

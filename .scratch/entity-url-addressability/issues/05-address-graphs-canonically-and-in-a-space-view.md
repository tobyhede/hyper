# 05 — Address Graphs canonically and in a Space View

**What to build:** A person can copy and open either a canonical Graph link or a link to that Graph in the current compatible Space View. Navigation establishes the Graph context without editing authored selections.

**Blocked by:** 03 — Address every Space View.

**Status:** resolved

- [x] A canonical Graph link opens its owning Layout and activates the Graph for navigation only.
- [x] A contextual Graph link establishes the named compatible Space View and Active Graph.
- [x] An incompatible or unresolved contextual combination returns an actual HTTP 404 rather than choosing another View or Graph.
- [x] Copy-link commands expose canonical and contextual meanings, and direct navigation, reload, Back and Forward preserve them.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Answer

`@project/http` now formats, parses and resolves canonical and contextual Graph destinations. Canonical resolution establishes the Graph's owning Layout, while contextual resolution validates that the named Space View can show the Graph; incompatible Layout-and-Graph combinations remain unresolved and receive a real HTTP 404.

The application translates resolved Graph destinations through the shared destination-opening core and applies the Space View plus Active Graph through one navigation publication, without authoring the Space. Graph activation pushes a contextual browser-history destination, and the Sidebar exposes distinct canonical and current-Space-View copy commands. Browser coverage proves direct navigation, reload, Back/Forward, activation history, exact copied URL shapes, a real incompatibility 404 and byte-identical stored state.

`pnpm verify` passed with 158 files and 1,804 tests passed (8 skipped). `pnpm e2e` passed all 130 tests, and `pnpm e2e:ladle` passed all 51 tests.

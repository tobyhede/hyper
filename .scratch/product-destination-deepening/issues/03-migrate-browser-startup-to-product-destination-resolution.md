# 03 — Migrate browser startup to product-destination resolution

**What to build:** Direct navigation and reload use the shared product-destination meaning and open the returned Space without a second backend load, preserving existing Space View selection behaviour.

**Blocked by:** 01 — Expand with deep product-destination resolution.

**Status:** resolved

- [x] Canonical Space and explicit Space View startup resolve through the shared product-destination interface.
- [x] Browser startup composes the resolved loaded Space without repeating the backend lookup.
- [x] Direct navigation and reload restore the same Space View without producing an Edit.
- [x] Browser history, Navigation installation and rendering remain outside the product-destination module.
- [x] Startup and browser tests cover their public seams, including one backend load, and `pnpm verify` plus `pnpm e2e` pass.

## Answer

Browser startup now resolves the pathname through `@project/http`, then composes the retained `LoadedSpace` through the new loaded-value opening operation. Canonical Space startup leaves renderer selection to Navigation; an explicit Space View installs that selection without authoring. Tests pin one backend load and zero lookups while composing an already-loaded value.

The contracted tree passed `pnpm verify` with 157 files and 1,780 tests passed (8 skipped), and `pnpm e2e` passed all 122 tests. The existing routing E2E continues to prove direct navigation, reload, Back/Forward and byte-identical stored state.

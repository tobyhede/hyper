# 01 — Expand with deep product-destination resolution

**What to build:** Canonical Space and explicit Space View addresses can be formatted, loaded and resolved through one browser-safe product-destination interface without changing existing host or browser behaviour.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] One formatter owns the canonical Space and explicit Space View route grammar.
- [x] One resolver classifies paths as outside product addressing, malformed, unresolved or resolved, while broken invariants throw.
- [x] Resolution loads the root Space through the existing shared `loadSpace` operation and retains the loaded Space in a resolved outcome.
- [x] Computed Views and Layouts resolve through the same Space View identity namespace, including collision detection.
- [x] Tests exercise worked canonical Space and Space View examples through the new public interface, and `pnpm verify` passes.

## Answer

`@project/http` now exports one browser-safe product-destination formatter and resolver for canonical Space and explicit Space View paths. The resolver uses only the existing structural `loadSpace` operation, retains the returned `LoadedSpace`, distinguishes outside, malformed, unresolved and resolved outcomes, and throws on a Computed View/Layout identity collision.

The public-interface suite covers literal canonical routes, both Space View variants, all semantic outcomes, one root load and collision detection. `pnpm verify` passed: 158 files, 1,784 tests passed and 8 skipped.

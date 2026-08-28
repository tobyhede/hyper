# 02 — Migrate the HTTP host to product-destination resolution

**What to build:** Direct product requests use the shared destination meaning, while the HTTP host translates outcomes into SPA fallback, bad request or not found without duplicating route grammar.

**Blocked by:** 01 — Expand with deep product-destination resolution.

**Status:** resolved

- [x] Canonical Space and explicit Space View requests resolve through the shared product-destination interface.
- [x] A path outside product addressing reaches the existing fallback, a malformed address returns 400 and an unresolved destination returns 404.
- [x] A resolved request loads its root Space once and reaches the SPA fallback.
- [x] Entry Space lookup and redirect remain owned by the host and keep their existing HTTP semantics.
- [x] Host tests cover only HTTP translation and adapter behaviour, and `pnpm verify` plus `pnpm e2e` pass.

## Answer

The HTTP host now delegates canonical Space and explicit Space View meaning to `resolveProductDestination`, translating only its semantic outcomes into Vite fallback, 400 or 404 responses. The root Entry Space lookup and 302 redirect remain a separate host operation, with its location formatted through the shared product formatter.

Socket-level host tests pin a single root load for a resolved Space View and no load for a path outside product addressing. `pnpm verify` passed with 158 files and 1,785 tests passed (8 skipped); `pnpm e2e` passed all 122 tests.

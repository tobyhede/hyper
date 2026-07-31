# A route minted by editing is set active explicitly

Status: resolved

The first edge drawn in a space with no routes mints the route it lands in (ADR 0021), and the same gesture converts the algorithmic arrangement into a positioned Layout (ADR 0025). The Layout that comes into existence names the route that came into existence with it, in that one write (ADR 0028).

Not "the fallback would pick it anyway". It would — one route, so first-visible is the same answer — but the fallback is a read and this is a write, and the two agreeing today is a coincidence of there being exactly one route.

Issue 04's first route-less completed connection now implements this requirement at the shared edit-completion seam.

## Acceptance criteria

- [x] The first completed connection in a route-less Space mints a Route with a fresh UUID.
- [x] The same completed Edit writes that Route id to the new Layout's `activeRoute` rather than relying on the first-visible fallback.
- [x] The minted Route becomes the runtime active Route and the complete snapshot persists once.

## Evidence

- `packages/app/src/edit-completion.ts` derives the minted Route id as the completed edit's `activeRouteId`, writes it explicitly through `updatePositionedLayout`, installs the validated Space and activates the Route in runtime state.
- `packages/app/test/completed-connection.test.ts` asserts the exact route-less snapshot, including `Route 1`, its first self-Edge and the new Layout's explicit `activeRoute`.
- `packages/app/e2e/new-space.spec.ts` observes `Route 1` in the active Route selector and legend, `Layout 1` selected, and persistence revision `1` after one first-connection gesture.
- Final verification on 2026-07-31: `mise exec -- pnpm verify` passed 63 test files and 526 tests; `mise exec -- pnpm e2e` passed 47 tests.

# 30 — Test a `map-not-found` refusal on Delete Map

**What to build:** An application test showing that a `map-not-found` Delete Map refusal appears as a standing notice and clears when the reader selects another Map.

**Blocked by:** None.

**Status:** resolved — the application test covers refusal display and navigation-driven clearing.

**Priority:** P3

**Why:** The existing application test already used a lifecycle spy to return `map-not-found` from Delete Map and proved the shell displayed the refusal. A command-outcome test separately proved that a Map change clears Map-scoped notices. The missing proof was that the same mounted application clears this particular notice when navigation selects another Map. The Command Dock withholds Delete on the last Map, and a real concurrent deletion race is unnecessary to test the resulting application behavior.

- [x] An application test returns `map-not-found` from Delete Map and asserts the refusal is shown while the current Map remains selected.
- [x] The same test selects another Map and asserts the notice clears without deleting either Map.

**Verification:** `pnpm exec vitest run packages/app/test/SpaceApp.test.tsx` — 32 tests passed.

# 08 — Enter and independently open a Space Card

**What to build:** A viewer can open a Space Card to see its selected Space View in place, enter it to adopt the target Space's complete command surface, return to the containing Space, or open the target independently at its canonical URL.

**Blocked by:** 02 — Open the Entry Space at its canonical URL; 04 — Address Cards canonically and in a Space View; 07 — Author a Space Card reference.

**Status:** ready-for-agent

- [ ] Opening embeds the Space Card's authored selection without changing the target Space's own active selections.
- [ ] Enter adopts the target Space command surface, and Back or Escape restores the containing Space context.
- [ ] Opening independently uses the target Space's canonical address and carries no containing navigation or presentation state.
- [ ] Browser Back, Forward and reload reproduce every addressable transition without producing an Edit.
- [ ] `pnpm verify`, `pnpm e2e` and the relevant Ladle E2E evidence pass.

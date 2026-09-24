# 06: Move the Dock's Spaces cluster into its own module

**What to build:** The Command Dock's Spaces cluster — the Space menu, the Opener and Open Spaces tree, and the exit report — in its own module. The Dock composes it.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] The cluster's module exports one component the Dock mounts. Any context it shares with other clusters lives in a shared Dock module, not in the Dock file
- [ ] No change in behaviour or appearance: stories, Ladle proofs and e2e unchanged
- [ ] UI catalog check passes with no new inventory entries
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green

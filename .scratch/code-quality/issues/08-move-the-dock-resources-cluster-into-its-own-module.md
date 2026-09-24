# 08: Move the Dock's Resources cluster into its own module

**What to build:** The Command Dock's Resources cluster — the create peers, the Resources trigger and list — in its own module. The Dock composes it.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] The cluster's module exports the component the Dock mounts. Shared disclosure context lives in a shared Dock module
- [ ] No change in behaviour or appearance: stories, Ladle proofs and e2e unchanged
- [ ] UI catalog check passes with no new inventory entries
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green

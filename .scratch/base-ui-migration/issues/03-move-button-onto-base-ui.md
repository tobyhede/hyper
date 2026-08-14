# 03 — Move Button onto Base UI

**What to build:** Move Hyper's shared Button onto the real Base UI Button primitive while preserving the variants, default button type, focus treatment and call-site behavior authors already use.

**Blocked by:** 01 — Configure shadcn workspaces for Base UI and Lucide.

**Status:** ready-for-agent

- [ ] Build the wrapper on the actual Base UI Button primitive rather than a hand-rolled render helper or native-button substitute.
- [ ] Preserve the current default, secondary and destructive meanings, disabled behavior, default `type="button"`, ref support and caller-supplied layout classes.
- [ ] Migrate every Button consumer whose props or composition change, checking each consumer before moving to the next.
- [ ] Confirm the migrated component and its consumers contain no Radix import, stale Radix composition prop or registry placeholder.
- [ ] Write the required Button migration report, including behavior changes and a short keyboard/focus manual-check list.
- [ ] Pass focused component and consumer tests, typecheck and the production build in a Button-only commit.

# 01 — Configure shadcn workspaces for Base UI and Lucide

**What to build:** Establish the non-disruptive foundation ADR 0050 requires: shadcn understands the app and shared UI as one monorepo arrangement, generates Base UI components into the shared package, and uses the agreed Nova, neutral, CSS-variable and Lucide choices while the live Radix wrappers continue to work.

**Blocked by:** None — can start immediately.

**Status:** resolved — delivered in PR #69.

- [ ] Record the clean-branch typecheck and production-build baseline before changing dependencies, including any pre-existing failure or warning.
- [ ] Give every participating workspace a shadcn configuration with matching `base-nova` style, `neutral` base colour, CSS-variable theming and Lucide icon library, with React Server Components disabled and TypeScript enabled.
- [ ] Make the workspace aliases and package exports route generated UI components, utilities and imports through the shared UI package without weakening the repository's package boundaries.
- [ ] Install Base UI and Lucide with pnpm alongside the existing Radix dependencies; do not remove or migrate a live wrapper in this ticket.
- [ ] Prove with shadcn project information and a non-writing component dry run that the CLI recognizes the configuration and selects the intended shared destination.
- [ ] Leave typecheck and the production build at least as green as the recorded baseline.

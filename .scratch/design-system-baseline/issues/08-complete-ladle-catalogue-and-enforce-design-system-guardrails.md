# 08 — Complete the Ladle catalogue and enforce design-system guardrails

**What to build:** Make Ladle a trustworthy catalogue of the real UI, then enforce the boundary that product components and styles come through the design system while React Flow retains only its necessary geometry and integration styling.

**Blocked by:** 02 — Replace the workspace toolbar with a Menubar; 03 — Recompose Card and Alias panes from form primitives; 04 — Bring workspace selection and operational feedback into the system; 05 — Make the production canvas Card a design-system component; 06 — Systematise Graph HUD and Edge authoring surfaces; 07 — Rebuild presentation chrome with design-system components.

**Status:** ready-for-agent

- [ ] Every production UI component has representative real-component Ladle stories for its meaningful states; no proposal-only story is presented as production evidence.
- [ ] Legacy feature-owned visual styling is removed or explicitly limited to React Flow geometry and integration requirements.
- [ ] Automated checks prevent new product UI components or styles from bypassing `@project/ui`, and the complete verification suite remains green.
- [ ] `$shadcn-first-ui` exists and is the mandatory production-UI workflow.
- [ ] Root `AGENTS.md` routes production UI work to that skill near the beginning of the file.
- [ ] `pnpm ui:catalog` deterministically exposes the public design-system inventory.
- [ ] `pnpm ui:catalog:check` is part of verification.
- [ ] Codex has project-scoped access to the official shadcn MCP server.
- [ ] App and React Flow adapter code cannot import Base UI, cmdk, Lucide, or `@project/ui` internals directly.
- [ ] `stories/components` contains only real production components.
- [ ] `stories/surfaces` contains real production compositions.
- [ ] `stories/review` is the only home for proposal-only UI.
- [ ] `stories/support` contains no product visual facsimiles.
- [ ] A custom replacement for existing shadcn/Base UI behavior requires an explicit documented deviation.
- [ ] Meaningful production component behavior is verified both in its component/story context and, where ownership boundaries interact, in the real application.

# 08 — Complete the Ladle catalogue and enforce design-system guardrails

**What to build:** Make Ladle a trustworthy catalogue of the real UI, then enforce the boundary that product components and styles come through the design system while React Flow retains only its necessary geometry and integration styling.

**Blocked by:** 02 — Replace the workspace toolbar with a Menubar; 03 — Recompose Card and Alias panes from form primitives; 04 — Bring workspace selection and operational feedback into the system; 05 — Make the production canvas Card a design-system component; 06 — Systematise Graph HUD and Edge authoring surfaces; 07 — Rebuild presentation chrome with design-system components.

**Status:** ready-for-agent

- [ ] Every production UI component has representative real-component Ladle stories for its meaningful states; no proposal-only story is presented as production evidence.
- [ ] Legacy feature-owned visual styling is removed or explicitly limited to React Flow geometry and integration requirements.
- [ ] Automated checks prevent new product UI components or styles from bypassing `@project/ui`, and the complete verification suite remains green.

# 05 — Make the production canvas Card a design-system component

**What to build:** Bring the real React Flow Card into the agreed design language for Markdown and Alias Cards, all interaction states, title editing and authoring actions, without changing graph placement or gesture semantics.

**Blocked by:** 01 — Establish the shadcn design-system baseline.

**Status:** ready-for-agent

- [ ] The production Card, rather than a Ladle-only facsimile, renders the accepted visual treatment for kinds and interaction states.
- [ ] Title editing, card editing, connection controls and handle visibility retain their existing keyboard, pointer and focus behaviour.
- [ ] React Flow geometry and handle contracts remain adapter-owned, while the Card's visual controls consume shared design-system components and tokens.

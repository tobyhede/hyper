# 06 — Systematise Graph HUD and Edge authoring surfaces

**What to build:** Give the graph key, minimap frame, selected-Edge controls and endpoint editing a coherent design-system surface without changing React Flow's spatial positioning, reconnection or deletion behaviour.

**Blocked by:** 01 — Establish the shadcn design-system baseline.

**Status:** ready-for-agent

- [ ] Graph legend, minimap framing, separators and status affordances use shared visual primitives and semantic tokens.
- [ ] The selected Edge toolbar and endpoint picker use shared button, popover and form patterns while preserving their active-Graph and focus rules.
- [ ] Ladle or focused component stories exercise the real HUD and Edge-control states independently of a live repository.

## Audit note

The branch updates shared pieces used by these surfaces, but it does not supply
focused production-component stories for the HUD, selected Edge toolbar,
endpoint editing, refusal and reconnection states. Those states remain in scope
here.

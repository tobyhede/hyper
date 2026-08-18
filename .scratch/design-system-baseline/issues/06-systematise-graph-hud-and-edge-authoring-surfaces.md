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

## Comments

### 2026-08-18 — the legend now has a second statement of the same facts

ADR 0053 gives the workspace Sidebar a Graphs group carrying every Graph's
title, colour and active state, which is what `GraphLegend` in the canvas HUD
already says. Issue 14 keeps the legend deliberately and does not decide its
future: it sits with the minimap as an on-canvas colour reference beside the
Edges being read, and removing it is a HUD decision. **This ticket owns that
call** — keep the legend, reduce it to what the sidebar cannot say, or drop it
and leave the minimap. Whichever it is, the two surfaces must not disagree
about colour or about which Graph is active.

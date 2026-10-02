# 07 — Cross-surface connections are refused and a surface never contains its own Map

**What to build:** Make a connection between Resources of two different surfaces an ordinary, worded connection refusal, and seed the nesting walk with the canvas's own Space and Map.

**Blocked by:** 04.

**Status:** ready-for-agent

**Spec:** `.scratch/a-map-is-a-map/spec.md` (decisions 12, 16). **Decision:** ADR 0112.

## Acceptance criteria

- [ ] A drag between Resources of two surfaces is refused by Edge Authoring with wording ("Edges join Resources in one Space"), shown like any other connection refusal.
- [ ] Connect to Resource offers only Resources of the selection's surface.
- [ ] The nesting walk starts with the root's own Space and Map on its path, so a Map that shows itself is drawn as a closed window, not once more.

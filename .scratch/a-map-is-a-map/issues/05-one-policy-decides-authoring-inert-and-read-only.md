# 05: One policy decides authoring, inert and read-only

**What to build:** Every drawn Map carries one policy — authoring, inert or read-only — computed once as the lower of an inherited ceiling and its local Read or Edit state, and everything that gates authoring reads it. Edit is offered only on a Space Resource in the canvas's own Map. A drawn Map never contains its own Map.

**Blocked by:** 01.

**Status:** ready-for-agent

**Spec:** `.scratch/a-map-is-a-map/spec.md`. **Decision:** ADR 0112.

- [ ] Read-only has exactly two sources: shown through a Reference Resource, or the Space is stale or retained, which draws its last working state with its own status.
- [ ] The ceiling only restricts: read-only passes to every Map drawn inside, and every Map below the first embedded level is inert at most.
- [ ] Edit is offered only on a Space Resource in the canvas's own Map; an authoring embedded Map can still open, close and move its own Space Resources, and what they draw is inert.
- [ ] Node interactivity, the Resource's read-only flag, the rail's offers and availability all derive from the policy, and no separate read-only check remains; a Reference embedding's Resources are read-only like any other.
- [ ] The nesting walk starts with the canvas's own Space and Map on its path, so a Map that shows itself is drawn as a closed window.
- [ ] A test enumerates, per policy, what a drawn Map offers.

# 02 — One policy decides authoring, inert and read-only

**What to build:** Replace the scattered read-only decisions with one policy value, `authoring | inert | read-only`, computed once where a Map is drawn and read by node flags, the rail, controls and gestures alike.

**Blocked by:** 01.

**Status:** ready-for-agent

**Spec:** `.scratch/a-map-is-a-map/spec.md` (decisions 2, 3, 5, 15). **Decision:** ADR 0112.

## Acceptance criteria

- [ ] Read-only has exactly two sources: shown through a Reference Resource, or the Space is stale or retained. Both produce the same value.
- [ ] `inert` is Read on an Open Space Resource; `authoring` is reached only through Edit on that Space Resource, from a surface that is itself `authoring`.
- [ ] The policy is inherited by every surface drawn inside one.
- [ ] Node `selectable`/`draggable`/`connectable`/`focusable`, `data.readOnly`, the rail's offers and availability all derive from the policy; no other read-only check remains (`embeddedAuthoringEnabled`, `canvas-projection`'s hard-coded `readOnly: false`, the stale-entry special case).
- [ ] A Reference embedding's Resources carry `read-only` like any other read-only surface.
- [ ] A test enumerates, per policy, what a surface offers.

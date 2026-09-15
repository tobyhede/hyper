# 02 — buildSpaceThingRail builder

**What to build:** One app function assembles everything a Space Thing rail needs — target choices, stored selection, context commands, portal wiring, and the rendered `spaceRail` node — so `canvas-thing-authoring` no longer spreads `spaceThingSelection` and `spaceThingContextCommands` in two steps inside the node map.

**Blocked by:** 01 — Space Thing rail slot

**Status:** resolved

- [x] A single builder (e.g. `buildSpaceThingRail`) returns the rail ReactNode plus any side-effect callbacks the decoration layer needs (`onEditingChange`, context notice reporter), given target, document, availability, and the existing coordinated command dependencies.
- [x] `canvas-thing-authoring` calls the builder once per Space Thing node instead of inline spread assembly.
- [x] No second public surface for Diagram/Graph commands — `space-thing-context-commands` remains the command source the builder calls.
- [x] `pnpm verify` passes; no behaviour change beyond structure — existing Space Thing rail proofs stay green.

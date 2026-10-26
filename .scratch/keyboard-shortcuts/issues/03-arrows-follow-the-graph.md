# 03: Arrow keys follow the Active Graph by direction

Status: resolved

**What to build:** An arrow key moves the selection to the Active Graph neighbour (an Edge either way) whose centre lies in that direction, choosing the smallest angle from the pressed axis. Nothing that way does nothing. Plain-arrow nudging moves to `Shift`+arrow. A pure function in `graph` picks the neighbour from positions so it is property-tested.

**Acceptance:** unit tests on the picker (ties, forks, no candidate); Playwright: → follows a rightward Edge, Shift+→ nudges.


## Answer

`graphNeighbours` and `neighbourToward` (`packages/app/src/graph-navigation.ts`) pick the Active Graph neighbour, by an Edge either way, whose centre is within 45° of the pressed axis. The one nearest the axis wins, then the nearer one. `SpaceCanvas` answers `CANVAS_KEYS.navigateLeft/Right/Up/Down` in the wrapper's capture phase, from the drawn nodes' screen boxes, and spends a plain arrow on a focused Resource even when nothing lies that way, so it never nudges. Shift and an arrow reaches React Flow's own nudge, four steps at a time (`CANVAS_KEYS.nudge` declares it). Proved by `packages/app/e2e/keyboard-shortcuts.spec.ts`.

Not done: a Map drawn inside a Space Resource still nudges on a plain arrow, as Tab does not walk there either.

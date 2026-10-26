# 02: Tab walks the Active Graph

Status: resolved

**What to build:** With a Resource selected, `Tab` selects and focuses the next Resource along the Active Graph's first outgoing Edge, `Shift+Tab` the previous along an incoming Edge. With none, the key is left to the browser so focus leaves the canvas. The camera keeps the new selection in view.

**Acceptance:** Playwright walks a fixture Graph end to end with Tab and back with Shift+Tab, and Tab at the end leaves the canvas.


## Answer

`stepAlongGraph` (`packages/app/src/graph-navigation.ts`) picks the next Resource along the Active Graph's Edges: the first outgoing one forward, the first incoming one back. `SpaceCanvas`'s wrapper handler answers `CANVAS_KEYS.navigateForward`/`navigateBack` only when the Resource node itself has focus, so a Tab on one of its controls moves through them as usual. It selects and focuses the next node, and React Flow's `autoPanOnNodeFocus` brings it into view. With no next Resource the key stays the browser's, and so it does when the next one is a Resource this run of presses has already reached (`nextTabStop`), so a cyclic Graph, or a Resource with an Edge to itself, lets focus leave after one lap. A run goes on while each press starts where the last ended and goes the same way. Only the canvas's own Map walks: a Map drawn inside a Space Resource does not yet. Proved by `packages/app/e2e/keyboard-shortcuts.spec.ts`.

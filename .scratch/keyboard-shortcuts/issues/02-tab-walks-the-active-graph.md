# 02: Tab walks the Active Graph

Status: wontfix

**What to build:** With a Resource selected, `Tab` selects and focuses the next Resource along the Active Graph's first outgoing Edge, `Shift+Tab` the previous along an incoming Edge. With none, the key is left to the browser so focus leaves the canvas. The camera keeps the new selection in view.

**Acceptance:** Playwright walks a fixture Graph end to end with Tab and back with Shift+Tab, and Tab at the end leaves the canvas.


## Answer

Not built: Tab stays the browser's. A walk on Tab takes the key that reaches a selected Resource's rail, which is one tab stop after it (ADR 0073), and Escape, the walk's way off, unselects the Resource and so hides the rail: from any selected Resource with a next one, the keyboard could not reach its commands. Stopping the walk on each rail, or a chord into the rail, were both considered and refused. Walking the Active Graph is the arrow keys' instead, from a selected Resource (ticket 03).

# 02: Tab walks the Active Graph

Status: ready-for-agent

**What to build:** With a Resource selected, `Tab` selects and focuses the next Resource along the Active Graph's first outgoing Edge, `Shift+Tab` the previous along an incoming Edge. With none, the key is left to the browser so focus leaves the canvas. The camera keeps the new selection in view.

**Acceptance:** Playwright walks a fixture Graph end to end with Tab and back with Shift+Tab, and Tab at the end leaves the canvas.


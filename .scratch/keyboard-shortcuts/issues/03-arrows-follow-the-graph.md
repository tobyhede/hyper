# 03: Arrow keys follow the Active Graph by direction

Status: ready-for-agent

**What to build:** An arrow key moves the selection to the Active Graph neighbour (an Edge either way) whose centre lies in that direction, choosing the smallest angle from the pressed axis. Nothing that way does nothing. Plain-arrow nudging moves to `Shift`+arrow. A pure function in `graph` picks the neighbour from positions so it is property-tested.

**Acceptance:** unit tests on the picker (ties, forks, no candidate); Playwright: → follows a rightward Edge, Shift+→ nudges.


# 07 — Connect from the keyboard

Status: ready-for-agent

**What to build:** A Connect icon on a Resource's toolbar that opens `ResourcesPopover` (the Dock's Resources list), reused with row dragging disabled and its Spaces source off, over the Map's **placed** Resources bar this one. Refused ones stay listed, disabled, with their reason, through the same Edge eligibility pointer Connect uses. A final "New Resource" row creates a Markdown Resource beside this one and connects to it — the keyboard form of Alt-drop. The Edge is created in the Active Graph, from this Resource to the chosen one; focus then lands on the new Edge, selected, so Enter reaches its toolbar.

**Why:** With reconnect dropped, drawing an Edge is the one way to change one, and it must be reachable without a pointer (ADR 0073). A keyboard connect existed (`keyboard-connect` draft, a "Connect to" combobox) and went out in `1212feb88` with the expanded-cards integration, apparently as collateral; `70c60e4fc` holds its tests.

- [ ] `ResourcesPopover` today lists what the Map does **not** place; Connect needs it over placed Resources, with dragging and the Spaces source off. Unplaced Resources are not offered — placing and connecting in one Edit is out of scope.
- [ ] The kind filters and search carry over.
- [ ] AGENTS.md's "Choosing a Resource has one component" note, which names `ResourceSearchCombobox`, is updated to say which surface chooses a Connect target.

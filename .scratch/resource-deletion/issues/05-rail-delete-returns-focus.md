# 05 — The rail's Delete from Space returns focus somewhere

Status: ready-for-agent

**What to build:** After Cancel or Confirm on a Delete from Space armed from a Resource's Actions menu, the caret lands on a live element: on Cancel the Resource's `Actions for Resource <name>` trigger; on Confirm (the Resource and its rail are gone) the canvas pane, or wherever the canvas continuation already puts the caret after a completed Edit.

**Why:** Both answers currently leave focus on `body`. The confirmation's rule (PR #325) returns focus to its opener while it is in the document, otherwise to the arming surface's fallback — but the rail's opener is a menu item that closed before the dialog opened, and the rail names no fallback because `useResourceRailActions` arms without a reference to the Actions trigger.

## Build

- [ ] The rail passes a focus fallback to `resourceDeletion.arm`, resolved at close time (the trigger may be gone on Confirm).
- [ ] No change to the Resources list's behaviour.

## Tests

- [ ] Application: rail Delete then Cancel focuses the Actions trigger; rail Delete then Confirm focuses a live element, not `body`. Both fail on the current code.

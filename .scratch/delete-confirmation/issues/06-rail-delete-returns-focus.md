# 06: The rail's Delete from Space returns focus

**What to build:** After Delete from Space armed from a Resource's Actions menu, the caret lands on a live element. On Cancel it returns to the Resource's Actions trigger; on Confirm, when the Resource and its rail are gone, it lands where the canvas already puts the caret after a completed Edit. Today both answers leave focus on the page body, because the menu item that opened the question has closed and the rail names no fallback.

**Blocked by:** 01 — One delete confirmation for every kind of subject

**Status:** ready-for-agent

- [ ] Rail Delete then Cancel focuses the Resource's Actions trigger.
- [ ] Rail Delete then Confirm focuses a live element, not the page body.
- [ ] Both are proved by tests that fail on the current code.
- [ ] The Resources list's focus behaviour is unchanged.

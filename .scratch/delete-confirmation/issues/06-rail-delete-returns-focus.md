# 06: The rail's Delete from Space returns focus

**What to build:** After Delete from Space armed from a Resource's Actions menu, the caret lands on a live element. On Cancel it returns to the Resource's Actions trigger; on Confirm, when the Resource and its rail are gone, it lands where the canvas already puts the caret after a completed Edit. Today both answers leave focus on the page body, because the menu item that opened the question has closed and the rail names no fallback.

**Blocked by:** 01 — One delete confirmation for every kind of subject

**Status:** done

- [x] Rail Delete then Cancel focuses the Resource's Actions trigger.
- [x] Rail Delete then Confirm focuses a live element, not the page body.
- [x] Both are proved by tests that fail on the current code.
- [x] The Resources list's focus behaviour is unchanged.

**Note:** In Chromium, Cancel already landed on the Actions trigger before this change: the menu returns focus to its trigger as it closes, so the primitive's own return rule found it. The Cancel half fails on the old code in `resource-rail-actions.test.tsx` (jsdom) and not in the browser; the Confirm half fails on the old code in both. The Confirm failure had a second cause besides the missing fallback: pressing Delete disables the button holding the caret, which drops focus on `body`, and Base UI then does not focus an HTML element `finalFocus` hands back — so `DeleteConfirmation` now focuses every return target itself.

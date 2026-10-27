# 05: Open and expand

Status: resolved

**What to build:** `Shift+Enter` (and an Actions-menu item) submits one Edit that Opens the Resource and Resizes it to fit its content, capped at the visible canvas area at the current zoom, never below the Closed Size, displacing as a Resize does (R40 to R43). The camera then frames it. Write an ADR refining ADR 0122 (R38: only an explicit Open-and-expand Edit both Opens and sizes; A17 still holds for Open) and update `docs/agents/maps-and-graphs.md` in the same change.

**Acceptance:** snapshot-edit tests for the combined Edit; Playwright: Shift+Enter on a long Markdown Resource opens it larger and neighbours move.


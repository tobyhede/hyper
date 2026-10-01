# 03: Delete Graph asks first

**What to build:** Delete Graph in the Dock's Graph menu opens the delete confirmation instead of running at once. It asks `Delete {Graph} From {Map}?` and says the Graph and its Edges are permanently deleted. Delete runs the existing Graph deletion; Cancel and Escape run nothing and return focus to where Delete Graph was pressed.

**Blocked by:** 01 — One delete confirmation for every kind of subject

**Status:** done

- [x] Delete Graph asks before it runs, with the title and description above.
- [x] Delete runs the existing deletion and the Active Graph moves to the survivor as today; a refusal still reports.
- [x] Cancel and Escape leave the Graph and its Edges in place.
- [x] Existing Delete Graph journeys pass through the confirmation.

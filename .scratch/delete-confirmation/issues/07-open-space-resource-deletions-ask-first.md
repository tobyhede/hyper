# 07: An Open Space Resource's Delete Map and Delete Graph ask first

**What to build:** The Delete Map and Delete Graph rows an Open Space Resource offers for the Map and Graph it shows open the delete confirmation instead of running at once, with the same questions the Dock's rows ask (tickets 02 and 03). Cancel and Escape run nothing and return focus to where the row was pressed.

**Blocked by:** 02, 03

**Status:** done

- [x] An Open Space Resource's Delete Map asks `Delete {Map} From Space?` before it runs.
- [x] An Open Space Resource's Delete Graph asks `Delete {Graph} From {Map}?` before it runs.
- [x] Cancel and Escape leave the Map or Graph in place and return focus to the Resource's rail.
- [x] The journeys in `packages/app/e2e/space-resource-context-menu.ts` and `space-resource.spec.ts` that delete an embedded Map or Graph pass through the confirmation.

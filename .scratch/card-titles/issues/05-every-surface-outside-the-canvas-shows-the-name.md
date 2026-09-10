# 05 — Every surface outside the canvas shows the name

Status: ready-for-agent
Blocked by: 02

**What to build:** Move every surface that lists or refers to a Card onto
`titleName`, and make `CardSearchCombobox` filter on the whole Title while
displaying the name.

**Why:** The Card front is the only place a Title is more than a name. Every
other surface renders a Title into a row, a trigger or an accessible name, and a
newline reaching one of those is a bug that shows up as a broken-looking label
rather than as an error.

- [ ] The Space Sidebar's Card rows, `GraphHud`, presenting chrome, the Space
      Card selectors, `CardsDrawer` and the Cards listed as Edge endpoints all
      show `titleName`.
- [ ] Every `aria-label` built from a Card Title uses `titleName` — including
      `CanvasCard`'s own labels on the Card, its actions menu, its Open/Close
      control and its Title edit control. The full ladder stays available as the
      heading's visible text; a screen reader hearing three lines as one
      control's name is worse than hearing the name and reading the rest.
- [ ] `CardSearchCombobox` filters on the whole Title and displays `titleName`.
      That needs the primitive's filter separated from `itemToStringLabel`,
      which currently does both jobs with one string. An author who remembers a
      word from a Card's subtitle finds the Card.
- [ ] `nextCardTitle` in `packages/app/src/titles.ts` scans first lines, so a
      Card named `Card 3` followed by other lines still occupies 3.
- [ ] Nothing outside `packages/ui/src/CanvasCard.tsx` and the render adapter
      reads a Title's later lines. A test holds that: no `split('\n')` and no
      `titleLines` call outside the Card front and `@project/core`.

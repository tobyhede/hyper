# 05 — Every surface outside the canvas shows the name

Status: resolved
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
- [x] Every `aria-label` built from a Card Title uses `titleName` — including
      `CanvasCard`'s own labels on the Card, its actions menu, its Open/Close
      control and its Title edit control. The full ladder stays available as the
      heading's visible text; a screen reader hearing three lines as one
      control's name is worse than hearing the name and reading the rest.
- [x] `CardSearchCombobox` filters on the whole Title and displays `titleName`.
      That needs the primitive's filter separated from `itemToStringLabel`,
      which currently does both jobs with one string. An author who remembers a
      word from a Card's subtitle finds the Card.
- [x] `nextCardTitle` in `packages/app/src/titles.ts` scans first lines, so a
      Card named `Card 3` followed by other lines still occupies 3.
- [x] Nothing outside `packages/ui/src/CanvasCard.tsx` and the render adapter
      reads a Title's later lines. A test holds that: no `split('\n')` and no
      `titleLines` call outside the Card front and `@project/core`.

## Answer

`49cbff89`. **One checkbox is left open deliberately — see below.**

The Sidebar's Card rows and their menus, presenting chrome (`Move.title`), the Cards drawer's row labels and ordering, Edge accessible names, the copy-address menus, the `card-has-aliases` refusal and `CardContent`'s presented heading all read `titleName`. `nextCardTitle` scans first lines, so a Card named `Card 3` followed by other lines still occupies 3, and a *later* line spelling `Card 9` claims no number. `CardSearchCombobox` filters the whole Title and displays the name, through a `filter` prop built from Base UI's own `useComboboxFilter` — proven to bite: deleting the prop turns the "finds the Card by a word from a line below the name" test red.

`GraphHud` and the Space Card selectors were checked and carry no Card Title at all — they list Graphs and Layouts, single-line by ADR 0083. Both are commented in place so the next reader does not re-check them.

`test/unit/title-lines-containment.test.ts` scans every `packages/*/src` tree for a newline split or a `titleLines` call, permits only `core/src/title.ts`, `ui/src/CanvasCard.tsx` and the render adapter, self-tests both regexes, and asserts its one file exemption still earns itself. It does not scan `scripts/`, `stories/`, `e2e/` or `ladle-e2e/` — deliberate and documented at the top of the file.

### The open checkbox: the Cards drawer's rows

The first checkbox says `CardsDrawer` shows `titleName`. Its **row label and ordering** do. Its rows also **draw a real `CanvasCard`**, which draws the ladder, because it is a Card front and ADR 0083 says the front draws the ladder wherever it is mounted. That is defensible and may well be right, but it is not what the checkbox says, so the box stays open rather than being ticked over a deviation. **Decide it explicitly**: either the drawer stops embedding a Card front, or this checkbox is reworded.

### One defect found in review and not fixed

`CanvasCard.tsx` puts `aria-label={name}` on the `role="heading"` element. That label is what stops a screen reader reaching the lines below the name — contradicting the intent stated in the comment three lines above it ("A reader who wants the rest reads the heading"). Removing it would let the heading take its name from the visible ladder while every *control* keeps the single-line name. It was left alone because ADR 0083's "and every accessible name" arguably mandates the current code, and changing it changes what is announced. **This needs a decision, not a patch.**

### Verification

`pnpm verify` exit 0 (203 files, 2464 passed | 2 skipped), `pnpm e2e` exit 0 (160 passed), `pnpm e2e:ladle` exit 0 (81 passed) — all on the integrated branch, not on this ticket alone.

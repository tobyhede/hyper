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

- [x] The Space Sidebar's Card rows, `GraphHud`, presenting chrome, the Space
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

### The Cards drawer: no fix required

The first checkbox names `CardsDrawer`. Its **row label and ordering** read `titleName`. Its rows also **draw a real `CanvasCard`**, which draws the ladder, because it is a Card front and ADR 0083 says the front draws the ladder wherever it is mounted.

That deviation was raised and **decided: no fix**. The Cards drawer is being removed by `.scratch/*/07-promote-the-dock`, so a surface that is going away does not earn either a rewording of this checkbox or a change to how it draws. The box is ticked on that basis, not because the drawer draws the name.

### The heading's accessible name — attempted, reverted, needs a new decision

Review found `aria-label={name}` on the `role="heading"` element. A label replaces an element's accessible name, so that label is what stops a screen reader reaching the lines below the name — contradicting the comment three lines above it, which says a reader can read the heading to get them.

Removing the label was decided and tried. **It does not work, and the reason is structural.** ADR 0065 puts the Title's one-activation control *inside* the heading, wrapping the whole Title, and that control carries `aria-label={`Edit Title ${name}`}`. With no label of its own, the heading computes its name from its one child — the control — so it is named `Edit Title <name>` rather than by the Title Lines it draws. Playwright's snapshot says it plainly:

```
- heading "Edit Title Elsewhere" [level=2]:
  - button "Edit Title Elsewhere":
    - generic: Elsewhere
```

111 E2E tests failed, every one of them a `getByRole('heading', { name })` lookup. jsdom did not catch it: `toHaveAccessibleName` there resolved the ladder text, so the unit suite stayed green and only a real browser disagreed. **Any future attempt at this must be proved in `e2e` or `ladle-e2e`, not in a unit test.**

Reverted. The heading keeps `aria-label={name}` and the code comment above it remains inaccurate about what a reader can reach.

The three options that remain, none of them free:

1. **Keep the label.** The heading announces the name. The lines below it are drawn but are not separately announced. This is what is in the tree.
2. **Take the label off the control instead**, so it is named by its content and the heading inherits the Title Lines. This gives a *control* a name of up to N lines, which is the case ADR 0083's rule exists to prevent, and it changes every `Edit Title <name>` lookup.
3. **Move the control out of the heading**, so the heading holds only text. This is a change to ADR 0065's shape — the control covers the whole Title and claims only the pixels it draws — and it means hand-rolled positioning, which ADR 0047 and ADR 0050 make a last resort.

### Verification

`pnpm verify` exit 0 (203 files, 2464 passed | 2 skipped), `pnpm e2e` exit 0 (160 passed), `pnpm e2e:ladle` exit 0 (81 passed) — all on the integrated branch, not on this ticket alone.
